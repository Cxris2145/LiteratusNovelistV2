"""
library/management/commands/seed_achievements.py
Puebla el catálogo de logros con los logros iniciales de Literatus Novelist.

Uso:
    python manage.py seed_achievements

Es idempotente: usa update_or_create con el código como lookup,
por lo que se puede ejecutar múltiples veces sin duplicar datos.
"""
from django.core.management.base import BaseCommand
from library.models import Achievement


ACHIEVEMENTS = [
    # -------------------------------------------------------------------------
    # LECTURA — Hitos de progreso
    # -------------------------------------------------------------------------
    {
        'code': 'first_chapter',
        'title': 'Primera Página',
        'description': 'Abriste tu primer libro y comenzaste a leer. ¡El viaje comienza aquí!',
        'category': Achievement.Category.READING,
        'icon': '📖',
        'threshold': 1,
        'ink_reward': 5,
        'sort_order': 10,
    },
    {
        'code': 'first_book',
        'title': 'Obra Completa',
        'description': 'Terminaste tu primer libro de principio a fin. ¡Eres un lector de verdad!',
        'category': Achievement.Category.READING,
        'icon': '📚',
        'threshold': 1,
        'ink_reward': 20,
        'sort_order': 20,
    },
    {
        'code': 'books_5',
        'title': 'Bibliófilo',
        'description': 'Has completado 5 libros. Tu biblioteca personal está creciendo.',
        'category': Achievement.Category.READING,
        'icon': '🎯',
        'threshold': 5,
        'ink_reward': 30,
        'sort_order': 30,
    },
    {
        'code': 'books_10',
        'title': 'Devorador de Libros',
        'description': '10 libros completados. La literatura corre por tus venas.',
        'category': Achievement.Category.READING,
        'icon': '🔥',
        'threshold': 10,
        'ink_reward': 50,
        'sort_order': 40,
    },

    # -------------------------------------------------------------------------
    # RACHA — Días consecutivos de lectura
    # -------------------------------------------------------------------------
    {
        'code': 'streak_3',
        'title': 'Lector Constante',
        'description': '3 días seguidos leyendo. ¡Estás formando un hábito!',
        'category': Achievement.Category.STREAK,
        'icon': '⚡',
        'threshold': 3,
        'ink_reward': 10,
        'sort_order': 50,
    },
    {
        'code': 'streak_7',
        'title': 'Semana de Lectura',
        'description': '7 días seguidos. Una semana completa dedicada a los libros.',
        'category': Achievement.Category.STREAK,
        'icon': '🌟',
        'threshold': 7,
        'ink_reward': 25,
        'sort_order': 60,
    },
    {
        'code': 'streak_30',
        'title': 'Maratón Literario',
        'description': '30 días sin parar. Eres un lector extraordinario.',
        'category': Achievement.Category.STREAK,
        'icon': '👑',
        'threshold': 30,
        'ink_reward': 100,
        'sort_order': 70,
    },

    # -------------------------------------------------------------------------
    # EXPLORACIÓN — Géneros literarios
    # -------------------------------------------------------------------------
    {
        'code': 'classic_explorer_3',
        'title': 'Explorador de Clásicos',
        'description': 'Has completado 3 libros del mismo género. ¡Un verdadero explorador literario!',
        'category': Achievement.Category.EXPLORATION,
        'icon': '🗺️',
        'threshold': 3,
        'ink_reward': 15,
        'sort_order': 80,
    },
    {
        'code': 'classic_explorer_10',
        'title': 'Maestro del Género',
        'description': '10 libros completados en un mismo género. ¡Eres un experto!',
        'category': Achievement.Category.EXPLORATION,
        'icon': '🏛️',
        'threshold': 10,
        'ink_reward': 50,
        'sort_order': 90,
    },

    # -------------------------------------------------------------------------
    # HORARIO — Lectura en horas especiales
    # -------------------------------------------------------------------------
    {
        'code': 'night_owl',
        'title': 'Lector Nocturno',
        'description': 'Leíste entre la medianoche y las 5 AM. Los mejores mundos se descubren de noche.',
        'category': Achievement.Category.TIME,
        'icon': '🦉',
        'threshold': 1,
        'ink_reward': 10,
        'sort_order': 100,
    },
    {
        'code': 'night_owl_10',
        'title': 'Búho Veterano',
        'description': 'Leer de noche no es algo ocasional para ti: ya son 10 sesiones nocturnas.',
        'category': Achievement.Category.TIME,
        'icon': '🌙',
        'threshold': 10,
        'ink_reward': 30,
        'sort_order': 110,
    },
    {
        'code': 'early_bird',
        'title': 'Madrugador',
        'description': 'Leíste entre las 5 y las 8 de la mañana. ¡El mejor comienzo del día!',
        'category': Achievement.Category.TIME,
        'icon': '🐦',
        'threshold': 1,
        'ink_reward': 10,
        'sort_order': 120,
    },
    # -------------------------------------------------------------------------
    # SOCIAL / CONVERSACIONES - Interacción con personajes IA
    # -------------------------------------------------------------------------
    {
        'code': 'social_first_chat',
        'title': 'Forastero curioso',
        'description': 'Al iniciar la primera conversación con un personaje.',
        'category': Achievement.Category.SOCIAL,
        'icon': '🗣️',
        'threshold': 1,
        'ink_reward': 5,
        'sort_order': 200,
    },
    {
        'code': 'social_fluent',
        'title': 'Tertuliano',
        'description': 'Mantuviste 1 conversación fluida y sustancial con un personaje.',
        'category': Achievement.Category.SOCIAL,
        'icon': '🎭',
        'threshold': 1,
        'ink_reward': 20,
        'sort_order': 210,
    },
    {
        'code': 'social_fluent_5',
        'title': 'Aristócrata del Diálogo',
        'description': 'Has mantenido conversaciones fluidas y sustanciales con 5 personajes distintos.',
        'category': Achievement.Category.SOCIAL,
        'icon': '🎩',
        'threshold': 5,
        'ink_reward': 40,
        'sort_order': 215,
    },
    {
        'code': 'social_5_chars',
        'title': 'Socialité de Ficción',
        'description': 'Has conversado con más de 5 personajes literarios distintos.',
        'category': Achievement.Category.SOCIAL,
        'icon': '🍷',
        'threshold': 6,
        'ink_reward': 30,
        'sort_order': 220,
    },
    {
        'code': 'social_10_books',
        'title': 'Viajero de Mundos',
        'description': 'Conversaste con personajes en 10 libros distintos.',
        'category': Achievement.Category.SOCIAL,
        'icon': '🌍',
        'threshold': 10,
        'ink_reward': 50,
        'sort_order': 230,
    },
]


class Command(BaseCommand):
    help = 'Puebla el catálogo de logros de Literatus Novelist con los datos iniciales.'

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0

        for data in ACHIEVEMENTS:
            obj, created = Achievement.objects.update_or_create(
                code=data['code'],
                defaults=data,
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'  [OK] Creado: {obj.code}'))
            else:
                updated_count += 1
                self.stdout.write(f'  [->] Actualizado: {obj.code}')

        self.stdout.write(
            self.style.SUCCESS(
                f'\nSeed completado: {created_count} creados, {updated_count} actualizados.'
            )
        )
