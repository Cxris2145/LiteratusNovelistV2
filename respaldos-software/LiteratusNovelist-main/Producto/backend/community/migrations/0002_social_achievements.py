from django.db import migrations

# Copia congelada de library/management/commands/seed_achievements.py (sección La Taberna).
ACHIEVEMENTS = [
    ('tavern_first_friend', 'Compañero de Mesa', 'Sentaste a tu primer amigo a tu mesa en La Taberna.', '🍺', 1, 10, 240),
    ('tavern_full_table', 'Mesa Llena', 'Tienes 5 amigos en La Taberna.', '🪑', 5, 25, 245),
    ('tavern_toasted', 'Alma de la Fiesta', 'Tus amigos brindaron 10 veces por ti.', '🥂', 10, 25, 250),
]


def seed(apps, schema_editor):
    """Idempotente: get_or_create por código conserva lo que se ajuste luego en el admin."""
    Achievement = apps.get_model('library', 'Achievement')
    for code, title, description, icon, threshold, ink, order in ACHIEVEMENTS:
        Achievement.objects.get_or_create(code=code, defaults={
            'title': title,
            'description': description,
            'category': 'social',
            'icon': icon,
            'threshold': threshold,
            'ink_reward': ink,
            'sort_order': order,
        })


class Migration(migrations.Migration):

    dependencies = [
        ('community', '0001_initial'),
        ('library', '0008_mission_usermission'),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
