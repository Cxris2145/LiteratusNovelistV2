"""
catalog/management/commands/upload_covers_supabase.py

Sube las portadas locales (`<slug>/cover.jpg`) a Supabase Storage y actualiza
`Book.cover_image` con la URL pública. Versión de scripts/sync_covers_supabase.py
como comando de gestión.

Necesita en el .env (o en el entorno de Render):
    SUPABASE_URL=https://TU-PROYECTO.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...   (Project Settings -> API -> service_role, NO la anon)

Uso:
    python manage.py upload_covers_supabase --source ../../books
    python manage.py upload_covers_supabase --source ../../books --workers 8 --dry-run
"""

import mimetypes
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from catalog.models import Book


class Command(BaseCommand):
    help = "Sube portadas a Supabase Storage y enlaza Book.cover_image."

    def add_arguments(self, parser):
        parser.add_argument("--source", required=True, help="Carpeta con subcarpetas <slug>/cover.jpg")
        parser.add_argument("--bucket", default="literatus-media")
        parser.add_argument("--path", default="book_covers", help="Prefijo dentro del bucket.")
        parser.add_argument("--workers", type=int, default=8)
        parser.add_argument("--dry-run", action="store_true", help="No sube nada, solo muestra qué haría.")

    def handle(self, *args, **opts):
        supabase_url = (getattr(settings, "SUPABASE_URL", None) or os.getenv("SUPABASE_URL") or "").rstrip("/")
        service_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY") or ""
        if not supabase_url or not service_key:
            raise CommandError("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el entorno/.env")

        src = Path(opts["source"]).expanduser().resolve()
        if not src.is_dir():
            raise CommandError(f"--source no existe: {src}")

        bucket, prefix = opts["bucket"], opts["path"].strip("/")
        w = self.stdout.write

        jobs = []
        for folder in sorted(f for f in src.iterdir() if f.is_dir()):
            cover = folder / "cover.jpg"
            if cover.exists():
                jobs.append((folder.name, cover))
        w(f"Portadas encontradas: {len(jobs)}")
        if opts["dry_run"]:
            for slug, _ in jobs[:20]:
                w(f"  subiría {slug}/cover.jpg -> {prefix}/{slug}.jpg")
            w(f"... ({len(jobs)} en total). Sin --dry-run se suben.")
            return

        def upload(slug, path):
            filename = f"{slug}.jpg"
            ctype = mimetypes.guess_type(path)[0] or "image/jpeg"
            api = f"{supabase_url}/storage/v1/object/{bucket}/{prefix}/{filename}"
            headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": ctype}
            data = path.read_bytes()
            r = requests.post(api, headers=headers, data=data, timeout=60)
            if r.status_code == 400 and "Duplicate" in r.text:
                r = requests.put(api, headers=headers, data=data, timeout=60)
            if r.status_code not in (200, 201):
                return slug, False, f"{r.status_code} {r.text[:120]}"
            # En cover_image se guarda SOLO la ruta relativa dentro del bucket.
            # settings.MEDIA_URL (= .../public/<bucket>/) la convierte en URL pública.
            book = Book.objects.filter(slug=slug).first()
            if book:
                book.cover_image = f"{prefix}/{filename}"
                book.save(update_fields=["cover_image"])
                return slug, True, "subida + enlazada"
            return slug, True, "subida (sin libro con ese slug)"

        ok = fail = 0
        with ThreadPoolExecutor(max_workers=opts["workers"]) as ex:
            futs = {ex.submit(upload, s, p): s for s, p in jobs}
            for i, fut in enumerate(as_completed(futs), 1):
                slug, good, msg = fut.result()
                ok, fail = (ok + 1, fail) if good else (ok, fail + 1)
                mark = "ok " if good else "ERR"
                w(f"[{i}/{len(jobs)}] {mark} {slug}: {msg}")

        w(self.style.SUCCESS(f"\nSubidas {ok}, fallidas {fail}."))
