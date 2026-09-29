"""
Calcula y guarda el vocabulario (lemas, tipo de palabra y frecuencia) de los libros.

    python manage.py build_vocabulary el-principito          # un libro
    python manage.py build_vocabulary --missing              # los libros que aún no lo tienen
    python manage.py build_vocabulary --all                  # todos (recalcula los existentes)
    python manage.py build_vocabulary --missing --limit 50   # de a poco

Necesita spaCy y su modelo de español, que NO van en requirements.txt (Render no los usa):
    pip install -r requirements-vocabulary.txt
"""
import time

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count

from catalog import vocabulary
from catalog.models import Book, BookVocabulary


class Command(BaseCommand):
    help = 'Calcula con spaCy el vocabulario de los libros y lo guarda para el lector.'

    def add_arguments(self, parser):
        parser.add_argument('slugs', nargs='*', help='Slugs de los libros, ej. el-principito.')
        parser.add_argument('--missing', action='store_true', help='Solo los libros sin vocabulario.')
        parser.add_argument('--all', action='store_true', dest='all_books',
                            help='Todos los libros con capítulos.')
        parser.add_argument('--limit', type=int, default=0, help='Máximo de libros a procesar.')

    def handle(self, *args, slugs, missing=False, all_books=False, limit=0, **options):
        if not (slugs or missing or all_books):
            raise CommandError('Indica uno o más slugs, --missing o --all.')

        books = Book.objects.annotate(chapter_total=Count('chapters')).filter(chapter_total__gt=0)
        if slugs:
            books = books.filter(slug__in=slugs)
            found = set(books.values_list('slug', flat=True))
            for slug in sorted(set(slugs) - found):
                self.stdout.write(self.style.WARNING(f'No existe un libro con capítulos y slug "{slug}".'))
        if missing:
            done = BookVocabulary.objects.values_list('book_id', flat=True)
            books = books.exclude(pk__in=done)
        books = books.order_by('title')
        if limit:
            books = books[:limit]

        try:
            nlp = vocabulary.load_nlp()
        except vocabulary.VocabularyUnavailable as e:
            raise CommandError(str(e))

        total = len(books)
        started = time.monotonic()
        for position, book in enumerate(books, start=1):
            t0 = time.monotonic()
            try:
                result = vocabulary.build_book_vocabulary(book, nlp)
            except Exception as e:  # un libro con HTML roto no debe frenar el resto
                self.stdout.write(self.style.ERROR(f'[{position}/{total}] {book.slug}: {e}'))
                continue
            self.stdout.write(self.style.SUCCESS(
                f'[{position}/{total}] {book.slug}: {result.lemma_count:,} palabras distintas, '
                f'{len(result.data) / 1024:.0f} KB ({time.monotonic() - t0:.1f} s)'))

        if total:
            self.stdout.write(f'Listo: {total} libro(s) en {time.monotonic() - started:.0f} s.')
        else:
            self.stdout.write('No hay libros que procesar.')
