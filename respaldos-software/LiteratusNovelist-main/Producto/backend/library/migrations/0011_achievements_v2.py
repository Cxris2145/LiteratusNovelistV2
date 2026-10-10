import django.db.models.deletion
from django.db import migrations, models


def sync_catalog(apps, schema_editor):
    from library.achievement_catalog import sync_achievements
    sync_achievements(apps.get_model('library', 'Achievement'), apps.get_model('learning', 'ShopItem'))


def settle_existing_unlocks(apps, schema_editor):
    """
    Lo ya desbloqueado antes de esta versión: entrega los premios que ahora tienen esos
    logros y lo marca como avisado (el aviso de celebración es para lo que se gane de aquí en más).
    """
    UserAchievement = apps.get_model('library', 'UserAchievement')
    UserInventoryItem = apps.get_model('learning', 'UserInventoryItem')
    unlocked = UserAchievement.objects.filter(unlocked_at__isnull=False, deleted_at__isnull=True)
    for user_id, item_id in unlocked.filter(achievement__reward_item__isnull=False) \
            .values_list('user_id', 'achievement__reward_item_id'):
        UserInventoryItem.objects.get_or_create(user_id=user_id, item_id=item_id, defaults={'quantity': 1})
    unlocked.update(notified=True)


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0005_cosmetics_v2'),
        ('library', '0010_userpostit'),
    ]

    operations = [
        migrations.AlterField(
            model_name='achievement',
            name='category',
            field=models.CharField(choices=[
                ('reading', 'Lectura'), ('streak', 'Racha'), ('exploration', 'Exploración'),
                ('time', 'Horario'), ('social', 'Social'), ('learning', 'La Senda'),
                ('games', 'Juegos'), ('reader', 'Lector activo'), ('collection', 'Colección'),
            ], max_length=20),
        ),
        migrations.AddField(
            model_name='achievement',
            name='rarity',
            field=models.CharField(choices=[
                ('common', 'Común'), ('rare', 'Raro'), ('epic', 'Épico'), ('legendary', 'Legendario'),
            ], default='common', max_length=12),
        ),
        migrations.AddField(
            model_name='achievement',
            name='reward_item',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='reward_for', to='learning.shopitem',
                help_text='Marco, título o accesorio que se regala al desbloquearlo (puede ser exclusivo).'),
        ),
        migrations.RunPython(sync_catalog, migrations.RunPython.noop),
        migrations.RunPython(settle_existing_unlocks, migrations.RunPython.noop),
    ]
