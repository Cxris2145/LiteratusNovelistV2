"""Audita todas las obras; --apply eleva a +18 las identificadas, sin bajar otras edades."""
import csv
import uuid
from pathlib import Path

from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.db import transaction
from catalog.age_classification import adult_rating_reason
from catalog.models import Book


class Command(BaseCommand):
    help = 'Revisa la clasificación de todas las obras; por defecto no modifica la base.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Aplica las clasificaciones +18 detectadas.')
        parser.add_argument('--report', help='Ruta de un CSV con la revisión de cada libro.')

    def handle(self, *args, **options):
        rows = []
        changed_ids = []
        for book in Book.objects.prefetch_related('genres', 'authors').order_by('title').iterator(chunk_size=100):
            genres = [g.name for g in book.genres.all()] + [g.slug for g in book.genres.all()]
            reason = adult_rating_reason(book.slug, book.title, genres)
            proposed = max(book.min_age, 18) if reason else book.min_age
            rows.append({
                'id': str(book.pk), 'title': book.title, 'slug': book.slug,
                'authors': '; '.join(a.full_name for a in book.authors.all()),
                'genres': '; '.join(g.name for g in book.genres.all()),
                'current_min_age': book.min_age, 'proposed_min_age': proposed,
                'reason': reason or ('Se conserva la clasificación existente.' if book.min_age
                                     else 'Sin categoría erótica ni obra +18 identificada en los metadatos.'),
            })
            if proposed != book.min_age:
                changed_ids.append(book.pk)
                self.stdout.write(f'+18: {book.title}')

        if options['report']:
            report = Path(options['report'])
            report.parent.mkdir(parents=True, exist_ok=True)
            with report.open('w', encoding='utf-8-sig', newline='') as file:
                writer = csv.DictWriter(file, fieldnames=list(rows[0]) if rows else [
                    'id', 'title', 'slug', 'authors', 'genres', 'current_min_age', 'proposed_min_age', 'reason'])
                writer.writeheader()
                writer.writerows(rows)

        if options['apply']:
            with transaction.atomic():
                count = Book.objects.filter(pk__in=changed_ids, min_age__lt=18).update(min_age=18)
                transaction.on_commit(lambda: cache.set('catalog:age:revision', uuid.uuid4().hex, None))
            self.stdout.write(self.style.SUCCESS(f'Revisados: {len(rows)}. Clasificados +18: {count}.'))
        else:
            self.stdout.write(f'Revisados: {len(rows)}. Cambios propuestos: {len(changed_ids)}. Simulación; usa --apply para guardar.')
