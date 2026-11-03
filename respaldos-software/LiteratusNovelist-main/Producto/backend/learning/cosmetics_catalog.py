"""
learning/cosmetics_catalog.py — Marcos, títulos y accesorios de Maguito de El Bazar.

Los de `is_purchasable=False` son exclusivos: no se venden, se ganan con un logro
(library/achievement_catalog.py dice cuál). Lo usan las migraciones 0005_cosmetics_v2 y
0008_animated_frames.

Formato de `value`:
- marco: clase CSS que dibuja el frontend (core/components/avatar-frame).
- título: el texto que se muestra junto al nombre.
- accesorio: 'espacio:variante' (learning/wearables.py; el dibujo vive en maguito.component.html).
"""

FRAME, TITLE, WEAR = 'profile_frame', 'title', 'maguito_wear'

# Precio de cada rareza de marco. Un día de lectura deja unas 40-50 Tinta (settings.GAMIFICATION_REWARDS):
# común ≈ 2 días, raro ≈ 4, épico ≈ 1 semana, legendario ≈ 2 semanas o el cofre de 500, mítico ≈ el cofre de 1.200.
# El Bazar deduce la rareza del precio (frontend core/components/avatar-frame/frame-catalog.ts, FRAME_TIERS):
# si cambias un escalón, cámbialo allá también.
FRAME_PRICES = {'comun': 90, 'raro': 160, 'epico': 280, 'legendario': 450, 'mitico': 750}


def _frame(slug, tier, name, description, icon, order):
    """Marco a la venta al precio de su rareza: código frame_<slug>, clase CSS frame-<slug>."""
    return (f"frame_{slug.replace('-', '_')}", FRAME, f'frame-{slug}', f'Marco "{name}"',
            description, FRAME_PRICES[tier], icon, True, order)


# (code, item_type, value, name, description, cost_ink, icon, is_purchasable, sort_order)
COSMETICS = [
    # ── Marcos clásicos a la venta ──
    ('frame_gold', FRAME, 'frame-gold', 'Marco "Papiro Dorado"',
     'Elegante orla dorada con filigranas clásicas para tu avatar de perfil.', FRAME_PRICES['comun'], 'crop_square', True, 40),
    ('frame_victorian', FRAME, 'frame-victorian', 'Marco "Noche Victoriana"',
     'Marco gótico victoriano con reflejos en plata y amatista.', FRAME_PRICES['comun'], 'crop_portrait', True, 50),
    ('frame_parchment', FRAME, 'frame-parchment', 'Marco "Pergamino"',
     'Un borde de papel antiguo, cálido y sencillo, como el de un manuscrito.', FRAME_PRICES['comun'], 'description', True, 41),
    ('frame_inkblue', FRAME, 'frame-inkblue', 'Marco "Tinta azul"',
     'Un anillo de tinta azul ferrogálica, la de los cuadernos de antes.', FRAME_PRICES['comun'], 'water_drop', True, 42),
    ('frame_autumn', FRAME, 'frame-autumn', 'Marco "Hojas de otoño"',
     'Hojas ocres y rojizas, para quienes leen con la ventana abierta.', FRAME_PRICES['comun'], 'eco', True, 43),
    ('frame_constellation', FRAME, 'frame-constellation', 'Marco "Constelación"',
     'Un cielo nocturno con estrellas que giran despacio alrededor de tu avatar.', FRAME_PRICES['raro'], 'auto_awesome', True, 44),

    # ── Marcos animados: Navidad ──
    _frame('xmas-gingerbread', 'comun', 'Galleta de jengibre',
           'Masa tostada con glaseado blanco y gomitas que dan la vuelta, recién salida del horno.', 'cake', 200),
    _frame('xmas-candy', 'raro', 'Bastón de caramelo',
           'Franjas rojas, blancas y verdes que giran como un dulce de Navidad, con brillo de azúcar.', 'redeem', 201),
    _frame('xmas-snow', 'raro', 'Copo de nieve',
           'Hielo azul y nieve que da vueltas despacio; un copo gira y brilla en lo alto.', 'auto_awesome', 202),
    _frame('xmas-wreath', 'epico', 'Corona de adviento',
           'Ramas de pino con bayas que titilan y un moño rojo que se mece.', 'forest', 203),
    _frame('xmas-lights', 'epico', 'Luces del árbol',
           'Una guirnalda de ampolletas de colores que se encienden por turnos.', 'lightbulb', 204),
    _frame('xmas-star', 'legendario', 'Estrella de Belén',
           'Un cielo de Nochebuena con una estrella dorada que late en lo alto y destellos que la siguen.', 'star', 205),
    _frame('xmas-santa', 'legendario', 'Gorro de Papá Noel',
           'Terciopelo rojo, nieve que gira y el gorro de Papá Noel meciéndose sobre tu avatar.', 'celebration', 206),

    # ── Marcos animados: Año Nuevo ──
    _frame('ny-sunrise', 'comun', 'Primer amanecer',
           'Los colores del primer sol del año, girando con calma.', 'light_mode', 210),
    _frame('ny-confetti', 'raro', 'Lluvia de confeti',
           'Papelitos de colores que giran alrededor de tu avatar y caen desde arriba.', 'celebration', 211),
    _frame('ny-champagne', 'epico', 'Brindis de medianoche',
           'Oro espumoso con burbujas que suben y destellos de celebración.', 'local_bar', 212),
    _frame('ny-clock', 'epico', 'Doce campanadas',
           'Esmalte negro y oro: la aguja avanza segundo a segundo hacia las doce.', 'schedule', 213),
    _frame('ny-fireworks', 'legendario', 'Fuegos artificiales',
           'El cielo de Año Nuevo con cuatro fuegos que estallan por turnos alrededor de tu avatar.', 'auto_awesome', 214),

    # ── Marcos animados: Halloween ──
    _frame('hw-potion', 'raro', 'Caldero de bruja',
           'Una pócima verde que gira y burbujea sin parar.', 'science', 220),
    _frame('hw-bats', 'raro', 'Vuelo de murciélagos',
           'Un anochecer morado y naranja con murciélagos dando vueltas.', 'bedtime', 221),
    _frame('hw-pumpkin', 'epico', 'Calabaza encendida',
           'Gajos de calabaza, su tallo con hoja y una calabacita con la vela parpadeando.', 'eco', 222),
    _frame('hw-web', 'epico', 'Telaraña',
           'Hilos de seda en la penumbra y una araña que sube y baja por su hilo.', 'bug_report', 223),
    _frame('hw-ghost', 'epico', 'Fantasma de la biblioteca',
           'Neblina lila que gira y dos fantasmas que flotan entre los estantes.', 'nightlight', 224),
    _frame('hw-bloodmoon', 'legendario', 'Luna de sangre',
           'Noche negra y carmesí: una luna roja, murciélagos cruzándola y ojos que parpadean en la oscuridad.', 'dark_mode', 225),

    # ── Marcos animados: Bestiario ──
    _frame('wolf', 'epico', 'Lobo de luna',
           'Pelaje plateado, orejas atentas que se mueven y la luna a la espalda.', 'pets', 230),
    _frame('ouroboros', 'epico', 'Uróboros',
           'La serpiente que se muerde la cola, dando vueltas sin fin alrededor de tu avatar.', 'all_inclusive', 231),
    _frame('kraken', 'epico', 'Kraken',
           'Aguas profundas, burbujas y tentáculos que se mecen detrás de tu avatar.', 'sailing', 232),
    _frame('unicorn', 'epico', 'Unicornio',
           'Arcoíris pastel que gira, cuerno dorado y chispas que titilan.', 'auto_awesome', 233),
    _frame('phoenix', 'legendario', 'Fénix',
           'Plumas de fuego, alas que baten y brasas que suben: renace en cada vuelta.', 'local_fire_department', 234),
    _frame('dragon-emerald', 'legendario', 'Dragón esmeralda',
           'Escamas verdes, alas que baten despacio y un dragón que vigila desde arriba.', 'pets', 235),
    _frame('dragon-fire', 'mitico', 'Dragón de fuego',
           'Escamas de obsidiana con vetas de lava, alas encendidas, ojos que arden y brasas: el marco más raro del Bazar.', 'local_fire_department', 236),

    # ── Marcos animados: Elementos ──
    _frame('lava', 'raro', 'Magma',
           'Roca fundida que fluye y brilla en dos corrientes.', 'local_fire_department', 240),
    _frame('forest', 'raro', 'Bosque encantado',
           'Hojas verdes y luciérnagas que se encienden y se apagan.', 'forest', 241),
    _frame('ice', 'epico', 'Hielo eterno',
           'Cristales de hielo con un destello frío y una corona de carámbanos.', 'diamond', 242),
    _frame('tempest', 'epico', 'Tormenta eléctrica',
           'Nubes que giran, lluvia que cae y un rayo que ilumina todo cada tanto.', 'bolt', 243),
    _frame('galaxy', 'legendario', 'Galaxia',
           'Una nebulosa que gira, estrellas que titilan, un planeta en órbita y una estrella fugaz.', 'public', 244),

    # ── Marcos animados: Colores ──
    _frame('ruby', 'comun', 'Rubí',
           'Facetas de rubí con un destello que recorre el anillo.', 'diamond', 250),
    _frame('emerald', 'comun', 'Esmeralda',
           'Facetas de esmeralda con un destello que recorre el anillo.', 'diamond', 251),
    _frame('sapphire', 'comun', 'Zafiro',
           'Facetas de zafiro con un destello que recorre el anillo.', 'diamond', 252),
    _frame('ocean', 'comun', 'Marea',
           'Azules de mar abierto que giran como una ola.', 'water', 253),
    _frame('rainbow', 'raro', 'Arcoíris',
           'Todos los colores girando alrededor de tu avatar, con brillo de pompa de jabón.', 'palette', 254),
    _frame('sakura', 'raro', 'Sakura',
           'Rosa de cerezo en flor, con pétalos que caen a los costados.', 'local_florist', 255),
    _frame('neon', 'raro', 'Neón',
           'Fucsia y celeste eléctricos que giran y parpadean como un letrero de noche.', 'bolt', 256),
    _frame('aurora', 'epico', 'Aurora boreal',
           'Verdes y violetas que ondulan como el cielo del norte, con estrellas que titilan.', 'auto_awesome', 257),

    # ── Marcos animados: Blanco y negro ──
    _frame('bw-chessboard', 'comun', 'Ajedrez',
           'Casillas blancas y negras que avanzan como un reloj de partida.', 'grid_view', 260),
    _frame('bw-ink', 'comun', 'Tinta china',
           'Un trazo de pincel negro con salpicaduras blancas que giran.', 'draw', 261),
    _frame('bw-zebra', 'comun', 'Cebra',
           'Rayas blancas y negras, irregulares como las de una cebra, en un giro lento.', 'pets', 262),
    _frame('bw-yinyang', 'raro', 'Yin y yang',
           'Mitad noche, mitad día, en equilibrio y girando.', 'contrast', 263),
    _frame('bw-piano', 'raro', 'Teclas de piano',
           'Cinco octavas de teclas blancas y negras, con notas que suben.', 'piano', 264),
    _frame('bw-film', 'raro', 'Cine mudo',
           'Una cinta de película que corre y su carrete girando.', 'movie', 265),
    _frame('bw-eclipse', 'epico', 'Eclipse',
           'Un anillo negro con su corona de luz y el destello del anillo de diamante.', 'dark_mode', 266),

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
