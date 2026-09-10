"""
catalog/management/commands/fix_book_metadata.py

Repara libros cuyo TÍTULO quedó como el slug "titulizado"
(ej. "Luces De Bohemia Ramon Maria Del Valle Inclan") y/o cuyo AUTOR quedó
como "Autor Desconocido", porque el EPUB de origen no traía metadatos
<dc:title> / <dc:creator> y el importador usó un valor de reserva.

Modos de uso
------------
# 1) Ver qué libros están afectados (NO modifica nada). Opcionalmente vuelca
#    un esqueleto JSON para rellenar a mano:
python manage.py fix_book_metadata --scan
python manage.py fix_book_metadata --scan --out json_data/book_metadata_fixes.json

# 2) Corregir un libro puntual:
python manage.py fix_book_metadata --slug luces-de-bohemia-ramon-maria-del-valle-inclan \
    --title "Luces de bohemia" --author "Ramón María del Valle-Inclán"

# 3) Corregir en lote desde un JSON  { "<slug>": {"title": "...", "author": "..."} }
python manage.py fix_book_metadata --from json_data/book_metadata_fixes.json

# 4) Simular sin escribir:
python manage.py fix_book_metadata --from json_data/book_metadata_fixes.json --dry-run

Al asignar el autor, REUTILIZA un Author existente que coincida por nombre
(case-insensitive) o por slug, de modo que no se creen duplicados.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q
from django.utils.text import slugify

from catalog.models import Author, Book, BookAuthor

_UNKNOWN_AUTHOR = {"autor desconocido", "autor desconocido.", "desconocido", "anónimo desconocido"}


def _looks_like_slug_title(book) -> bool:
    """True si el título es, palabra por palabra, el slug con guiones→espacios
    (lo que produce `slug.replace('-', ' ').title()` en el importador)."""
    normalized_slug = book.slug.replace("-", " ").strip().lower()
    return book.title.strip().lower() == normalized_slug


class Command(BaseCommand):
    help = "Corrige títulos/autores de libros importados sin metadatos del EPUB."

    def add_arguments(self, parser):
        parser.add_argument("--slug", help="Slug del libro a corregir.")
        parser.add_argument("--title", help="Título correcto (con --slug).")
        parser.add_argument("--author", help="Nombre del autor correcto (con --slug).")
        parser.add_argument("--from", dest="from_file",
                            help="JSON { slug: {title, author} } para corregir en lote.")
        parser.add_argument("--scan", action="store_true",
                            help="Sólo listar libros sospechosos (no escribe).")
        parser.add_argument("--out", help="Con --scan: ruta donde volcar el esqueleto JSON.")
        parser.add_argument("--dry-run", action="store_true",
                            help="Muestra los cambios sin aplicarlos.")

    def handle(self, *args, **o):
        if o["scan"]:
            self._scan(o.get("out"))
            return

        fixes = self._collect_fixes(o)

        applied = skipped = 0
        for slug, data in fixes.items():
            book = (Book.objects
                    .prefetch_related("book_authors__author")
                    .filter(slug=slug)
                    .first())
            if not book:
                self.stdout.write(self.style.WARNING(f"  ? {slug}: no está en el catálogo"))
                skipped += 1
                continue

            changes = self._apply(book, data.get("title"), data.get("author"), o["dry_run"])
            if changes:
                prefix = "(simulado) " if o["dry_run"] else ""
                self.stdout.write(self.style.SUCCESS(f"  ✓ {prefix}{slug}"))
                for c in changes:
                    self.stdout.write(f"      {c}")
                applied += 1
            else:
                self.stdout.write(f"  · {slug}: ya estaba correcto")
                skipped += 1

        verb = "se aplicarían" if o["dry_run"] else "aplicados"
        self.stdout.write(self.style.SUCCESS(f"\n{applied} cambio(s) {verb}, {skipped} sin tocar."))

    # ------------------------------------------------------------------
    def _collect_fixes(self, o) -> dict:
        if o["from_file"]:
            path = Path(o["from_file"])
            if not path.exists():
                raise CommandError(f"No existe el archivo {path}")
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise CommandError("El JSON debe ser un objeto { slug: {title, author} }.")
            return data

        if o["slug"]:
            if not (o["title"] or o["author"]):
                raise CommandError("Con --slug indica al menos --title o --author.")
            entry = {}
            if o["title"]:
                entry["title"] = o["title"]
            if o["author"]:
                entry["author"] = o["author"]
            return {o["slug"]: entry}

        raise CommandError("Indica un modo: --scan, --slug o --from.")

    # ------------------------------------------------------------------
    @transaction.atomic
    def _apply(self, book, new_title, new_author, dry_run) -> list:
        changes = []

        if new_title and new_title.strip() and new_title.strip() != book.title:
            changes.append(f'título:  "{book.title}"  →  "{new_title.strip()}"')
            if not dry_run:
                book.title = new_title.strip()
                book.save(update_fields=["title"])

        if new_author and new_author.strip():
            name = new_author.strip()
            current = book.book_authors.select_related("author").first()
            current_name = current.author.full_name if current else "—"
            if current_name.strip().lower() != name.lower():
                author = self._resolve_author(name, dry_run)
                reused = "reutilizado" if (author and author.pk) else "nuevo"
                changes.append(f'autor:   "{current_name}"  →  "{name}" ({reused})')
                if not dry_run and author:
                    book.book_authors.all().delete()
                    BookAuthor.objects.create(book=book, author=author, role="primary")

        return changes

    def _resolve_author(self, name, dry_run):
        """Devuelve un Author existente que coincida por nombre o slug; si no
        existe, lo crea (salvo en dry-run)."""
        candidate = (Author.objects
                     .filter(Q(full_name__iexact=name) | Q(slug=slugify(name)))
                     .first())
        if candidate:
            return candidate
        if dry_run:
            return None
        return Author.objects.create(full_name=name[:255])

    # ------------------------------------------------------------------
    def _scan(self, out):
        rows = {}
        qs = (Book.objects
              .prefetch_related("book_authors__author")
              .order_by("slug"))
        for book in qs.iterator(chunk_size=300):
            authors = list(book.book_authors.all())
            author_name = authors[0].author.full_name if authors else ""
            bad_title = _looks_like_slug_title(book)
            bad_author = (not author_name) or author_name.strip().lower() in _UNKNOWN_AUTHOR
            if bad_title or bad_author:
                rows[book.slug] = {
                    "title": "" if bad_title else book.title,
                    "author": "" if bad_author else author_name,
                    "_detectado": ("titulo " if bad_title else "") + ("autor" if bad_author else ""),
                }

        self.stdout.write(self.style.WARNING(
            f"{len(rows)} libro(s) con título y/o autor sospechoso."
        ))
        payload = json.dumps(rows, ensure_ascii=False, indent=2)
        if out:
            Path(out).write_text(payload, encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(
                f"Esqueleto escrito en {out}.\n"
                "Rellena \"title\"/\"author\", borra la clave \"_detectado\" y ejecuta:\n"
                f"  python manage.py fix_book_metadata --from {out}"
            ))
        else:
            self.stdout.write(payload[:6000])
            if len(payload) > 6000:
                self.stdout.write("… (usa --out para volcar la lista completa)")
