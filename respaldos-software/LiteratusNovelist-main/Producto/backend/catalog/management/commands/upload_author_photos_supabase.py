"""
catalog/management/commands/upload_author_photos_supabase.py

Sube los retratos locales (MEDIA_ROOT/authors/photos/<slug>.jpg, descargados
por `python manage.py fetch_author_photos`) a Supabase Storage y enlaza cada
uno en Author.photo. También completa Author.wikipedia_url desde el
manifiesto que dejó ese comando (_manifest.json), campo que hoy está vacío en
los 313 autores. Es el gemelo de
catalog/management/commands/upload_covers_supabase.py.

Necesita en el .env (o en el entorno de Render):
    SUPABASE_URL=https://TU-PROYECTO.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...   (service_role, NO la anon)

Uso:
    python manage.py upload_author_photos_supabase --dry-run
    python manage.py upload_author_photos_supabase --workers 8
"""

import json
import mimetypes
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from catalog.models import Author


class Command(BaseCommand):
    help = "Sube retratos de autores a Supabase Storage y enlaza Author.photo / Author.wikipedia_url."

    def add_arguments(self, parser):
        parser.add_argument(
            "--source",
            default=None,
            help="Carpeta con <slug>.jpg + _manifest.json. Por defecto MEDIA_ROOT/authors/photos.",
        )
        parser.add_argument("--bucket", default="literatus-media")
        parser.add_argument("--path", default="authors/photos", help="Prefijo dentro del bucket.")
        parser.add_argument("--workers", type=int, default=8)
        parser.add_argument("--dry-run", action="store_true", help="No sube nada, solo muestra qué haría.")

    def handle(self, *args, **opts):
        w = self.stdout.write

        supabase_url = (getattr(settings, "SUPABASE_URL", None) or os.getenv("SUPABASE_URL") or "").rstrip("/")
        service_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY") or ""
        if not supabase_url or not service_key:
            raise CommandError("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el entorno/.env")

        src = Path(opts["source"]) if opts["source"] else Path(settings.MEDIA_ROOT) / "authors" / "photos"
        src = src.expanduser().resolve()
        if not src.is_dir():
            raise CommandError(f"No existe la carpeta de retratos: {src}")

        manifest_path = src / "_manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
        # El manifiesto indexa por pk de Author (UUID en string); se consulta
        # tal cual, sin convertir a int.
        by_pk = manifest

        bucket, prefix = opts["bucket"], opts["path"].strip("/")

        jobs = [(p.stem, p) for p in sorted(src.glob("*.jpg"))]
        w(f"Retratos encontrados: {len(jobs)} en {src}")
        if not jobs:
            w(self.style.SUCCESS("Nada que subir."))
            return

        if opts["dry_run"]:
            for slug, _ in jobs[:20]:
                w(f"  subiría {slug}.jpg -> {prefix}/{slug}.jpg")
            w(f"... ({len(jobs)} en total). Sin --dry-run se suben.")
            return

        def upload(slug, path):
            filename = f"{slug}.jpg"
            ctype = mimetypes.guess_type(path)[0] or "image/jpeg"
            api = f"{supabase_url}/storage/v1/object/{bucket}/{prefix}/{filename}"
            headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": ctype}
            data = path.read_bytes()
            r = requests.post(api, headers=headers, data=data, timeout=60)
            # El bucket rechaza el POST si el objeto ya existe: se reintenta con PUT
            # para que el comando sea relanzable.
            if r.status_code == 400 and "Duplicate" in r.text:
                r = requests.put(api, headers=headers, data=data, timeout=60)
            if r.status_code not in (200, 201):
                return slug, False, f"{r.status_code} {r.text[:120]}"
            return slug, True, f"{prefix}/{filename}"

        ok = fail = 0
        uploaded = {}

        with ThreadPoolExecutor(max_workers=opts["workers"]) as ex:
            futs = {ex.submit(upload, s, p): s for s, p in jobs}
            for i, fut in enumerate(as_completed(futs), 1):
                slug, good, msg = fut.result()
                if good:
                    ok += 1
                    uploaded[slug] = msg
                else:
                    fail += 1
                w(f"[{i}/{len(jobs)}] {'ok ' if good else 'ERR'} {slug}: {msg}")

        w(f"\nSubidas {ok}, fallidas {fail}. Enlazando en la base...")

        linked = wiki_linked = 0
        for author in Author.objects.filter(slug__in=list(uploaded.keys())).iterator(chunk_size=200):
            author.photo = uploaded[author.slug]
            entry = by_pk.get(str(author.pk))
            fields = ["photo"]
            if entry and entry.get("wikipedia_url") and not author.wikipedia_url:
                author.wikipedia_url = entry["wikipedia_url"]
                fields.append("wikipedia_url")
                wiki_linked += 1
            author.save(update_fields=fields)
            linked += 1

        huerfanos = ok - linked
        w(self.style.SUCCESS(f"Enlazados {linked} autores ({wiki_linked} con wikipedia_url completado)."))
        if huerfanos > 0:
            w(self.style.WARNING(f"{huerfanos} archivos subidos sin Author con ese slug."))
