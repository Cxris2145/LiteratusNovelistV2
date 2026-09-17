import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from library.models import Mission

def seed_missions():
    missions = [
        {
            'code': 'weekly_read_5',
            'title': 'Lector Constante',
            'description': 'Lee al menos 5 capítulos esta semana.',
            'activity_type': 'chapter_read',
            'target_count': 5,
            'ink_reward': 50,
            'xp_reward': 100,
            'reset_type': 'weekly'
        },
        {
            'code': 'weekly_ai_3',
            'title': 'Amigo de la IA',
            'description': 'Interactúa con personajes IA 3 veces esta semana.',
            'activity_type': 'ai_interaction',
            'target_count': 3,
            'ink_reward': 15,
            'xp_reward': 30,
            'reset_type': 'weekly'
        },
        {
            'code': 'monthly_book_1',
            'title': 'Ratón de Biblioteca',
            'description': 'Completa 1 libro este mes.',
            'activity_type': 'book_completed',
            'target_count': 1,
            'ink_reward': 200,
            'xp_reward': 500,
            'reset_type': 'monthly'
        }
    ]

    for m in missions:
        Mission.objects.update_or_create(
            code=m['code'],
            defaults=m
        )
    print("Misiones creadas/actualizadas con éxito.")

if __name__ == '__main__':
    seed_missions()
