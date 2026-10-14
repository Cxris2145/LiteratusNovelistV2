"""Offline portrait manifests and deliberately opt-in, resumable image imports.

No image provider is called here. Narrative fields remain curation metadata and
are never copied to a generation prompt.
"""

import hashlib
import io
import json
import os
from pathlib import Path
import unicodedata
import uuid
import warnings

from django.conf import settings
from django.db import DatabaseError, transaction
from django.test.utils import override_settings
from django.utils import timezone
from PIL import Image, ImageOps, UnidentifiedImageError
import requests

from ai_engine.models import AIAvatar
from core.storage import SUPABASE_BUCKET, upload_to_supabase_if_configured


SCHEMA_VERSION = 1
STYLE = (
    "Semi-realistic illustrated literary portrait, consistent painted style, "
    "centered face, single subject, bust composition, dignified neutral pose, "
    "dark navy blue background, warm bronze lighting, clear facial features. "
)
NEGATIVE = (
    "No text, letters, captions, border, watermark, signature, plot scenes, "
    "injuries, transformations or revelations. Do not depict narrative events."
)
PROFILE_FIELDS = (
    "appearance", "age", "species", "facial_features", "hair", "eyes",
    "clothing", "era", "expression", "pose", "props",
)


class PortraitError(ValueError):
    pass


def database_fingerprint():
    """Identify a destination without exporting credentials or connection URLs."""
    database = settings.DATABASES["default"]
    identity = {key: str(database.get(key, "")) for key in ("ENGINE", "HOST", "PORT", "NAME", "USER")}
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()


def normalize_name(value):
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def author_for_avatar(avatar):
    if not avatar.is_author:
        return None
    matches = [
        author for author in avatar.edition.book.authors.all()
        if normalize_name(author.full_name) == normalize_name(avatar.name)
    ]
    return matches[0] if len(matches) == 1 else None


def identity_for_avatar(avatar, author=None):
    if avatar.is_author:
        author = author or author_for_avatar(avatar)
        # An unmatched or ambiguous real person must not merge by name alone.
        return f"author:{author.pk}" if author else f"avatar:{avatar.pk}"
    return f"character:{avatar.edition.book_id}:{normalize_name(avatar.name)}"


def clean_profile(profile):
    if profile is None:
        return {}
    if isinstance(profile, str):
        profile = {"appearance": profile}
    if not isinstance(profile, dict) or set(profile) - set(PROFILE_FIELDS):
        raise PortraitError("El perfil solo admite rasgos visuales aprobados: " + ", ".join(PROFILE_FIELDS))
    result = {}
    for key, value in profile.items():
        if not isinstance(value, str) or len(value) > 2000:
            raise PortraitError(f"Perfil visual inválido: {key} debe ser texto de hasta 2000 caracteres.")
        if value.strip():
            result[key] = value.strip()
    return result


def portrait_prompt(avatar, profile):
    kind = "historical author" if avatar.is_author else "literary character"
    subject = f"Portrait of the {kind} {avatar.name}, associated with {avatar.edition.book.title}. "
    details = " ".join(f"{key.replace('_', ' ')}: {value}." for key, value in profile.items())
    return STYLE + subject + details + " " + NEGATIVE


def contained_path(root, relative):
    """Accept relative paths only, including Windows-safe checks on any host."""
    if not isinstance(relative, str) or not relative.strip():
        raise PortraitError("La ruta de imagen debe ser relativa a --images-root.")
    if "\\" in relative or ":" in relative or relative.startswith("/"):
        raise PortraitError("La ruta de imagen debe ser relativa, con separadores '/'.")
    path = Path(relative)
    if ".." in path.parts or path.is_absolute():
        raise PortraitError("La imagen sale de la carpeta autorizada.")
    resolved_root = Path(root).resolve()
    resolved_path = (resolved_root / path).resolve()
    if not resolved_path.is_relative_to(resolved_root):
        raise PortraitError("La imagen sale de la carpeta autorizada.")
    return resolved_path


def verified_image(path):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as source:
                if source.width < 64 or source.height < 64 or source.width * source.height > 25_000_000:
                    raise PortraitError("La imagen debe tener al menos 64×64 y hasta 25 millones de píxeles.")
                if getattr(source, "is_animated", False):
                    raise PortraitError("El retrato debe ser una imagen estática.")
                source.verify()
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise PortraitError("Archivo de imagen inválido o demasiado grande.") from exc


def webp_bytes(path):
    verified_image(path)
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source)
        image = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
        image.thumbnail((768, 1024), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=90, method=6)
        return output.getvalue()


def existing_image_status(value):
    if not value:
        return {"path": "", "local_status": "empty"}
    if value.startswith(("http://", "https://")):
        return {"path": value, "local_status": "external_unchecked"}
    try:
        path = contained_path(settings.MEDIA_ROOT, value)
        if not path.is_file():
            return {"path": value, "local_status": "missing"}
        verified_image(path)
    except PortraitError:
        return {"path": value, "local_status": "invalid"}
    return {"path": value, "local_status": "valid"}


def export_manifest(avatars=None, profiles=None):
    profiles = profiles or {}
    if not isinstance(profiles, dict):
        raise PortraitError("--profiles debe contener un objeto JSON por UUID o identity_key.")
    avatars = avatars if avatars is not None else AIAvatar.objects.all()
    avatars = avatars.select_related("edition__book").prefetch_related("edition__book__authors").order_by("id")
    records = []
    for avatar in avatars:
        author = author_for_avatar(avatar)
        identity = identity_for_avatar(avatar, author)
        profile = clean_profile(profiles.get(str(avatar.pk), profiles.get(identity)))
        records.append({
            "avatar_id": str(avatar.pk),
            "name": avatar.name,
            "edition_id": str(avatar.edition_id),
            "book_id": str(avatar.edition.book_id),
            "book_title": avatar.edition.book.title,
            "is_author": avatar.is_author,
            "identity_key": identity,
            "catalog_author": ({"id": str(author.pk), "name": author.full_name, "photo": author.photo.name or ""} if author else None),
            "description": avatar.description,
            "behavioral_context": avatar.behavioral_context,
            "unlock_at_chapter": avatar.unlock_at_chapter,
            "existing_image": existing_image_status(avatar.avatar_image.name or ""),
            "appearance_profile": profile,
            "profile_status": "curated" if profile else "needs_appearance_review",
            "prompt": portrait_prompt(avatar, profile),
            "output_image": None,
            "status": "existing" if avatar.avatar_image else "pending",
        })
    return {
        "schema_version": SCHEMA_VERSION,
        "created_at": timezone.now().isoformat(),
        "database_fingerprint": database_fingerprint(),
        "style": "semirealistic-navy-bronze-v1",
        "avatars": records,
    }


def validate_manifest(manifest):
    if not isinstance(manifest, dict) or manifest.get("schema_version") != SCHEMA_VERSION:
        raise PortraitError("Versión de manifiesto no soportada.")
    records = manifest.get("avatars")
    if not isinstance(records, list):
        raise PortraitError("El manifiesto debe contener avatars[].")
    seen = set()
    for record in records:
        if not isinstance(record, dict):
            raise PortraitError("Cada registro debe ser un objeto.")
        try:
            canonical_id = str(uuid.UUID(record["avatar_id"]))
            uuid.UUID(record["edition_id"])
            uuid.UUID(record["book_id"])
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise PortraitError("Cada registro requiere UUID de avatar, edición y libro.") from exc
        if canonical_id in seen:
            raise PortraitError("El manifiesto repite un UUID de avatar.")
        seen.add(canonical_id)
        if not isinstance(record.get("identity_key"), str) or not record.get("identity_key"):
            raise PortraitError("Falta identity_key.")
        if not isinstance(record.get("name"), str) or not isinstance(record.get("is_author"), bool):
            raise PortraitError("Cada registro requiere nombre e is_author.")
        if record.get("output_image") is not None and not isinstance(record["output_image"], str):
            raise PortraitError("output_image debe ser una ruta relativa o null.")
    return records


def _upload_verified(data, media_path):
    base = getattr(settings, "SUPABASE_URL", None) or os.getenv("SUPABASE_URL")
    key = (getattr(settings, "SUPABASE_SERVICE_KEY", None) or os.getenv("SUPABASE_SERVICE_KEY")
           or getattr(settings, "SUPABASE_KEY", None) or os.getenv("SUPABASE_KEY"))
    if not base or not key:
        raise PortraitError("--upload requiere SUPABASE_URL y SUPABASE_SERVICE_KEY o SUPABASE_KEY.")
    url = f"{base.rstrip('/')}/storage/v1/object/public/{SUPABASE_BUCKET}/{media_path}"

    def matches():
        try:
            response = requests.get(url, timeout=30)
            return response.status_code == 200 and hashlib.sha256(response.content).digest() == hashlib.sha256(data).digest()
        except requests.RequestException:
            return False

    if matches():
        return "already_uploaded"
    # The existing helper only knows SUPABASE_KEY. Temporarily provide the chosen
    # server credential without changing persistent settings or printing it.
    with override_settings(SUPABASE_KEY=key):
        if not upload_to_supabase_if_configured(data, media_path, "image/webp", upsert=False):
            raise PortraitError("Supabase no confirmó la subida; no se enlazó el retrato.")
    if not matches():
        raise PortraitError("La imagen pública no coincide con la subida; no se enlazó el retrato.")
    return "uploaded"


def _save_local(data, media_path):
    path = contained_path(settings.MEDIA_ROOT, media_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        # Exclusive creation preserves an existing file, including in concurrent runs.
        with path.open("xb") as destination:
            destination.write(data)
    except FileExistsError:
        if path.read_bytes() != data:
            raise PortraitError("El archivo de destino ya existe con otro contenido.")
        verified_image(path)
        return "already_saved"
    if path.read_bytes() != data:
        raise PortraitError("No se pudo verificar la copia local.")
    verified_image(path)
    return "saved"


def import_manifest(manifest, images_root, *, apply=False, expected_fingerprint=None, upload=False, replace=False):
    records = validate_manifest(manifest)
    current_fingerprint = database_fingerprint()
    if apply and (not expected_fingerprint or expected_fingerprint != current_fingerprint
                  or manifest.get("database_fingerprint") != current_fingerprint):
        raise PortraitError("La huella de la base debe coincidir con el manifiesto y --expected-database-fingerprint.")
    if apply and settings.MEDIA_URL.startswith(("http://", "https://")) and not upload:
        raise PortraitError("MEDIA_URL es remoto: --upload es obligatorio para enlazar imágenes accesibles.")
    root = Path(images_root).resolve()
    if not root.is_dir():
        raise PortraitError("--images-root debe ser una carpeta existente.")
    grouped_outputs = {}
    for record in records:
        if record.get("output_image"):
            grouped_outputs.setdefault(record["identity_key"], set()).add(record["output_image"])
    query = AIAvatar.objects.select_related("edition__book").prefetch_related("edition__book__authors")
    current = {str(avatar.pk): avatar for avatar in query.filter(pk__in=[record["avatar_id"] for record in records])}
    results = []
    converted = {}
    verified_uploads = set()
    for record in records:
        result = {"avatar_id": record["avatar_id"], "name": record["name"], "local": "not_attempted",
                  "upload": "not_requested", "database": "pending", "status": "pending"}
        results.append(result)
        try:
            avatar = current.get(str(uuid.UUID(record["avatar_id"])))
            if not avatar:
                raise PortraitError("UUID de avatar inexistente o eliminado.")
            if (avatar.name != record["name"] or str(avatar.edition_id) != record["edition_id"]
                    or str(avatar.edition.book_id) != record["book_id"] or avatar.is_author != record["is_author"]
                    or identity_for_avatar(avatar) != record["identity_key"]):
                raise PortraitError("El personaje o su libro cambiaron desde la exportación; vuelve a exportar.")
            output = record.get("output_image")
            group = grouped_outputs.get(record["identity_key"], set())
            if not output and len(group) == 1:
                output = next(iter(group))
            if not output:
                result["reason"] = "missing_output" if len(group) < 2 else "ambiguous_identity_output"
                continue
            source = contained_path(root, output)
            if not source.is_file():
                raise PortraitError("No existe el archivo de salida; permanece pendiente.")
            if source not in converted:
                converted[source] = webp_bytes(source)
            data = converted[source]
            identity_hash = hashlib.sha256(record["identity_key"].encode()).hexdigest()[:12]
            content_hash = hashlib.sha256(data).hexdigest()[:16]
            media_path = f"ai_avatars/portraits/{identity_hash}-{content_hash}.webp"
            result["media_path"] = media_path
            current_image = avatar.avatar_image.name or ""
            if current_image and current_image != media_path and not replace:
                result.update(status="preserved_existing", database="preserved_existing")
                continue
            if not apply:
                result.update(status="ready", local="would_save", upload="would_upload" if upload else "not_requested", database="would_link")
                continue
            result["local"] = _save_local(data, media_path)
            if upload:
                if media_path in verified_uploads:
                    result["upload"] = "already_uploaded"
                else:
                    result["upload"] = _upload_verified(data, media_path)
                    verified_uploads.add(media_path)
            with transaction.atomic():
                fresh = AIAvatar.objects.select_for_update().get(pk=avatar.pk)
                # Do not erase a portrait or silently remap an avatar changed mid-run.
                if (fresh.name != record["name"] or str(fresh.edition_id) != record["edition_id"]
                        or str(fresh.edition.book_id) != record["book_id"]
                        or fresh.is_author != record["is_author"]
                        or identity_for_avatar(fresh) != record["identity_key"]):
                    raise PortraitError("El personaje cambió durante la importación.")
                fresh_image = fresh.avatar_image.name or ""
                if fresh_image == media_path:
                    result["database"] = "already_linked"
                elif fresh_image and not replace:
                    result["database"] = "preserved_existing"
                else:
                    fresh.avatar_image = media_path
                    fresh.save(update_fields=["avatar_image", "updated_at"])
                    result["database"] = "linked"
            result["status"] = result["database"]
        except (PortraitError, OSError, ValueError, DatabaseError, AIAvatar.DoesNotExist) as exc:
            result["status"] = "failed"
            result["error"] = str(exc)
            if result["local"] == "not_attempted":
                result["local"] = "failed"
            elif upload and result["upload"] == "not_requested":
                result["upload"] = "failed"
            result["database"] = "not_linked"
    counts = {}
    for result in results:
        counts[result["status"]] = counts.get(result["status"], 0) + 1
    return {"schema_version": SCHEMA_VERSION, "dry_run": not apply,
            "database_fingerprint": current_fingerprint, "counts": counts, "results": results}
