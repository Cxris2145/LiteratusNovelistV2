from django.db import migrations

NEW_WEARABLES = [
    ('wear_cape_red', 'cape:red', 'Capa carmesí',
     'Capa roja vibrante para las aventuras más audaces de la Taberna.', 140, 'apparel'),
    ('wear_head_witch_flower', 'head:witch-flower', 'Sombrero de hechicera con flor',
     'Sombrero burdeos de copa curvada, adornado con una flor dorada.', 190, 'local_florist'),
    ('wear_head_aviator', 'head:aviator', 'Gorro de aviador con gafas',
     'Gorro de cuero con antiparras para volar entre relatos y fantasías.', 210, 'flight'),
]


def seed_new_wearables(apps, schema_editor):
    ShopItem = apps.get_model('learning', 'ShopItem')
    for order, (code, value, name, description, cost, icon) in enumerate(NEW_WEARABLES):
        ShopItem.objects.get_or_create(code=code, defaults={
            'name': name,
            'description': description,
            'item_type': 'maguito_wear',
            'cost_ink': cost,
            'icon': icon,
            'value': value,
            'sort_order': 95 + order,
            'is_active': True,
        })


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0003_seed_maguito_wearables'),
    ]

    operations = [
        migrations.RunPython(seed_new_wearables, migrations.RunPython.noop),
    ]
