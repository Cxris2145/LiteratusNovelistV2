"""
Genera la narración con voz neural (Azure) de los capítulos de un libro, una sola vez.

    python manage.py narrate_book el-principito --dry-run
    python manage.py narrate_book el-principito
    python manage.py narrate_book el-principito --chapters 1-3

Respeta el tope mensual AZURE_TTS_MONTHLY_BOOK_CHARS. Sirve para dejar listos los libros
destacados antes de que un lector los abra (los capítulos ya narrados no se regeneran).
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from catalog import narration
from catalog.models import Book


class Command(BaseCommand):
    help = 'Genera y guarda la narración con voz neural (Azure) de los capítulos de un libro.'

    def add_arguments(self, parser):
        parser.add_argument('slug', help='Slug del libro, ej. el-principito.')
        parser.add_argument('--chapters', help='Capítulos por su número de orden: 3 o 1-5.')
        parser.add_argument('--dry-run', action='store_true',
                            help='Solo calcula cuántos caracteres del cupo gastaría.')

    def handle(self, *args, slug, chapters=None, dry_run=False, **options):
        book = Book.objects.filter(slug=slug).first()
        if book is None:
            raise CommandError(f'No existe un libro con slug "{slug}".')

        queryset = book.chapters.order_by('order')
        if chapters:
            first, _, last = chapters.partition('-')
            try:
                first, last = int(first), int(last or first)
            except ValueError:
                raise CommandError('--chapters debe ser un número o un rango, por ejemplo 1-5.')
            queryset = queryset.filter(order__gte=first, order__lte=last)

        used, budget = narration.monthly_chars_used(), settings.AZURE_TTS_MONTHLY_BOOK_CHARS
        self.stdout.write(f'Cupo de narración de este mes: {used:,} de {budget:,} caracteres usados.')

        total = 0
        for chapter in queryset:
            label = f'Capítulo {chapter.order} ({chapter.title or "sin título"})'
            words, pauses = narration.chapter_words(chapter.content_html)
            chars = narration.billed_chars(words, pauses) if words else 0
            total += chars
            if dry_run:
                self.stdout.write(f'{label}: {chars:,} caracteres')
                continue

            result = narration.request_chapter_narration(chapter, user=None, run_async=False)
            if result.status == narration.READY:
                self.stdout.write(self.style.SUCCESS(f'{label}: lista'))
                continue
            self.stdout.write(self.style.WARNING(f'{label}: {result.message or result.status}'))
            if result.reason in ('monthly_budget', 'quota', 'not_configured'):
                break

        if dry_run:
            self.stdout.write(f'Total: {total:,} caracteres (quedan {max(budget - used, 0):,} este mes).')
