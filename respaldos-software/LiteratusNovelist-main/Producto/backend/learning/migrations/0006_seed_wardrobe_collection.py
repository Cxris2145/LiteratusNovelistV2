from django.db import migrations


# Copia congelada: no importar catálogos vivos en una migración de datos.
WARDROBE_ADDITIONS = [
    ('wear_head_hood', 'head:hood', 'Capucha del viajero',
     'Una capucha de bosque para recorrer los caminos de cada historia.', 150, 'hiking'),
    ('wear_head_newsboy', 'head:newsboy', 'Gorra del cronista',
     'La gorra de quien siempre encuentra una historia que contar.', 110, 'history_edu'),
    ('wear_head_nightcap', 'head:nightcap', 'Gorro de lectura',
     'Un gorro suave para acompañar un último capítulo antes de dormir.', 100, 'bedtime'),
    ('wear_eyes_rectangular', 'eyes:rectangular', 'Lentes ámbar',
     'Montura rectangular de color ámbar para mirar de cerca cada detalle.', 90, 'eyeglasses'),
    ('wear_face_freckles', 'face:freckles', 'Pecas de aventurero',
     'Pequeñas pecas doradas que cuentan historias de viajes bajo el sol.', 60, 'face'),
    ('wear_neck_satchel', 'neck:satchel', 'Bandolera de pergaminos',
     'Un bolso cruzado para llevar notas, mapas y comienzos de novelas.', 160, 'work'),
    ('wear_neck_moon_pendant', 'neck:moon-pendant', 'Amuleto de luna',
     'Una luna plateada que acompaña las lecturas bajo las estrellas.', 180, 'dark_mode'),
    ('wear_cape_teal', 'cape:teal', 'Capa del bibliotecario',
     'Una capa verde petróleo para cuidar los secretos de la biblioteca.', 140, 'local_library'),
    ('wear_cape_ivory', 'cape:ivory', 'Capa marfil',
     'Tela color pergamino con bordes dorados para las grandes ocasiones.', 160, 'apparel'),
    ('wear_cape_starry', 'cape:starry', 'Capa de constelaciones',
     'Una capa azul de noche bordada con estrellas y constelaciones.', 220, 'auto_awesome'),
]


def seed_wardrobe(apps, schema_editor):
    ShopItem = apps.get_model('learning', 'ShopItem')
    items = ShopItem.objects.using(schema_editor.connection.alias)
    for order, (code, value, name, description, cost, icon) in enumerate(WARDROBE_ADDITIONS, start=110):
        items.get_or_create(code=code, defaults={
            'item_type': 'maguito_wear', 'value': value, 'name': name,
            'description': description, 'cost_ink': cost, 'icon': icon,
            'sort_order': order, 'is_active': True, 'is_purchasable': True,
        })


class Migration(migrations.Migration):
    dependencies = [
        ('learning', '0005_cosmetics_v2'),
    ]

    operations = [
        migrations.RunPython(seed_wardrobe, migrations.RunPython.noop),
    ]
