from django.db import migrations, models


def seed_cosmetics(apps, schema_editor):
    from learning.cosmetics_catalog import sync_cosmetics
    sync_cosmetics(apps.get_model('learning', 'ShopItem'))


def fix_equipped_titles(apps, schema_editor):
    """Equipar un título guardaba el nombre del artículo ('Título "Erudito Clásico"'), no el título."""
    ShopItem = apps.get_model('learning', 'ShopItem')
    Profile = apps.get_model('users', 'Profile')
    for item in ShopItem.objects.filter(item_type='title').exclude(value=''):
        Profile.objects.filter(equipped_title=item.name).update(equipped_title=item.value)


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0004_seed_tavern_wearables'),
        ('users', '0012_profile_birth_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='shopitem',
            name='is_purchasable',
            field=models.BooleanField(default=True, help_text='Falso = exclusivo: no se vende en El Bazar, solo se gana con un logro.'),
        ),
        migrations.RunPython(seed_cosmetics, migrations.RunPython.noop),
        migrations.RunPython(fix_equipped_titles, migrations.RunPython.noop),
    ]
