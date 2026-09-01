"""
catalog/management/commands/import_api_backup.py

Toma el respaldo generado por `backup_live_api` (JSON por slug) y rellena los
datos que los EPUB no traen: sinopsis, portada (URL pública de Supabase, que
sigue sirviendo), destacados, géneros, tags y la bio/nacionalidad de autores.

Empareja por slug, así que funciona en una base reconstruida desde cero.
No pisa datos que ya existan salvo que pases --overwrite.

Uso:
    python manage.py import_api_backup                       # usa backups/live_api/
    python manage.py import_api_backup --dir backups/live_api --overwrite
"""

import json
import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from catalog.models import Author, Book, Genre, Tag

_PUBLIC_RE = re.compile(r"^https?://[^/]+/storage/v1/object/public/[^/]+/", re.IGNORECASE)


def _cover_relpath(value):
    """Deja la portada como ruta relativa dentro del bucket (MEDIA_URL la completa)."""
    if not value:
        return value
    return _PUBLIC_RE.sub("", value.strip()).lstrip("/")


class Command(BaseCommand):
    help = "Enriquece el catálogo con el respaldo JSON de la API vieja (sinopsis, portadas, géneros, tags, bios)."

    def add_arguments(self, parser):
        parser.add_argument("--dir", default="backups/live_api", help="Carpeta con books.json / authors.json.")
        parser.add_argument("--overwrite", action="store_true", help="Sobrescribe campos que ya tengan valor.")

    def handle(self, *args, **opts):
        base = Path(opts["dir"])
        books_f, authors_f = base / "books.json", base / "authors.json"
        if not books_f.exists():
            raise CommandError(f"No existe {books_f}. Corre primero: python manage.py backup_live_api")
        ow = opts["overwrite"]
        w = self.stdout.write

        books = json.loads(books_f.read_text(encoding="utf-8"))
        authors = json.loads(authors_f.read_text(encoding="utf-8")) if authors_f.exists() else {}

        b_upd = b_miss = 0
        for slug, data in books.items():
            book = Book.objects.filter(slug=slug).first()
            if not book:
                b_miss += 1
                continue
            changed = []

            if data.get("synopsis") and (ow or not book.synopsis):
                book.synopsis = data["synopsis"]
                changed.append("synopsis")
            if data.get("cover_image") and (ow or not book.cover_image):
                book.cover_image = _cover_relpath(data["cover_image"])
                changed.append("cover_image")
            if data.get("is_featured") and not book.is_featured:
                book.is_featured = True
                changed.append("is_featured")

            if changed:
                book.save(update_fields=changed)

            for g in data.get("genres", []) or []:
                name = g.get("name") if isinstance(g, dict) else g
                if name:
                    genre, _ = Genre.objects.get_or_create(name=name.strip())
                    book.genres.add(genre)
            for t in data.get("tags", []) or []:
                name = t.get("name") if isinstance(t, dict) else t
                if name:
                    tag, _ = Tag.objects.get_or_create(name=name.strip())
                    book.tags.add(tag)

            if changed:
                b_upd += 1

        a_upd = 0
        for slug, data in authors.items():
            author = Author.objects.filter(slug=slug).first()
            if not author:
                continue
            fields = []
            if data.get("bio") and (ow or not author.bio):
                author.bio = data["bio"]
                fields.append("bio")
            if data.get("nationality") and (ow or not author.nationality):
                author.nationality = data["nationality"]
                fields.append("nationality")
            if fields:
                author.save(update_fields=fields)
                a_upd += 1

        w(self.style.SUCCESS(
            f"Libros actualizados: {b_upd} (no encontrados por slug: {b_miss}). "
            f"Autores actualizados: {a_upd}."
        ))
