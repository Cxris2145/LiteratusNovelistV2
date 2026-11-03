from django.db import migrations

# Precio con que nacieron los marcos clásicos, antes de la escala por rareza (FRAME_PRICES).
OLD_FRAME_PRICES = {
    'frame_parchment': 60, 'frame_gold': 80, 'frame_inkblue': 90,
    'frame_victorian': 100, 'frame_autumn': 120, 'frame_constellation': 150,
}


def seed_animated_frames(apps, schema_editor):
    """Siembra los marcos animados y pasa los clásicos a la escala por rareza (si nadie los reajustó a mano)."""
    from learning.cosmetics_catalog import COSMETICS, sync_cosmetics
    ShopItem = apps.get_model('learning', 'ShopItem')
    sync_cosmetics(ShopItem)
    prices = {row[0]: row[5] for row in COSMETICS}
    for code, old_price in OLD_FRAME_PRICES.items():
        ShopItem.objects.filter(code=code, cost_ink=old_price).update(cost_ink=prices[code])


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0007_path_chests_and_rewards'),
    ]

    operations = [
        migrations.RunPython(seed_animated_frames, migrations.RunPython.noop),
    ]
