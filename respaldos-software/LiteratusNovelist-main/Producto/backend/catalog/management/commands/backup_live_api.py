"""
catalog/management/commands/backup_live_api.py

Descarga TODO lo que la API pública del despliegue viejo todavía expone y lo
guarda a JSON (indexado por slug). Es la red de seguridad: hazlo ANTES de
tocar nada, por si el equipo anterior apaga su Render/Supabase.

Recupera: libros (título, sinopsis, géneros, tags, autor, precio, portada),
autores (bio, nacionalidad, foto) y géneros. NO recupera el texto de los
capítulos (eso está detrás de login) — ese se reconstruye desde los EPUB.

Uso:
    python manage.py backup_live_api
    python manage.py backup_live_api --base https://otro-backend.onrender.com/api/v1 --out backups/
"""

import json
import time
import urllib.request
from pathlib import Path

from django.core.management.base import BaseCommand

DEFAULT_BASE = "https://literatus-novelist-backend.onrender.com/api/v1"


def _get(url, retries=4):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "literatus-backup/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            wait = 3 * (i + 1)
            print(f"  reintento {i + 1}/{retries} en {wait}s ({exc})")
            time.sleep(wait)
    raise RuntimeError(f"No se pudo leer {url}")


def _paginate(base, path, page_size=50):
    """Recorre un endpoint paginado estilo DRF y devuelve todos los results."""
    out, page = [], 1
    while True:
        data = _get(f"{base}/{path}{'&' if '?' in path else '?'}page={page}&page_size={page_size}")
        results = data.get("results", data if isinstance(data, list) else [])
        out.extend(results)
        if not data.get("next"):
            break
        page += 1
        time.sleep(0.3)
    return out


class Command(BaseCommand):
    help = "Respalda la API pública del despliegue viejo a archivos JSON (por slug)."

    def add_arguments(self, parser):
        parser.add_argument("--base", default=DEFAULT_BASE, help="URL base de la API (sin barra final).")
        parser.add_argument("--out", default="backups/live_api", help="Carpeta de salida.")
        parser.add_argument("--with-details", action="store_true",
                            help="Además baja /catalog/books/<slug>/details/ de cada libro (lento, ~1 req/libro).")

    def handle(self, *args, **opts):
        base = opts["base"].rstrip("/")
        out = Path(opts["out"])
        out.mkdir(parents=True, exist_ok=True)
        w = self.stdout.write

        w(f"Base: {base}")

        w("Bajando géneros...")
        genres = _paginate(base, "catalog/genres/", page_size=100)
        (out / "genres.json").write_text(json.dumps(genres, ensure_ascii=False, indent=1), encoding="utf-8")
        w(f"  {len(genres)} géneros -> {out / 'genres.json'}")

        w("Bajando autores...")
        authors = _paginate(base, "catalog/authors/", page_size=50)
        by_slug = {a.get("slug"): a for a in authors if a.get("slug")}
        (out / "authors.json").write_text(json.dumps(by_slug, ensure_ascii=False, indent=1), encoding="utf-8")
        w(f"  {len(by_slug)} autores -> {out / 'authors.json'}")

        w("Bajando libros...")
        books = _paginate(base, "catalog/books/", page_size=50)
        books_by_slug = {b.get("slug"): b for b in books if b.get("slug")}

        if opts["with_details"]:
            w(f"Bajando detalle de {len(books_by_slug)} libros (esto tarda)...")
            for i, (slug, b) in enumerate(books_by_slug.items(), 1):
                try:
                    b["_details"] = _get(f"{base}/catalog/books/{slug}/details/")
                except Exception as exc:  # noqa: BLE001
                    w(f"  ! {slug}: {exc}")
                if i % 50 == 0:
                    w(f"  {i}/{len(books_by_slug)}")
                time.sleep(0.2)

        (out / "books.json").write_text(json.dumps(books_by_slug, ensure_ascii=False, indent=1), encoding="utf-8")
        w(f"  {len(books_by_slug)} libros -> {out / 'books.json'}")

        w(self.style.SUCCESS(f"\nRespaldo completo en {out.resolve()}"))
        w("Guárdalo fuera de este equipo (Drive, otro repo). Es tu copia de seguridad.")
