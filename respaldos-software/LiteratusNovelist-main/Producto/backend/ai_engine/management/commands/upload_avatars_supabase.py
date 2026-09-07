"""
ai_engine/management/commands/upload_avatars_supabase.py

Sube los retratos locales (MEDIA_ROOT/ai_avatars/<uuid>.webp, generados por
`python manage.py generate_avatars`) a Supabase Storage y enlaza cada uno en
AIAvatar.avatar_image. Es el gemelo de
catalog/management/commands/upload_covers_supabase.py.

En avatar_image se guarda SOLO la ruta relativa dentro del bucket; con
settings.MEDIA_URL apuntando a .../storage/v1/object/public/<bucket>/, el
serializer del hub la convierte en URL pública sin más cambios.

Necesita en el .env (o en el entorno de Render):
    SUPABASE_URL=https://TU-PROYECTO.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...   (service_role, NO la anon)

Uso:
    python manage.py upload_avatars_supabase --dry-run
    python manage.py upload_avatars_supabase --workers 8
"""

import mimetypes
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from ai_engine.models import AIAvatar


class Command(BaseCommand):
    help = "Sube retratos de personajes a Supabase Storage y enlaza AIAvatar.avatar_image."

    def add_arguments(self, parser):
        parser.add_argument(
            "--source",
            default=None,
            help="Carpeta con <uuid>.webp. Por defecto MEDIA_ROOT/ai_avatars.",
        )
        parser.add_argument("--bucket", default="literatus-media")
        parser.add_argument("--path", default="ai_avatars", help="Prefijo dentro del bucket.")
        parser.add_argument("--workers", type=int, default=8)
        parser.add_argument("--dry-run", action="store_true", help="No sube nada, solo muestra qué haría.")

    def handle(self, *args, **opts):
        w = self.stdout.write

        supabase_url = (getattr(settings, "SUPABASE_URL", None) or os.getenv("SUPABASE_URL") or "").rstrip("/")
        service_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY") or ""
        if not supabase_url or not service_key:
            raise CommandError("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el entorno/.env")

        src = Path(opts["source"]) if opts["source"] else Path(settings.MEDIA_ROOT) / "ai_avatars"
        src = src.expanduser().resolve()
        if not src.is_dir():
            raise CommandError(f"No existe la carpeta de retratos: {src}")

        bucket, prefix = opts["bucket"], opts["path"].strip("/")

        # Solo los <uuid>.webp sueltos en la raíz: manga_assets/ y demás subcarpetas
        # siguen su propio flujo y no se tocan aquí.
        jobs = [(p.stem, p) for p in sorted(src.glob("*.webp"))]
        w(f"Retratos encontrados: {len(jobs)} en {src}")
        if not jobs:
            w(self.style.SUCCESS("Nada que subir."))
            return

        if opts["dry_run"]:
            for uid, _ in jobs[:20]:
                w(f"  subiría {uid}.webp -> {prefix}/{uid}.webp")
            w(f"... ({len(jobs)} en total). Sin --dry-run se suben.")
            return

        def upload(uid, path):
            filename = f"{uid}.webp"
            ctype = mimetypes.guess_type(path)[0] or "image/webp"
            api = f"{supabase_url}/storage/v1/object/{bucket}/{prefix}/{filename}"
            headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": ctype}
            data = path.read_bytes()
            r = requests.post(api, headers=headers, data=data, timeout=60)
            # El bucket rechaza el POST si el objeto ya existe: se reintenta con PUT
            # para que el comando sea relanzable.
            if r.status_code == 400 and "Duplicate" in r.text:
                r = requests.put(api, headers=headers, data=data, timeout=60)
            if r.status_code not in (200, 201):
                return uid, False, f"{r.status_code} {r.text[:120]}"
            return uid, True, f"{prefix}/{filename}"

        ok = fail = 0
        uploaded = {}

        # Solo la subida va en hilos. El enlazado en base se hace después, en el
        # hilo principal y con un único bulk_update, para no abrir una conexión
        # por worker contra el pooler de Supabase.
        with ThreadPoolExecutor(max_workers=opts["workers"]) as ex:
            futs = {ex.submit(upload, u, p): u for u, p in jobs}
            for i, fut in enumerate(as_completed(futs), 1):
                uid, good, msg = fut.result()
                if good:
                    ok += 1
                    uploaded[uid] = msg
                else:
                    fail += 1
                w(f"[{i}/{len(jobs)}] {'ok ' if good else 'ERR'} {uid}: {msg}")

        w(f"\nSubidas {ok}, fallidas {fail}. Enlazando en la base...")

        linked = 0
        pending = []
        for avatar in AIAvatar.objects.filter(pk__in=list(uploaded.keys())).iterator(chunk_size=500):
            avatar.avatar_image = uploaded[str(avatar.pk)]
            pending.append(avatar)
            if len(pending) >= 500:
                AIAvatar.objects.bulk_update(pending, ["avatar_image"])
                linked += len(pending)
                pending = []
        if pending:
            AIAvatar.objects.bulk_update(pending, ["avatar_image"])
            linked += len(pending)

        huerfanos = ok - linked
        w(self.style.SUCCESS(f"Enlazados {linked} avatares."))
        if huerfanos > 0:
            w(self.style.WARNING(f"{huerfanos} archivos subidos sin AIAvatar con ese UUID."))
