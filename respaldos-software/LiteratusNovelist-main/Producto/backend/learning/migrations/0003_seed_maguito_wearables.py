from django.db import migrations

# (code, value, nombre, descripción, costo, ícono). Copia congelada: la migración no lee código vivo.
WEARABLES = [
    ('wear_eyes_none', 'eyes:none', 'Ojos al natural',
     'Maguito se quita los lentes y mira el mundo tal cual es.', 15, 'visibility'),
    ('wear_neck_bowtie', 'neck:bowtie', 'Pajarita de gala',
     'Para las noches de estreno y las lecturas en voz alta.', 60, 'checkroom'),
    ('wear_neck_scarf', 'neck:scarf-red', 'Bufanda carmesí',
     'Abriga en las madrugadas de lectura junto a la ventana.', 70, 'checkroom'),
    ('wear_face_mustache', 'face:mustache', 'Bigote de detective',
     'Ningún misterio resiste a un bigote bien peinado.', 80, 'face'),
    ('wear_eyes_halfmoon', 'eyes:halfmoon', 'Gafas de media luna',
     'Las gafas de quien ya leyó toda la biblioteca.', 90, 'eyeglasses'),
    ('wear_eyes_monocle', 'eyes:monocle', 'Monóculo del erudito',
     'Un cristal, una cadena dorada y mucha erudición.', 110, 'eyeglasses'),
    ('wear_head_beret', 'head:beret', 'Boina de poeta',
     'Para escribir versos en los cafés de la Taberna.', 110, 'face_retouching_natural'),
    ('wear_eyes_star', 'eyes:star', 'Gafas estelares',
     'Para leer ciencia ficción con el brillo adecuado.', 120, 'eyeglasses'),
    ('wear_cape_emerald', 'cape:emerald', 'Capa esmeralda',
     'Tejida con hilos del bosque de los cuentos.', 130, 'apparel'),
    ('wear_face_beard', 'face:beard', 'Barba de sabio',
     'Larga, blanca y llena de historias antiguas.', 140, 'face'),
    ('wear_cape_royal', 'cape:royal', 'Capa real',
     'Púrpura de la realeza lectora.', 150, 'apparel'),
    ('wear_head_tophat', 'head:tophat', 'Chistera victoriana',
     'Elegancia del siglo XIX para las grandes novelas.', 160, 'face_retouching_natural'),
    ('wear_head_pirate', 'head:pirate', 'Tricornio de corsario',
     'Para quienes navegan por historias de aventuras.', 180, 'sailing'),
    ('wear_head_crown', 'head:crown', 'Corona del Rey Lector',
     'Solo para quien gobierna el ranking de la Taberna.', 250, 'crown'),
]


def seed(apps, schema_editor):
    """Idempotente: get_or_create por código conserva precios cambiados luego en el admin."""
    ShopItem = apps.get_model('learning', 'ShopItem')
    for order, (code, value, name, description, cost, icon) in enumerate(WEARABLES):
        ShopItem.objects.get_or_create(code=code, defaults={
            'name': name,
            'description': description,
            'item_type': 'maguito_wear',
            'cost_ink': cost,
            'icon': icon,
            'value': value,
            'sort_order': 80 + order,
            'is_active': True,
        })


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0002_shopitem_maguito_wear'),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
