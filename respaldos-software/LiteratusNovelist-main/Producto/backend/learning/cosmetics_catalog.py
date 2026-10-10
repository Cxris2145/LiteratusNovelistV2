"""
learning/cosmetics_catalog.py — Marcos, títulos y accesorios de Maguito de El Bazar.

Los de `is_purchasable=False` son exclusivos: no se venden, se ganan con un logro
(library/achievement_catalog.py dice cuál). Lo usa la migración 0005_cosmetics_v2.

Formato de `value`:
- marco: clase CSS que dibuja el frontend (core/components/avatar-frame).
- título: el texto que se muestra junto al nombre.
- accesorio: 'espacio:variante' (learning/wearables.py; el dibujo vive en maguito.component.html).
"""

FRAME, TITLE, WEAR = 'profile_frame', 'title', 'maguito_wear'

# (code, item_type, value, name, description, cost_ink, icon, is_purchasable, sort_order)
COSMETICS = [
    # ── Marcos a la venta ──
    ('frame_gold', FRAME, 'frame-gold', 'Marco "Papiro Dorado"',
     'Elegante orla dorada con filigranas clásicas para tu avatar de perfil.', 80, 'crop_square', True, 40),
    ('frame_victorian', FRAME, 'frame-victorian', 'Marco "Noche Victoriana"',
     'Marco gótico victoriano con reflejos en plata y amatista.', 100, 'crop_portrait', True, 50),
    ('frame_parchment', FRAME, 'frame-parchment', 'Marco "Pergamino"',
     'Un borde de papel antiguo, cálido y sencillo, como el de un manuscrito.', 60, 'description', True, 41),
    ('frame_inkblue', FRAME, 'frame-inkblue', 'Marco "Tinta azul"',
     'Un anillo de tinta azul ferrogálica, la de los cuadernos de antes.', 90, 'water_drop', True, 42),
    ('frame_autumn', FRAME, 'frame-autumn', 'Marco "Hojas de otoño"',
     'Hojas ocres y rojizas, para quienes leen con la ventana abierta.', 120, 'eco', True, 43),
    ('frame_constellation', FRAME, 'frame-constellation', 'Marco "Constelación"',
     'Un cielo nocturno con estrellas que giran despacio alrededor de tu avatar.', 150, 'auto_awesome', True, 44),

    # ── Marcos exclusivos (premios de logros) ──
    ('frame_laurel', FRAME, 'frame-laurel', 'Marco "Laurel"',
     'Corona de laurel para quien leyó 30 días seguidos.', 0, 'workspace_premium', False, 45),
    ('frame_eternal_flame', FRAME, 'frame-eternal-flame', 'Marco "Llama eterna"',
     'Una llama que no se apaga: 100 días seguidos leyendo.', 0, 'local_fire_department', False, 46),
    ('frame_library', FRAME, 'frame-library', 'Marco "Biblioteca"',
     'Lomos de libros alrededor de tu avatar: 25 obras terminadas.', 0, 'local_library', False, 47),
    ('frame_owl', FRAME, 'frame-owl', 'Marco "Búho"',
     'Plumas de búho para quien lee de madrugada.', 0, 'nightlight', False, 48),
    ('frame_summit', FRAME, 'frame-summit', 'Marco "Cumbre"',
     'Montañas nevadas: completaste la última unidad de La Senda.', 0, 'landscape', False, 49),
    ('frame_tavern', FRAME, 'frame-tavern', 'Marco "Mesa de la Taberna"',
     'Madera de roble y latón, para quien llenó su mesa de amigos.', 0, 'table_restaurant', False, 51),

    # ── Títulos ──
    ('title_erudite', TITLE, 'Erudito Clásico', 'Título "Erudito Clásico"',
     'Distintivo honorífico que se exhibirá junto a tu nombre de usuario en toda la plataforma.', 75, 'military_tech', True, 60),
    ('title_unbroken', TITLE, 'Lector Inquebrantable', 'Título "Lector Inquebrantable"',
     'Para los lectores cuya disciplina ante los libros es inquebrantable.', 110, 'local_fire_department', True, 70),
    ('title_bookworm', TITLE, 'Ratón de Biblioteca', 'Título "Ratón de Biblioteca"',
     'Para quien siempre tiene un libro abierto en alguna parte.', 60, 'menu_book', True, 61),
    ('title_wandering_quill', TITLE, 'Pluma Errante', 'Título "Pluma Errante"',
     'Para quien deja notas en los márgenes de cada historia.', 80, 'history_edu', True, 62),
    ('title_midnight_owl', TITLE, 'Búho de Medianoche', 'Título "Búho de Medianoche"',
     'Se gana leyendo de madrugada.', 0, 'bedtime', False, 63),
    ('title_tavern_soul', TITLE, 'Alma de la Taberna', 'Título "Alma de la Taberna"',
     'Se gana al recibir 10 brindis en La Taberna.', 0, 'sports_bar', False, 64),
    ('title_detective', TITLE, 'Detective de Salón', 'Título "Detective de Salón"',
     'Se gana al resolver 10 interrogatorios.', 0, 'search', False, 65),
    ('title_chronicler', TITLE, 'Cronista', 'Título "Cronista"',
     'Se gana al escribir 10 reseñas.', 0, 'rate_review', False, 66),
    ('title_genre_master', TITLE, 'Maestro del Género', 'Título "Maestro del Género"',
     'Se gana al terminar 10 obras de un mismo género.', 0, 'category', False, 67),
    ('title_pilgrim', TITLE, 'Peregrino de La Senda', 'Título "Peregrino de La Senda"',
     'Se gana al aprobar 50 niveles de La Senda.', 0, 'hiking', False, 68),

    # ── Accesorios de Maguito a la venta ──
    ('wear_head_graduate', WEAR, 'head:graduate', 'Birrete de graduación',
     'El birrete negro con borla dorada de quien terminó sus estudios.', 140, 'school', True, 101),
    ('wear_head_feather', WEAR, 'head:feather', 'Sombrero con pluma',
     'Sombrero de ala ancha con una pluma larga, de mosquetero lector.', 170, 'edit', True, 102),
    ('wear_eyes_reading', WEAR, 'eyes:reading', 'Gafas de lectura',
     'Gafas redondas y finas para leer la letra pequeña.', 70, 'eyeglasses', True, 103),
    ('wear_neck_quill', WEAR, 'neck:quill', 'Broche de pluma',
     'Una pluma dorada prendida al cuello de la túnica.', 90, 'draw', True, 104),

    # ── Accesorios exclusivos (premios de logros) ──
    ('wear_head_laurel', WEAR, 'head:laurel', 'Corona de laurel',
     'Se gana consiguiendo 3 estrellas en 10 niveles de La Senda.', 0, 'emoji_events', False, 105),
    ('wear_head_deerstalker', WEAR, 'head:deerstalker', 'Gorra de detective',
     'Se gana descifrando 10 enigmas.', 0, 'travel_explore', False, 106),
    ('wear_neck_medal', WEAR, 'neck:medal', 'Medalla del lector',
     'Se gana al terminar 10 obras.', 0, 'military_tech', False, 107),
    ('wear_cape_midnight', WEAR, 'cape:midnight', 'Capa de medianoche',
     'Se gana leyendo 25 noches de madrugada.', 0, 'dark_mode', False, 108),
]


def sync_cosmetics(ShopItem):
    """Crea los que falten; a los que existen solo les fija si se venden (no toca precios editados)."""
    for code, item_type, value, name, description, cost, icon, purchasable, order in COSMETICS:
        item, created = ShopItem.objects.get_or_create(code=code, defaults={
            'item_type': item_type, 'value': value, 'name': name, 'description': description,
            'cost_ink': cost, 'icon': icon, 'is_purchasable': purchasable, 'sort_order': order,
            'is_active': True,
        })
        if not created and item.is_purchasable != purchasable:
            item.is_purchasable = purchasable
            item.save(update_fields=['is_purchasable'])
