"""
catalog/management/commands/link_local_covers.py

Enlaza las portadas de TODOS los libros usando los archivos locales del repo
(`<source>/<slug>/cover.jpg`), SIN Supabase. Copia cada cover a
MEDIA_ROOT/book_covers/<slug>.jpg y pone `Book.cover_image = book_covers/<slug>.jpg`.

Sirve para desarrollo local (con DEBUG=True Django sirve /media/). Para
producción con Supabase usa `upload_covers_supabase` en su lugar.

Uso:
    python manage.py link_local_covers --source ../../../books
    python manage.py link_local_covers --source ../../../books --dry-run
    python manage.py link_local_covers --source ../../../books --overwrite
"""

import shutil
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from catalog.models import Book


class Command(BaseCommand):
    help = "Enlaza Book.cover_image a los cover.jpg locales del repo (sin Supabase)."

    def add_arguments(self, parser):
        parser.add_argument("--source", required=True, help="Carpeta con subcarpetas <slug>/cover.jpg")
        parser.add_argument("--overwrite", action="store_true", help="Reemplaza portadas ya enlazadas.")
        parser.add_argument("--dry-run", action="store_true", help="No copia ni guarda; solo informa.")

    def handle(self, *args, **opts):
        src = Path(opts["source"]).expanduser().resolve()
        if not src.is_dir():
            raise CommandError(f"--source no existe: {src}")

        dest_dir = Path(settings.MEDIA_ROOT) / "book_covers"
        w = self.stdout.write
        w(f"Fuente: {src}")
        w(f"Destino: {dest_dir}  (MEDIA_URL={settings.MEDIA_URL})")
        if not opts["dry_run"]:
            dest_dir.mkdir(parents=True, exist_ok=True)

        linked = skipped = no_book = no_file = 0
        for folder in sorted(f for f in src.iterdir() if f.is_dir()):
            slug = folder.name
            cover = folder / "cover.jpg"
            if not cover.exists():
                no_file += 1
                continue
            book = Book.objects.filter(slug=slug).first()
            if not book:
                no_book += 1
                continue
            if book.cover_image and not opts["overwrite"]:
                skipped += 1
                continue

            rel = f"book_covers/{slug}.jpg"
            if opts["dry_run"]:
                w(f"  {slug}  ->  {rel}")
            else:
                shutil.copyfile(cover, dest_dir / f"{slug}.jpg")
                book.cover_image = rel
                book.save(update_fields=["cover_image"])
            linked += 1

        verb = "se enlazarían" if opts["dry_run"] else "enlazadas"
        w(self.style.SUCCESS(
            f"\nPortadas {verb}: {linked}\n"
            f"  ya tenían portada (saltadas): {skipped}\n"
            f"  cover.jpg sin libro en BD:    {no_book}\n"
            f"  carpetas sin cover.jpg:       {no_file}"
        ))
