"""
catalog/management/commands/restore_untitled_covers.py

Reemplaza las portadas con título impreso del Storage actual (SUPABASE_URL)
por las ilustraciones originales sin texto que siguen en el proyecto antiguo
(--source-url), con el mismo nombre de archivo, así que la base no cambia.

Antes de sobrescribir, copia cada portada con título a
<bucket>/book_covers_con_titulo/<archivo> para poder volver atrás. Si el
respaldo ya existe no se toca, así que el comando se puede relanzar.

Necesita en el .env:
    SUPABASE_URL=https://TU-PROYECTO.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...   (service_role, NO la anon)

Uso:
    python manage.py restore_untitled_covers                # prueba en seco
    python manage.py restore_untitled_covers --apply        # reemplaza
"""

import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

OLD_PROJECT = "https://srbmswjsbkpftjabcurg.supabase.co"


class Command(BaseCommand):
    help = "Cambia las portadas con título por las ilustraciones sin texto del proyecto antiguo, con respaldo."

    def add_arguments(self, parser):
        parser.add_argument("--source-url", default=OLD_PROJECT, help="Proyecto con las portadas sin título.")
        parser.add_argument("--bucket", default="literatus-media")
        parser.add_argument("--path", default="book_covers")
        parser.add_argument("--backup-path", default="book_covers_con_titulo")
        parser.add_argument("--workers", type=int, default=8)
        parser.add_argument("--limit", type=int, default=0, help="Procesa solo las primeras N (para probar).")
        parser.add_argument("--apply", action="store_true", help="Sin esto solo muestra qué haría.")

    def handle(self, *args, **opts):
        w = self.stdout.write
        target = (getattr(settings, "SUPABASE_URL", None) or os.getenv("SUPABASE_URL") or "").rstrip("/")
        key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY") or ""
        if not target or not key:
            raise CommandError("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el entorno/.env")
        source = opts["source_url"].rstrip("/")
        if source == target:
            raise CommandError("El proyecto de origen y el de destino son el mismo.")

        bucket, prefix, backup = opts["bucket"], opts["path"].strip("/"), opts["backup_path"].strip("/")
        auth = {"apikey": key, "Authorization": f"Bearer {key}"}
        http = requests.Session()

        names = self._list(http, target, bucket, prefix, auth)
        if opts["limit"]:
            names = names[: opts["limit"]]
        w(f"Portadas en {target} /{bucket}/{prefix}: {len(names)}")

        def public(base, folder, name):
            return f"{base}/storage/v1/object/public/{bucket}/{folder}/{name}"

        def inspect(name):
            old = http.head(public(source, prefix, name), timeout=30)
            if old.status_code != 200:
                return name, "sin_original", None
            cur = http.head(public(target, prefix, name), timeout=30)
            same = cur.status_code == 200 and cur.headers.get("etag") == old.headers.get("etag")
            return name, "igual" if same else "cambia", None

        def replace(name):
            old = http.get(public(source, prefix, name), timeout=60)
            if old.status_code != 200:
                return name, "sin_original", None
            # 1. Respaldo de la portada con título (si ya existe, se conserva el primero).
            copy = http.post(
                f"{target}/storage/v1/object/copy",
                headers={**auth, "Content-Type": "application/json"},
                json={"bucketId": bucket, "sourceKey": f"{prefix}/{name}", "destinationKey": f"{backup}/{name}"},
                timeout=60,
            )
            if copy.status_code not in (200, 201) and "already exists" not in copy.text.lower() and "duplicate" not in copy.text.lower():
                return name, "error", f"respaldo {copy.status_code} {copy.text[:100]}"
            # 2. Sube la versión sin título encima, con el mismo nombre.
            up = http.post(
                f"{target}/storage/v1/object/{bucket}/{prefix}/{name}",
                headers={**auth, "Content-Type": old.headers.get("content-type", "image/jpeg"),
                         "x-upsert": "true", "cache-control": "max-age=3600"},
                data=old.content,
                timeout=120,
            )
            if up.status_code not in (200, 201):
                return name, "error", f"subida {up.status_code} {up.text[:100]}"
            return name, "reemplazada", None

        job = replace if opts["apply"] else inspect
        counts = {}
        errors = []
        with ThreadPoolExecutor(max_workers=opts["workers"]) as ex:
            futs = [ex.submit(job, n) for n in names]
            for i, fut in enumerate(as_completed(futs), 1):
                try:
                    name, state, detail = fut.result()
                except requests.RequestException as exc:
                    name, state, detail = "?", "error", str(exc)[:120]
                counts[state] = counts.get(state, 0) + 1
                if state == "error":
                    errors.append(f"{name}: {detail}")
                if i % 100 == 0:
                    w(f"  {i}/{len(names)}...")

        w("")
        for state, n in sorted(counts.items()):
            w(f"  {state}: {n}")
        for line in errors[:20]:
            w(self.style.ERROR(f"  {line}"))
        if opts["apply"]:
            w(self.style.SUCCESS(f"Listo. Las portadas con título quedaron en /{bucket}/{backup}/."))
        else:
            w(self.style.WARNING("Prueba en seco: no se cambió nada. Usa --apply para reemplazar."))

    def _list(self, http, base, bucket, prefix, auth):
        names, offset = [], 0
        while True:
            r = http.post(
                f"{base}/storage/v1/object/list/{bucket}",
                headers={**auth, "Content-Type": "application/json"},
                json={"prefix": prefix, "limit": 1000, "offset": offset, "sortBy": {"column": "name", "order": "asc"}},
                timeout=60,
            )
            if r.status_code != 200:
                raise CommandError(f"No se pudo listar {bucket}/{prefix}: {r.status_code} {r.text[:200]}")
            page = [o["name"] for o in r.json() if o.get("id")]  # sin subcarpetas
            names.extend(page)
            if len(r.json()) < 1000:
                return names
            offset += 1000
