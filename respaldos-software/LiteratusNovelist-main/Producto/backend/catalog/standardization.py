"""Estandarización de la biblioteca Literatus: sinopsis + portada de colección.

Orquesta, por libro:
  1. Sinopsis (60-120 palabras, español, anclada a un fragmento real de capítulos,
     sin spoilers) -> ``Book.synopsis``.
  2. Portada híbrida: ilustración sin texto local (``--art-dir``) o de Gemini + marco
     editorial Literatus (fallback procedural si Gemini falla) ->
     ``media/books/<slug>/cover_literatus.webp`` y ``Book.cover_image``.

Reglas:
  * No borra libros/capítulos/autores/EPUBs. No crea migraciones.
  * Idempotente y reanudable vía ``STANDARDIZATION_CHECKPOINT.json`` (raíz del repo).
  * Un fallo de contenido nunca lanza ni despublica: se devuelve ``BookResult`` y se
    marca ``needs_review``.
  * Respalda la BD (SQLite, sha256) y cada portada anterior antes de reemplazar.
"""

from __future__ import annotations

import json
import re
import shutil
import time
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from PIL import Image, ImageOps

from catalog.audit_engine import extract_plain_text
from catalog.covers import (
    build_cover_context,
    palette_for,
    palette_tone_for,
    prepare_art,
    render_literatus_cover,
    sha256_file,
)
from catalog.local_synopsis import generate_local_synopsis
from ai_engine import prompts as ai_prompts
from ai_engine.generation import generate_cover_image, generate_text

MEDIA_ROOT = Path(settings.MEDIA_ROOT)
PROJECT_ROOT = Path(settings.BASE_DIR).parent.parent
BACKEND_DIR = Path(settings.BASE_DIR)
SOURCE_BOOKS_ROOT = PROJECT_ROOT.parent / "books"

COVER_FILENAME = "cover_literatus.webp"
COVER_QUALITY = 88
COVER_BACKUP_DIRNAME = "book_covers_backup"
SUPPORTED_ART_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
LOCAL_ART_RATIO_TOLERANCE = 0.02

MIN_WORDS = 55
MAX_WORDS = 130
EXCERPT_CHARS = 3600

CHECKPOINT_PATH = PROJECT_ROOT / "STANDARDIZATION_CHECKPOINT.json"
REPORT_PATH = PROJECT_ROOT / "LIBRARY_STANDARDIZATION_REPORT.md"

_SPOILER_RE = re.compile(
    r"\b(al final|finalmente muere|muere al final|revela que es|resulta ser el|"
    r"el asesino es|el culpable es|termina con la muerte|desenlace|spoiler)\b",
    re.IGNORECASE,
)
_META_RE = re.compile(
    r"\b(esta obra|esta novela|este libro|el autor|la autora|el lector|la lectora|"
    r"obra maestra|nos sumerge|imprescindible)\b",
    re.IGNORECASE,
)
_SPANISH_FUNCTION_WORDS = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a",
    "que", "y", "o", "en", "con", "por", "para", "su", "sus", "se", "no", "es",
    "son", "como", "pero", "más", "mas", "cuando", "donde", "quien", "cuyo",
    "entre", "sobre", "sin", "tras", "hacia", "desde", "muy", "ya", "también",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# Estado / checkpoint                                                         #
# --------------------------------------------------------------------------- #
def load_state(path: Path | None = None) -> dict:
    path = path or CHECKPOINT_PATH
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            data.setdefault("books", {})
            data.setdefault("stats", {})
            return data
        except (json.JSONDecodeError, OSError):
            pass
    return {"stage": "NOT_STARTED", "books": {}, "stats": {}, "last_updated": None}


def save_state(state: dict, path: Path | None = None) -> None:
    path = path or CHECKPOINT_PATH
    state["last_updated"] = _now()
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _book_state_complete(entry: dict, *, do_cover: bool, do_synopsis: bool) -> bool:
    if do_synopsis and entry.get("synopsis", {}).get("status") not in ("kept", "generated"):
        return False
    if do_cover and entry.get("cover", {}).get("status") not in ("kept", "generated", "fallback_procedural"):
        return False
    return True


# --------------------------------------------------------------------------- #
# Backups                                                                     #
# --------------------------------------------------------------------------- #
def backup_sqlite_database(reason: str = "standardization") -> dict | None:
    name = settings.DATABASES["default"].get("NAME")
    if not name:
        return None
    db_path = Path(name)
    if not db_path.is_absolute():
        db_path = BACKEND_DIR / db_path
    if not db_path.exists() or db_path.suffix.lower() not in {".sqlite3", ".sqlite", ".db"}:
        return None
    backup_dir = BACKEND_DIR / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dst = backup_dir / f"db_before_{reason}_{ts}.sqlite3"
    shutil.copy2(db_path, dst)
    src_hash, dst_hash = sha256_file(db_path), sha256_file(dst)
    if src_hash != dst_hash:
        raise RuntimeError("El backup SQLite no coincide en sha256; abortando.")
    return {"database": str(db_path), "backup": str(dst), "sha256": dst_hash}


def audit_current_covers() -> dict:
    """Recorre ``Book.cover_image`` y valida existencia / formato WEBP / tamaño 600x900."""
    from collections import Counter, defaultdict

    from catalog.models import Book
    counts: Counter = Counter()
    path_groups: dict[str, list[str]] = defaultdict(list)
    exact_groups: dict[str, list[str]] = defaultdict(list)
    dhash_groups: dict[str, list[str]] = defaultdict(list)
    invalid: list[dict] = []
    for book in Book.objects.order_by("slug").only("id", "slug", "cover_image"):
        counts["books"] += 1
        rel = book.cover_image.name if book.cover_image else ""
        if not rel:
            counts["missing_db"] += 1
            invalid.append({"slug": book.slug, "reason": "missing_db"})
            continue
        path_groups[rel].append(book.slug)
        p = MEDIA_ROOT / rel
        if not p.exists():
            counts["missing_file"] += 1
            invalid.append({"slug": book.slug, "reason": "missing_file", "path": str(p)})
            continue
        try:
            with Image.open(p) as im:
                fmt = (im.format or "").upper()
                size = (im.width, im.height)
                perceptual_hash = _dhash(im)
            exact_groups[sha256_file(p)].append(book.slug)
            dhash_groups[perceptual_hash].append(book.slug)
            counts["webp" if fmt == "WEBP" else "invalid_format"] += 1
            if fmt != "WEBP":
                invalid.append({"slug": book.slug, "reason": f"invalid_format:{fmt}"})
            counts["target_size" if size == (600, 900) else "invalid_size"] += 1
            if size != (600, 900):
                invalid.append({"slug": book.slug, "reason": f"invalid_size:{size[0]}x{size[1]}"})
        except Exception as exc:  # pragma: no cover
            counts["invalid_image"] += 1
            invalid.append({"slug": book.slug, "reason": f"invalid_image:{exc}"})
    return {
        "counts": dict(counts),
        "same_path_duplicate_groups": {k: v for k, v in path_groups.items() if len(v) > 1},
        "exact_duplicate_groups": {k: v for k, v in exact_groups.items() if len(v) > 1},
        "perceptual_duplicate_groups": {k: v for k, v in dhash_groups.items() if len(v) > 1},
        "invalid_items": invalid,
    }


def _cover_backup_dir() -> Path:
    d = MEDIA_ROOT / COVER_BACKUP_DIRNAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def _backup_one_cover(book, manifest: list) -> dict | None:
    rel = book.cover_image.name if book.cover_image else ""
    if not rel:
        return None
    src = MEDIA_ROOT / rel
    backup_dir = _cover_backup_dir()
    legacy_dst = backup_dir / f"{book.slug}__{Path(rel).name}"
    src_hash = sha256_file(src) if src.exists() else ""
    dst = legacy_dst
    if src_hash and legacy_dst.exists() and sha256_file(legacy_dst) != src_hash:
        old_name = Path(rel)
        dst = backup_dir / f"{book.slug}__{old_name.stem}__{src_hash[:12]}{old_name.suffix}"
    row = {
        "book_id": str(book.id),
        "slug": book.slug,
        "title": book.title,
        "old_cover": rel,
        "old_path": str(src),
        "new_cover": f"books/{book.slug}/{COVER_FILENAME}",
        "backed_up": False,
        "old_sha256": src_hash,
    }
    if src.exists() and not dst.exists():
        try:
            shutil.copy2(src, dst)
            row["backed_up"] = True
            row["backup_path"] = str(dst)
        except OSError as e:  # pragma: no cover
            row["backup_error"] = str(e)
    elif dst.exists():
        row["backed_up"] = True
        row["backup_path"] = str(dst)
    manifest.append(row)
    write_cover_backup_manifest([row])  # persistir de inmediato (también sirve al hook del importador)
    return row


def write_cover_backup_manifest(manifest: list) -> None:
    if not manifest:
        return
    path = _cover_backup_dir() / "BOOK_COVER_BACKUP.json"
    existing = []
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = []
    def identity(row: dict) -> tuple[str, str, str]:
        return (row.get("slug", ""), row.get("old_cover", ""), row.get("old_sha256", ""))

    seen = {identity(r) for r in existing}
    for row in manifest:
        key = identity(row)
        if key not in seen:
            existing.append(row)
            seen.add(key)
    path.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")


# --------------------------------------------------------------------------- #
# metadata.json por libro (conveniencia; el estado real es el checkpoint)     #
# --------------------------------------------------------------------------- #
def _book_media_dir(book) -> Path:
    d = MEDIA_ROOT / "books" / book.slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def _merge_book_metadata(book, patch: dict) -> None:
    path = _book_media_dir(book) / "metadata.json"
    data = {}
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
    data.setdefault("id", str(book.id))
    data.setdefault("slug", book.slug)
    data.setdefault("title", book.title)
    std = data.setdefault("standardization", {})
    std.update(patch)
    try:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:  # pragma: no cover
        pass


# --------------------------------------------------------------------------- #
# Sinopsis                                                                    #
# --------------------------------------------------------------------------- #
def _word_count(text: str) -> int:
    return len(re.findall(r"\S+", text or ""))


def _normalize_syn(text: str) -> str:
    t = unicodedata.normalize("NFKD", (text or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"\s+", " ", t).strip()
    return t[:200]


def _looks_spanish(text: str) -> bool:
    tokens = re.findall(r"[a-záéíóúñü]+", (text or "").lower())
    if len(tokens) < 8:
        return True  # muy corto: lo decide la comprobación de longitud
    hits = sum(1 for tok in tokens if tok in _SPANISH_FUNCTION_WORDS)
    ratio = hits / len(tokens)
    has_accents = bool(re.search(r"[áéíóúñ¿¡]", text))
    return ratio >= 0.18 if has_accents else ratio >= 0.25


def _chapter_excerpt(book, max_chars: int = EXCERPT_CHARS) -> str:
    parts: list[str] = []
    total = 0
    for ch in book.chapters.order_by("order").only("content_html", "order")[:12]:
        txt = extract_plain_text(ch.content_html)
        if len(txt) < 200:
            continue
        parts.append(txt)
        total += len(txt)
        if total >= max_chars or len(parts) >= 3:
            break
    if not parts:  # fuente pobre (poesía / capítulos diminutos): usar lo que haya
        for ch in book.chapters.order_by("order").only("content_html")[:6]:
            txt = extract_plain_text(ch.content_html)
            if txt:
                parts.append(txt)
    excerpt = "\n\n".join(parts).strip()
    return excerpt[:max_chars]


def qc_synopsis(text: str, seen_norms: set[str]) -> tuple[bool, list[str], list[str]]:
    """Devuelve (hard_ok, hard_issues, soft_flags)."""
    hard: list[str] = []
    soft: list[str] = []
    text = (text or "").strip()
    wc = _word_count(text)
    if not text:
        return False, ["sinopsis vacía"], []
    if wc < MIN_WORDS:
        hard.append(f"demasiado corta ({wc} palabras)")
    if wc > MAX_WORDS:
        hard.append(f"demasiado larga ({wc} palabras)")
    if not _looks_spanish(text):
        hard.append("no parece estar en español")
    norm = _normalize_syn(text)
    if norm in seen_norms:
        hard.append("duplicada de otra sinopsis")
    if _SPOILER_RE.search(text):
        soft.append("posible spoiler")
    if _META_RE.search(text):
        soft.append("lenguaje de reseña / meta")
    if re.match(r'^\s*[«"\']', text):
        soft.append("empieza entre comillas")
    return (not hard), hard, soft


def _clean_synopsis(raw: str) -> str:
    text = (raw or "").strip()
    text = re.sub(r"^\s*(sinopsis|synopsis)\s*[:\-–]\s*", "", text, flags=re.IGNORECASE)
    text = text.strip().strip('«»"“”').strip()
    # primer bloque de párrafo
    text = re.split(r"\n\s*\n", text)[0].strip()
    text = re.sub(r"\s+", " ", text)
    # si excede el máximo, recortar en el último punto que quepa
    if _word_count(text) > MAX_WORDS:
        words = re.findall(r"\S+", text)
        text = " ".join(words[:MAX_WORDS])
        if "." in text:
            text = text[: text.rfind(".") + 1]
    return text.strip()


def _make_synopsis_unique(text: str, title: str, seen_norms: set[str]) -> str:
    if _normalize_syn(text) not in seen_norms:
        return text
    prefix = f"En «{title}» se plantea este punto de partida:"
    available = max(MIN_WORDS, MAX_WORDS - _word_count(prefix))
    words = re.findall(r"\S+", text)
    shortened = " ".join(words[:available]).rstrip(" ,;:-")
    if shortened and shortened[-1] not in ".!?":
        shortened += "."
    return f"{prefix} {shortened}".strip()


@dataclass
class BookResult:
    slug: str
    book_id: str
    synopsis_status: str = "skipped"      # kept | generated | failed | skipped
    synopsis_source: str = "-"
    synopsis_words: int = 0
    cover_status: str = "skipped"         # generated | fallback_procedural | kept | failed | skipped
    cover_source: str = "-"
    cover_bytes: int = 0
    needs_review: bool = False
    messages: list = field(default_factory=list)

    def as_row(self) -> dict:
        return {
            "slug": self.slug,
            "book_id": self.book_id,
            "synopsis": {"status": self.synopsis_status, "source": self.synopsis_source,
                         "words": self.synopsis_words},
            "cover": {"status": self.cover_status, "source": self.cover_source,
                      "bytes": self.cover_bytes},
            "needs_review": self.needs_review,
            "messages": self.messages,
        }


def _standardize_synopsis(book, res: BookResult, *, regenerate: bool, dry_run: bool,
                          seen_norms: set[str], offline: bool = False,
                          local_synopsis: bool = False) -> None:
    ctx_authors = ", ".join(a.full_name for a in book.authors.all()) or "Anónimo"
    ctx_genres = ", ".join(g.name for g in book.genres.all())

    existing = (book.synopsis or "").strip()
    if existing and not regenerate:
        ok, hard, soft = qc_synopsis(existing, set())
        if ok:
            res.synopsis_status, res.synopsis_source = "kept", "existing"
            res.synopsis_words = _word_count(existing)
            if soft:
                res.needs_review = True
                res.messages.append("sinopsis existente con avisos: " + "; ".join(soft))
            seen_norms.add(_normalize_syn(existing))
            _merge_book_metadata(book, {"synopsis": {
                "source": "existing", "model": "-", "date": _now(),
                "word_count": res.synopsis_words, "qc_status": "ok" if not soft else "soft",
                "grounded": None, "review": bool(soft)}})
            return

    if local_synopsis:
        local = generate_local_synopsis(book, books_root=SOURCE_BOOKS_ROOT)
        candidate = _clean_synopsis(local.text)
        source = local.source

        cleaned_existing = _clean_synopsis(existing)
        existing_ok, _, _ = qc_synopsis(cleaned_existing, set()) if existing else (False, [], [])
        if existing and existing_ok:
            candidate = cleaned_existing
            source = "existing_edited"
            local_review_reasons: list[str] = []
        elif existing and 15 <= _word_count(existing) < MIN_WORDS:
            candidate = _clean_synopsis(f"{existing.rstrip()} {candidate}")
            source = f"existing+{local.source}"
            local_review_reasons = list(local.review_reasons)
        else:
            local_review_reasons = list(local.review_reasons)

        current_seen = set(seen_norms)
        if existing:
            current_seen.discard(_normalize_syn(existing))
        candidate = _make_synopsis_unique(candidate, book.title, current_seen)
        ok, hard, soft = qc_synopsis(candidate, current_seen)
        review_reasons = local_review_reasons + list(hard) + list(soft)

        if dry_run:
            res.synopsis_status = "generated" if candidate else "failed"
            res.synopsis_source = source
            res.synopsis_words = _word_count(candidate)
            res.needs_review = bool(review_reasons) or not ok
            res.messages.append(f"[dry-run] candidato local: {candidate!r}")
            if review_reasons:
                res.messages.append("sinopsis local: " + "; ".join(review_reasons))
            return

        if not candidate:
            res.synopsis_status = "failed"
            res.needs_review = True
            res.messages.append("sinopsis local: no se pudo construir un candidato")
            return

        with transaction.atomic():
            book.synopsis = candidate
            book.save(update_fields=["synopsis"])
        seen_norms.add(_normalize_syn(candidate))
        res.synopsis_status = "generated"
        res.synopsis_source = source
        res.synopsis_words = _word_count(candidate)
        res.needs_review = bool(review_reasons) or not ok
        if review_reasons:
            res.messages.append("sinopsis local: " + "; ".join(review_reasons))
        _merge_book_metadata(book, {"synopsis": {
            "source": source, "model": "local-extractive-v1", "date": _now(),
            "word_count": res.synopsis_words,
            "qc_status": "ok" if ok and not review_reasons else "review",
            "grounded": local.source != "local_metadata",
            "source_chars": local.source_chars,
            "review": res.needs_review,
        }})
        return

    if offline:
        res.synopsis_status = "kept" if existing else "failed"
        res.synopsis_source = "existing" if existing else "-"
        res.synopsis_words = _word_count(existing)
        res.needs_review = not existing
        if not existing:
            res.messages.append("sinopsis: modo offline, no se generó")
        return

    excerpt = _chapter_excerpt(book)
    thin = len(excerpt) < 400
    prompt = ai_prompts.synopsis_prompt(
        title=book.title, authors=ctx_authors, genres=ctx_genres, excerpt=excerpt or book.title)

    gen = generate_text(prompt, system_instruction=ai_prompts.SYNOPSIS_SYSTEM,
                        temperature=0.7, max_output_tokens=360)
    if not gen.ok:
        res.synopsis_status, res.synopsis_source = "failed", "-"
        res.needs_review = True
        res.messages.append(f"sinopsis: todos los proveedores fallaron ({gen.error})")
        return

    candidate = _clean_synopsis(gen.value)
    ok, hard, soft = qc_synopsis(candidate, seen_norms)
    if not ok:
        retry = generate_text(
            prompt + ai_prompts.synopsis_retry_suffix(hard),
            system_instruction=ai_prompts.SYNOPSIS_SYSTEM, temperature=0.9, max_output_tokens=360)
        if retry.ok:
            candidate2 = _clean_synopsis(retry.value)
            ok2, hard2, soft2 = qc_synopsis(candidate2, seen_norms)
            if ok2:
                candidate, ok, hard, soft = candidate2, True, [], soft2
            else:
                candidate = candidate2 or candidate
                hard = hard2 or hard

    if dry_run:
        res.synopsis_status = "generated" if ok else "failed"
        res.synopsis_source = gen.provider
        res.synopsis_words = _word_count(candidate)
        res.messages.append(f"[dry-run] candidato: {candidate!r}")
        if not ok:
            res.needs_review = True
            res.messages.append("QC falló: " + "; ".join(hard))
        return

    if not candidate:
        res.synopsis_status = "failed"
        res.needs_review = True
        res.messages.append("sinopsis: candidato vacío tras limpieza")
        return

    with transaction.atomic():
        book.synopsis = candidate
        book.save(update_fields=["synopsis"])
    seen_norms.add(_normalize_syn(candidate))

    res.synopsis_status = "generated"
    res.synopsis_source = gen.provider
    res.synopsis_words = _word_count(candidate)
    review = (not ok) or bool(soft) or thin
    if review:
        res.needs_review = True
        why = list(hard) + list(soft) + (["fuente escasa"] if thin else [])
        res.messages.append("sinopsis marcada para revisión: " + "; ".join(why))
    _merge_book_metadata(book, {"synopsis": {
        "source": gen.provider, "model": gen.model, "date": _now(),
        "word_count": res.synopsis_words, "qc_status": "ok" if ok and not soft else "review",
        "grounded": not thin, "review": review}})


def _load_illustration(data: bytes, *, require_local_spec: bool = False) -> tuple[Image.Image | None, str | None]:
    try:
        img = Image.open(BytesIO(data))
        img.load()
    except Exception as exc:
        return None, f"imagen ilegible: {exc}"
    if (img.format or "").upper() not in {"PNG", "JPEG", "JPG", "WEBP"}:
        return None, f"formato no permitido: {img.format or 'desconocido'}"
    if min(img.size) < 512:
        return None, f"resolución insuficiente: {img.width}x{img.height}"
    if require_local_spec:
        ratio = img.width / img.height
        target = 2 / 3
        ratio_error = abs(ratio - target) / target
        if img.width < 600 or img.height < 900:
            return None, f"el arte local debe medir al menos 600x900: {img.width}x{img.height}"
        if ratio_error > LOCAL_ART_RATIO_TOLERANCE:
            return None, f"proporción distinta de 2:3: {img.width}x{img.height}"
    lo, hi = img.convert("L").getextrema()
    if hi - lo < 12:  # imagen casi de color sólido
        return None, "imagen casi uniforme, sin contraste suficiente"
    return img, None


def _validate_illustration(data: bytes) -> Image.Image | None:
    image, _ = _load_illustration(data)
    return image


def _dhash(image: Image.Image, hash_size: int = 16) -> str:
    gray = ImageOps.exif_transpose(image).convert("L")
    gray = gray.resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    value = 0
    for row in range(hash_size):
        offset = row * (hash_size + 1)
        for col in range(hash_size):
            value = (value << 1) | (pixels[offset + col] > pixels[offset + col + 1])
    return f"{value:0{hash_size * hash_size // 4}x}"


def inspect_art_directory(art_dir: Path) -> dict:
    """Valida e indexa ilustraciones locales nombradas por slug.

    La inspección se completa antes del backup o de cualquier escritura. Dos archivos
    para el mismo slug, imágenes exactas repetidas o un dHash repetido se consideran
    errores: una colección no debe reutilizar la misma ilustración.
    """
    art_dir = Path(art_dir).resolve()
    if not art_dir.is_dir():
        raise ValueError(f"La carpeta de arte no existe o no es un directorio: {art_dir}")

    candidates = sorted(
        (p for p in art_dir.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_ART_EXTENSIONS),
        key=lambda p: p.name.casefold(),
    )
    if not candidates:
        allowed = ", ".join(sorted(SUPPORTED_ART_EXTENSIONS))
        raise ValueError(f"No hay ilustraciones compatibles en {art_dir} ({allowed}).")

    paths: dict[str, Path] = {}
    display_slugs: dict[str, str] = {}
    duplicate_slug_groups: dict[str, list[str]] = defaultdict(list)
    exact_groups: dict[str, list[str]] = defaultdict(list)
    dhash_groups: dict[str, list[str]] = defaultdict(list)
    invalid_items: list[dict] = []

    for path in candidates:
        slug_key = path.stem.casefold()
        if slug_key in paths:
            duplicate_slug_groups[slug_key].extend([str(paths[slug_key]), str(path)])
            continue
        try:
            data = path.read_bytes()
        except OSError as exc:
            invalid_items.append({"file": str(path), "reason": f"no se pudo leer: {exc}"})
            continue
        image, reason = _load_illustration(data, require_local_spec=True)
        if image is None:
            invalid_items.append({"file": str(path), "reason": reason or "imagen inválida"})
            continue
        paths[slug_key] = path
        display_slugs[slug_key] = path.stem
        exact_groups[sha256_bytes(data)].append(path.stem)
        dhash_groups[_dhash(image)].append(path.stem)

    duplicate_slug_groups = {
        slug: sorted(set(files)) for slug, files in duplicate_slug_groups.items()
    }
    exact_duplicate_groups = {digest: slugs for digest, slugs in exact_groups.items() if len(slugs) > 1}
    perceptual_duplicate_groups = {digest: slugs for digest, slugs in dhash_groups.items() if len(slugs) > 1}

    return {
        "directory": str(art_dir),
        "files": len(candidates),
        "valid": len(paths),
        "paths": paths,
        "slugs": sorted(display_slugs.values()),
        "duplicate_slug_groups": duplicate_slug_groups,
        "exact_duplicate_groups": exact_duplicate_groups,
        "perceptual_duplicate_groups": perceptual_duplicate_groups,
        "invalid_items": invalid_items,
    }


def _standardize_cover(book, res: BookResult, *, regenerate: bool, dry_run: bool,
                       manifest: list, preview_dir: Path | None, font_set: str,
                       offline: bool = False,
                       art_index: dict[str, Path] | None = None) -> None:
    ctx = build_cover_context(book)
    out_path = _book_media_dir(book) / COVER_FILENAME
    rel = f"books/{book.slug}/{COVER_FILENAME}"

    already = out_path.exists() and (book.cover_image.name if book.cover_image else "") == rel
    if already and not regenerate:
        res.cover_status, res.cover_source = "kept", "existing"
        res.cover_bytes = out_path.stat().st_size
        return

    prompt = ai_prompts.cover_prompt(
        title=ctx["title"], authors=ctx["authors"], genres=ctx["genres"],
        synopsis=book.synopsis or "",
        palette_tone=palette_tone_for(ctx["seed"], ctx["palette_family"]))

    art_img = None
    art_path = None
    art_sha256 = None
    from ai_engine.generation import GenResult
    img_res = GenResult(False, None, "none", "procedural", "modo offline")
    if art_index is not None:
        art_path = art_index.get(book.slug.casefold())
        if art_path is None:
            res.cover_status = "failed"
            res.cover_source = "local_art"
            res.needs_review = True
            res.messages.append(f"falta la ilustración local {book.slug}.(png|jpg|jpeg|webp)")
            return
        try:
            art_bytes = art_path.read_bytes()
        except OSError as exc:
            res.cover_status = "failed"
            res.cover_source = "local_art"
            res.needs_review = True
            res.messages.append(f"no se pudo leer el arte local {art_path.name}: {exc}")
            return
        validated, reason = _load_illustration(art_bytes, require_local_spec=True)
        if validated is None:
            res.cover_status = "failed"
            res.cover_source = "local_art"
            res.needs_review = True
            res.messages.append(f"arte local descartado ({art_path.name}): {reason}")
            return
        art_img = prepare_art(validated)
        art_sha256 = sha256_bytes(art_bytes)
        res.cover_source = "local_art"
        img_res = GenResult(True, art_bytes, "local_art", "local-file")
    elif not offline:
        img_res = generate_cover_image(prompt, aspect_ratio="2:3")
    if art_index is None:
        if img_res.ok and img_res.value:
            validated = _validate_illustration(img_res.value)
            if validated is not None:
                art_img = prepare_art(validated)
                res.cover_source = img_res.provider
            else:
                res.messages.append("ilustración descartada (formato/tamaño/color sólido)")
        elif not offline:
            res.messages.append(f"Gemini imagen no disponible: {img_res.error}")

    try:
        final = render_literatus_cover(
            title=ctx["title"], authors=ctx["authors"], book_code=ctx["book_code"],
            seed=ctx["seed"], symbol=ctx["symbol"],
            palette=palette_for(ctx["seed"], ctx["palette_family"]),
            art_background=art_img, with_medallion=True, font_set=font_set)
    except Exception as e:  # fuente/PIL: conservar portada actual
        res.cover_status = "failed"
        res.needs_review = True
        res.messages.append(f"compositor falló, se conserva la portada actual: {e}")
        return

    if art_img is None:
        res.cover_status = "fallback_procedural"
        res.cover_source = "procedural"
        if not offline:
            res.needs_review = True
            res.messages.append("portada procedural (sin ilustración de Gemini)")
    else:
        res.cover_status = "generated"

    if dry_run:
        buf = BytesIO()
        final.save(buf, "WEBP", quality=COVER_QUALITY, method=6)
        res.cover_bytes = buf.tell()
        if preview_dir is not None:
            preview_dir.mkdir(parents=True, exist_ok=True)
            (preview_dir / f"{book.slug}.webp").write_bytes(buf.getvalue())
            res.messages.append(f"[dry-run] vista previa -> {preview_dir / (book.slug + '.webp')}")
        return

    _backup_one_cover(book, manifest)
    final.save(out_path, "WEBP", quality=COVER_QUALITY, method=6)
    res.cover_bytes = out_path.stat().st_size
    with transaction.atomic():
        type(book).objects.filter(pk=book.pk).update(cover_image=rel)
    book.cover_image = rel  # refleja el cambio en la instancia en memoria

    _merge_book_metadata(book, {"cover": {
        "source": res.cover_source, "model": img_res.model if art_img is not None else "procedural",
        "date": _now(), "size": "600x900", "bytes": res.cover_bytes,
        "prompt_sha": sha256_bytes(prompt.encode("utf-8"))[:16],
        "art_file": art_path.name if art_path is not None else None,
        "art_sha256": art_sha256,
        "fallback": art_img is None, "review": res.needs_review}})


def sha256_bytes(b: bytes) -> str:
    import hashlib
    return hashlib.sha256(b).hexdigest()


def standardize_book(book, *, do_cover: bool = True, do_synopsis: bool = True,
                     regenerate: bool = False, dry_run: bool = False, offline: bool = False,
                     local_synopsis: bool = False,
                     seen_norms: set[str] | None = None, manifest: list | None = None,
                     preview_dir: Path | None = None, font_set: str = "auto",
                     art_index: dict[str, Path] | None = None) -> BookResult:
    """Estandariza un libro. Nunca lanza por fallos de contenido."""
    seen_norms = seen_norms if seen_norms is not None else set()
    manifest = manifest if manifest is not None else []
    res = BookResult(slug=book.slug, book_id=str(book.id))

    if do_synopsis:
        try:
            _standardize_synopsis(book, res, regenerate=regenerate, dry_run=dry_run,
                                  seen_norms=seen_norms, offline=offline,
                                  local_synopsis=local_synopsis)
        except Exception as e:  # pragma: no cover
            res.synopsis_status = "failed"
            res.needs_review = True
            res.messages.append(f"sinopsis: excepción inesperada: {e!r}")

    if do_cover:
        try:
            book.refresh_from_db(fields=["synopsis", "cover_image"])
            _standardize_cover(book, res, regenerate=regenerate, dry_run=dry_run,
                               manifest=manifest, preview_dir=preview_dir, font_set=font_set,
                               offline=offline, art_index=art_index)
        except Exception as e:  # pragma: no cover
            res.cover_status = "failed"
            res.needs_review = True
            res.messages.append(f"portada: excepción inesperada: {e!r}")

    return res


# --------------------------------------------------------------------------- #
# Driver por lotes                                                            #
# --------------------------------------------------------------------------- #
def _resolve_books(selector: dict):
    import uuid as _uuid

    from catalog.models import Book
    qs = Book.objects.prefetch_related("authors", "genres").order_by("slug")
    if selector.get("book_id"):
        val = str(selector["book_id"]).strip()
        cond = Q(slug=val)
        try:
            cond |= Q(id=_uuid.UUID(val))
        except (ValueError, AttributeError, TypeError):
            pass
        return list(qs.filter(cond))
    if selector.get("slugs"):
        return list(qs.filter(slug__in=selector["slugs"]))
    return list(qs)


def standardize_library(*, selector: dict, do_cover: bool, do_synopsis: bool,
                        regenerate: bool, dry_run: bool, offline: bool = False,
                        local_synopsis: bool = False,
                        limit: int | None = None, batch_size: int = 40, sleep: float = 1.5,
                        preview_dir: Path | None = None, font_set: str = "auto",
                        make_backup: bool = True, art_dir: Path | None = None,
                        progress=lambda line: None) -> dict:
    from catalog.models import Book

    state = load_state()
    books = _resolve_books(selector)

    pending_only = not (selector.get("book_id") or selector.get("slugs") or selector.get("all"))
    if pending_only and not regenerate:
        books = [b for b in books
                 if not _book_state_complete(state["books"].get(b.slug, {}),
                                             do_cover=do_cover, do_synopsis=do_synopsis)]
    if limit:
        books = books[:limit]

    art_audit = None
    art_index = None
    if art_dir is not None:
        art_audit = inspect_art_directory(art_dir)
        problems: list[str] = []
        if art_audit["duplicate_slug_groups"]:
            problems.append(f"{len(art_audit['duplicate_slug_groups'])} slug(s) con más de un archivo")
        if art_audit["invalid_items"]:
            problems.append(f"{len(art_audit['invalid_items'])} archivo(s) inválido(s)")
        if art_audit["exact_duplicate_groups"]:
            problems.append(f"{len(art_audit['exact_duplicate_groups'])} grupo(s) exactamente repetido(s)")
        if art_audit["perceptual_duplicate_groups"]:
            problems.append(f"{len(art_audit['perceptual_duplicate_groups'])} grupo(s) visualmente repetido(s)")
        if problems:
            details = []
            for item in art_audit["invalid_items"][:3]:
                details.append(f"{Path(item['file']).name}: {item['reason']}")
            for groups_key in ("duplicate_slug_groups", "exact_duplicate_groups",
                               "perceptual_duplicate_groups"):
                for group in list(art_audit[groups_key].values())[:2]:
                    details.append(", ".join(Path(v).name for v in group))
            suffix = f" Detalle: {'; '.join(details)}" if details else ""
            raise ValueError("La carpeta de arte no pasó la validación: " + "; ".join(problems) + "." + suffix)

        art_index = art_audit["paths"]
        all_book_slugs = {slug.casefold() for slug in Book.objects.values_list("slug", flat=True)}
        unknown_art = sorted(set(art_index) - all_book_slugs)
        if unknown_art:
            sample = ", ".join(unknown_art[:8])
            raise ValueError(
                f"Hay {len(unknown_art)} archivo(s) cuyo slug no existe en la BD: {sample}"
            )
        missing_art = [book.slug for book in books if book.slug.casefold() not in art_index]
        if missing_art:
            sample = ", ".join(missing_art[:8])
            raise ValueError(
                f"Faltan {len(missing_art)} ilustración(es) para los libros seleccionados: {sample}"
            )
        progress(
            f"Arte local validado: {art_audit['valid']} archivo(s), 2:3, sin duplicados "
            f"({art_audit['directory']})"
        )

    total = len(books)
    progress(f"Libros a procesar: {total}  (cover={do_cover} synopsis={do_synopsis} "
             f"dry_run={dry_run} regenerate={regenerate} offline={offline} "
             f"local_synopsis={local_synopsis} art_dir={bool(art_index)})")

    backup_info = state.get("sqlite_backup")
    if not dry_run and make_backup:
        backup_info = backup_sqlite_database("standardize_library")
        if backup_info:
            progress(f"Backup SQLite: {backup_info['backup']}")
            progress(f"  sha256: {backup_info['sha256']}")
        state["sqlite_backup"] = backup_info

    state["stage"] = "IN_PROGRESS"
    state["mode"] = ("all" if selector.get("all") else
                     "single" if selector.get("book_id") else
                     "slugs" if selector.get("slugs") else "pending")
    if not dry_run:
        save_state(state)

    # sinopsis ya presentes en BD (para el dedup de QC)
    seen_norms = {_normalize_syn(s) for s in
                  Book.objects.exclude(synopsis="").values_list("synopsis", flat=True)}
    manifest: list = []

    counters = {"total": total, "done": 0, "synopsis_generated": 0, "synopsis_kept": 0,
                "synopsis_failed": 0, "covers_generated": 0, "covers_fallback": 0,
                "covers_local_art": 0, "covers_kept": 0, "covers_failed": 0,
                "needs_review": 0, "failed": 0}
    rows: list[dict] = []

    for index, book in enumerate(books, start=1):
        res = standardize_book(
            book, do_cover=do_cover, do_synopsis=do_synopsis,
            regenerate=regenerate, dry_run=dry_run, offline=offline,
            local_synopsis=local_synopsis, seen_norms=seen_norms,
            manifest=manifest, preview_dir=preview_dir,
            font_set=font_set, art_index=art_index)

        counters["done"] += 1
        counters["synopsis_generated"] += res.synopsis_status == "generated"
        counters["synopsis_kept"] += res.synopsis_status == "kept"
        counters["synopsis_failed"] += res.synopsis_status == "failed"
        counters["covers_generated"] += res.cover_status == "generated"
        counters["covers_local_art"] += (res.cover_status == "generated" and
                                          res.cover_source == "local_art")
        counters["covers_fallback"] += res.cover_status == "fallback_procedural"
        counters["covers_kept"] += res.cover_status == "kept"
        counters["covers_failed"] += res.cover_status == "failed"
        counters["needs_review"] += res.needs_review
        if res.synopsis_status == "failed" and res.cover_status == "failed":
            counters["failed"] += 1

        rows.append(res.as_row())

        # consola (punto 19)
        progress(f"[{index:04d}/{total:04d}] {book.slug}")
        if do_synopsis:
            progress(f"  synopsis : {res.synopsis_status:<10} ({res.synopsis_source}, "
                     f"{res.synopsis_words} palabras)")
        if do_cover:
            progress(f"  cover    : {res.cover_status:<18} ({res.cover_source}, "
                     f"{res.cover_bytes/1024:.1f} KB)")
        progress(f"  review   : {'SI' if res.needs_review else 'no'}"
                 + ("  -> " + " | ".join(res.messages) if res.needs_review and res.messages else ""))

        if not dry_run:
            state["books"][book.slug] = res.as_row()
            state["stats"] = counters
            if index % max(1, min(batch_size, 10)) == 0 or index == total:
                save_state(state)
                write_cover_backup_manifest(manifest)
                manifest = []
        if sleep and not dry_run and index < total:
            time.sleep(sleep)

    cover_audit = None
    if not dry_run:
        if do_cover:
            cover_audit = audit_current_covers()
            cc = cover_audit["counts"]
            progress(
                "Auditoría final de portadas: "
                f"{cc.get('webp', 0)}/{cc.get('books', 0)} WEBP, "
                f"{cc.get('target_size', 0)}/{cc.get('books', 0)} en 600x900, "
                f"duplicados exactos={len(cover_audit['exact_duplicate_groups'])}, "
                f"visuales={len(cover_audit['perceptual_duplicate_groups'])}"
            )
        if pending_only or selector.get("all"):
            state["stage"] = "COMPLETE"
        else:
            state["stage"] = "PARTIAL_COMPLETE"
        state["stats"] = counters
        state["cover_audit"] = cover_audit
        save_state(state)
        write_cover_backup_manifest(manifest)
        _write_report(rows, counters, backup_info, art_audit, cover_audit)

    return {"counters": counters, "rows": rows, "backup": backup_info,
            "art_audit": art_audit, "cover_audit": cover_audit,
            "report": str(REPORT_PATH) if not dry_run else None,
            "checkpoint": str(CHECKPOINT_PATH)}


def _write_report(rows: list[dict], counters: dict, backup_info: dict | None,
                  art_audit: dict | None = None, cover_audit: dict | None = None) -> None:
    lines = ["# LIBRARY_STANDARDIZATION_REPORT — Literatus Novelist", "",
             f"_Generado {_now()}_", ""]
    if backup_info:
        lines += [f"Backup SQLite: `{backup_info['backup']}`  ",
                  f"sha256: `{backup_info['sha256']}`", ""]
    if art_audit:
        lines += [f"Arte local: `{art_audit['directory']}`  ",
                  f"Ilustraciones validadas: **{art_audit['valid']}** (2:3, únicas)", ""]
    if cover_audit:
        cc = cover_audit["counts"]
        lines += ["## Auditoría final de portadas", "",
                  f"- WEBP: **{cc.get('webp', 0)}/{cc.get('books', 0)}**",
                  f"- Tamaño 600x900: **{cc.get('target_size', 0)}/{cc.get('books', 0)}**",
                  f"- Grupos duplicados exactos: **{len(cover_audit['exact_duplicate_groups'])}**",
                  f"- Grupos duplicados visuales: **{len(cover_audit['perceptual_duplicate_groups'])}**",
                  f"- Rutas compartidas: **{len(cover_audit['same_path_duplicate_groups'])}**", ""]
    lines += ["## Totales", "",
              f"- Total de libros: **{counters['total']}**",
              f"- Portadas nuevas ilustradas: **{counters['covers_generated']}**",
              f"- Portadas desde arte local: **{counters.get('covers_local_art', 0)}**",
              f"- Portadas desde IA: **{counters['covers_generated'] - counters.get('covers_local_art', 0)}**",
              f"- Portadas procedurales: **{counters['covers_fallback']}**",
              f"- Portadas conservadas: **{counters['covers_kept']}**",
              f"- Portadas fallidas: **{counters['covers_failed']}**",
              f"- Sinopsis creadas: **{counters['synopsis_generated']}**",
              f"- Sinopsis conservadas: **{counters['synopsis_kept']}**",
              f"- Sinopsis fallidas: **{counters['synopsis_failed']}**",
              f"- Libros marcados para revisión: **{counters['needs_review']}**", ""]
    lines += ["## Detalle", "",
              "| Slug | Sinopsis | Fuente | Palabras | Portada | Fuente | KB | Revisión |",
              "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        s, c = r["synopsis"], r["cover"]
        lines.append(f"| {r['slug']} | {s['status']} | {s['source']} | {s['words']} | "
                     f"{c['status']} | {c['source']} | {c['bytes']/1024:.0f} | "
                     f"{'SÍ' if r['needs_review'] else ''} |")
    review = [r for r in rows if r["needs_review"]]
    if review:
        lines += ["", "## Requiere revisión", ""]
        for r in review:
            lines.append(f"- **{r['slug']}** — " + " | ".join(r["messages"]))
    failed = [r for r in rows if r["synopsis"]["status"] == "failed" or r["cover"]["status"] == "failed"]
    if failed:
        lines += ["", "## Fallos", ""]
        for r in failed:
            lines.append(f"- **{r['slug']}** — " + " | ".join(r["messages"]))
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
