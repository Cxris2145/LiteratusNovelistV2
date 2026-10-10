"""
library/management/commands/seed_achievements.py
Sincroniza el catálogo de logros con library/achievement_catalog.py.

Uso:
    python manage.py seed_achievements            # crea los que falten y fija rareza y premio
    python manage.py seed_achievements --texts    # además reescribe títulos, umbrales y Tinta

Es idempotente. La migración library/0011 hace lo mismo al desplegar, así que solo hace
falta para recuperar textos editados por error (--texts).
"""
from django.core.management.base import BaseCommand

from learning.models import ShopItem
from library.achievement_catalog import ACHIEVEMENTS, sync_achievements
from library.models import Achievement


class Command(BaseCommand):
    help = 'Sincroniza el catálogo de logros de Literatus Novelist.'

    def add_arguments(self, parser):
        parser.add_argument('--texts', action='store_true',
                            help='Reescribe también títulos, descripciones, umbrales y Tinta.')

    def handle(self, *args, **options):
        before = Achievement.objects.count()
        sync_achievements(Achievement, ShopItem, overwrite_texts=options['texts'])
        created = Achievement.objects.count() - before
        self.stdout.write(self.style.SUCCESS(
            f'Catálogo sincronizado: {len(ACHIEVEMENTS)} logros ({created} nuevos).'))
