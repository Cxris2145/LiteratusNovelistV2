"""
catalog/management/commands/recount_words.py

Recalcula `Book.word_count` (y por tanto el nº de páginas que muestra el
catálogo) a partir del HTML de los capítulos. Útil tras editar contenido o
importar libros sin pasar por `import_epubs`.

Uso:
    python manage.py recount_words              # todos los libros
    python manage.py recount_words --slug la-odisea-homero
    python manage.py recount_words --only-missing   # sólo los que tienen word_count = 0
"""

from django.core.management.base import BaseCommand

from catalog.models import Book


class Command(BaseCommand):
    help = "Recalcula Book.word_count desde el HTML de los capítulos."

    def add_arguments(self, parser):
        parser.add_argument("--slug", default=None, help="Recontar sólo este libro.")
        parser.add_argument(
            "--only-missing",
            action="store_true",
            help="Recontar sólo libros con word_count = 0.",
        )

    def handle(self, *args, **opts):
        qs = Book.objects.all()
        if opts["slug"]:
            qs = qs.filter(slug=opts["slug"])
        if opts["only_missing"]:
            qs = qs.filter(word_count=0)

        total = qs.count()
        done = changed = 0
        for book in qs.iterator(chunk_size=100):
            before = book.word_count
            after = book.recount_words(save=True)
            done += 1
            if before != after:
                changed += 1
            if done % 100 == 0:
                self.stdout.write(f"  [{done}/{total}]")
                self.stdout.flush()

        self.stdout.write(self.style.SUCCESS(
            f"Listo. {done} libros procesados, {changed} actualizados."
        ))
