"""
library/achievement_catalog.py — Catálogo completo de logros (fuente única).

Lo usan la migración 0011_achievements_v2 (para que Render lo cree al desplegar) y el
comando `seed_achievements`. El umbral (`threshold`) de la base es el que manda: el motor
(achievement_engine.py) lo lee al desbloquear, así coincide con lo que muestra la página.

`reward` es el código de un ShopItem (learning/cosmetics_catalog.py) que se regala al
desbloquear; los exclusivos solo se consiguen así.
"""

COMMON, RARE, EPIC, LEGENDARY = 'common', 'rare', 'epic', 'legendary'

# (code, title, description, category, icon, threshold, ink_reward, sort_order, rarity, reward)
ACHIEVEMENTS = [
    # ── Lectura ──
    ('first_chapter', 'Primera Página', 'Abriste tu primer libro y comenzaste a leer. ¡El viaje comienza aquí!',
     'reading', '📖', 1, 5, 10, COMMON, None),
    ('first_book', 'Obra Completa', 'Terminaste tu primer libro de principio a fin. ¡Eres un lector de verdad!',
     'reading', '📚', 1, 20, 20, COMMON, None),
    ('books_5', 'Bibliófilo', 'Has completado 5 libros. Tu biblioteca personal está creciendo.',
     'reading', '🎯', 5, 30, 30, RARE, None),
    ('books_10', 'Devorador de Libros', '10 libros completados. La literatura corre por tus venas.',
     'reading', '🔥', 10, 50, 40, EPIC, 'wear_neck_medal'),
    ('books_25', 'Biblioteca Andante', 'Terminaste 25 obras. Llevas una biblioteca entera en la cabeza.',
     'reading', '🏰', 25, 120, 45, LEGENDARY, 'frame_library'),

    # ── Racha ──
    ('streak_3', 'Lector Constante', '3 días seguidos leyendo. ¡Estás formando un hábito!',
     'streak', '⚡', 3, 10, 50, COMMON, None),
    ('streak_7', 'Semana de Lectura', '7 días seguidos. Una semana completa dedicada a los libros.',
     'streak', '🌟', 7, 25, 60, RARE, None),
    ('streak_14', 'Quincena de Tinta', '14 días seguidos leyendo. La constancia ya es parte de ti.',
     'streak', '✨', 14, 40, 65, RARE, None),
    ('streak_30', 'Maratón Literario', '30 días sin parar. Eres un lector extraordinario.',
     'streak', '👑', 30, 100, 70, EPIC, 'frame_laurel'),
    ('streak_100', 'Centenario', '100 días seguidos leyendo. Pocos llegan hasta aquí.',
     'streak', '☄️', 100, 250, 75, LEGENDARY, 'frame_eternal_flame'),

    # ── Exploración ──
    ('classic_explorer_3', 'Explorador de Clásicos', 'Has completado 3 libros del mismo género. ¡Un verdadero explorador literario!',
     'exploration', '🗺️', 3, 15, 80, RARE, None),
    ('classic_explorer_10', 'Maestro del Género', '10 libros completados en un mismo género. ¡Eres un experto!',
     'exploration', '🏛️', 10, 50, 90, EPIC, 'title_genre_master'),
    ('genres_5', 'Trotamundos Literario', 'Terminaste obras de 5 géneros distintos.',
     'exploration', '🧭', 5, 60, 95, EPIC, None),

    # ── Horario ──
    ('night_owl', 'Lector Nocturno', 'Leíste entre la medianoche y las 5 AM. Los mejores mundos se descubren de noche.',
     'time', '🦉', 1, 10, 100, COMMON, 'title_midnight_owl'),
    ('night_owl_10', 'Búho Veterano', 'Leer de noche no es algo ocasional para ti: ya son 10 sesiones nocturnas.',
     'time', '🌙', 10, 30, 110, RARE, 'frame_owl'),
    ('night_owl_25', 'Guardián de la Medianoche', '25 sesiones de lectura entre la medianoche y las 5 AM.',
     'time', '🌌', 25, 60, 115, EPIC, 'wear_cape_midnight'),
    ('early_bird', 'Madrugador', 'Leíste entre las 5 y las 8 de la mañana. ¡El mejor comienzo del día!',
     'time', '🐦', 1, 10, 120, COMMON, None),
    ('early_bird_10', 'Alondra', '10 sesiones de lectura entre las 5 y las 8 de la mañana.',
     'time', '🌅', 10, 30, 125, RARE, None),

    # ── Social ──
    ('social_first_chat', 'Forastero curioso', 'Al iniciar la primera conversación con un personaje.',
     'social', '🗣️', 1, 5, 200, COMMON, None),
    ('social_fluent', 'Tertuliano', 'Mantuviste 1 conversación fluida y sustancial con un personaje.',
     'social', '🎭', 1, 20, 210, RARE, None),
    ('social_fluent_5', 'Aristócrata del Diálogo', 'Has mantenido conversaciones fluidas y sustanciales con 5 personajes distintos.',
     'social', '🎩', 5, 40, 215, EPIC, None),
    ('social_5_chars', 'Socialité de Ficción', 'Has conversado con más de 5 personajes literarios distintos.',
     'social', '🍷', 6, 30, 220, RARE, None),
    ('social_10_books', 'Viajero de Mundos', 'Conversaste con personajes en 10 libros distintos.',
     'social', '🌍', 10, 50, 230, EPIC, None),
    ('tavern_first_friend', 'Compañero de Mesa', 'Sentaste a tu primer amigo a tu mesa en La Taberna.',
     'social', '🍺', 1, 10, 240, COMMON, None),
    ('tavern_full_table', 'Mesa Llena', 'Tienes 5 amigos en La Taberna.',
     'social', '🪑', 5, 25, 245, RARE, 'frame_tavern'),
    ('tavern_toasted', 'Alma de la Fiesta', 'Tus amigos brindaron 10 veces por ti.',
     'social', '🥂', 10, 25, 250, EPIC, 'title_tavern_soul'),

    # ── La Senda ──
    ('senda_first', 'Primer Paso', 'Aprobaste tu primer nivel de La Senda del Lector.',
     'learning', '🥾', 1, 5, 300, COMMON, None),
    ('senda_10', 'Caminante', 'Aprobaste 10 niveles de La Senda.',
     'learning', '🧗', 10, 20, 310, RARE, None),
    ('senda_stars_10', 'Tres Estrellas', 'Conseguiste 3 estrellas en 10 niveles de La Senda.',
     'learning', '⭐', 10, 30, 320, EPIC, 'wear_head_laurel'),
    ('senda_50', 'Peregrino', 'Aprobaste 50 niveles de La Senda.',
     'learning', '⛰️', 50, 60, 330, EPIC, 'title_pilgrim'),
    ('senda_summit', 'La Cumbre', 'Completaste la última unidad de La Senda del Lector.',
     'learning', '🏔️', 1, 150, 340, LEGENDARY, 'frame_summit'),

    # ── Juegos ──
    ('enigma_first', 'Descifrador', 'Descifraste tu primer enigma literario.',
     'games', '🧩', 1, 10, 400, COMMON, None),
    ('enigma_10', 'Mente Brillante', 'Descifraste 10 enigmas literarios.',
     'games', '🧠', 10, 50, 410, EPIC, 'wear_head_deerstalker'),
    ('interrogation_first', 'Interrogador', 'Ganaste tu primer Interrogatorio a ciegas.',
     'games', '🕵️', 1, 10, 420, COMMON, None),
    ('interrogation_10', 'Detective de Salón', 'Ganaste 10 Interrogatorios a ciegas.',
     'games', '🔎', 10, 50, 430, EPIC, 'title_detective'),

    # ── Lector activo ──
    ('highlight_first', 'Subrayador', 'Subrayaste tu primer pasaje.',
     'reader', '🖍️', 1, 5, 500, COMMON, None),
    ('highlights_50', 'Lápiz Incansable', 'Subrayaste 50 pasajes en tus lecturas.',
     'reader', '✏️', 50, 30, 510, RARE, None),
    ('postits_10', 'Notas al Margen', 'Pegaste 10 post-its en tus lecturas.',
     'reader', '🗒️', 10, 20, 520, RARE, None),
    ('bookmarks_10', 'Marcapáginas', 'Guardaste 10 marcadores.',
     'reader', '🔖', 10, 10, 530, COMMON, None),
    ('review_first', 'Crítico Literario', 'Escribiste tu primera reseña.',
     'reader', '✍️', 1, 10, 540, COMMON, None),
    ('reviews_10', 'Cronista', 'Escribiste 10 reseñas.',
     'reader', '📰', 10, 50, 550, EPIC, 'title_chronicler'),
    ('favorites_10', 'Estantería Favorita', 'Guardaste 10 obras en tus favoritos.',
     'reader', '💛', 10, 10, 560, COMMON, None),

    # ── Colección ──
    ('level_5', 'Lector Consagrado', 'Llegaste al nivel 5 de lector.',
     'collection', '🎖️', 5, 60, 600, EPIC, None),
    ('bazar_5', 'Coleccionista', 'Reuniste 5 marcos, títulos o accesorios.',
     'collection', '🛍️', 5, 25, 610, RARE, None),
    ('maguito_full', 'Maguito de Gala', 'Vestiste a Maguito en sus 5 espacios a la vez.',
     'collection', '🧙', 5, 25, 620, RARE, None),
]


def sync_achievements(Achievement, ShopItem, overwrite_texts=False):
    """
    Crea los logros que falten y les fija rareza y premio. A los que ya existen no les toca
    textos, umbral ni Tinta (pueden estar editados en el admin) salvo con overwrite_texts.
    """
    rewards = {item.code: item for item in ShopItem.objects.filter(
        code__in=[r[-1] for r in ACHIEVEMENTS if r[-1]])}
    for code, title, description, category, icon, threshold, ink, order, rarity, reward in ACHIEVEMENTS:
        texts = {'title': title, 'description': description, 'category': category, 'icon': icon,
                 'threshold': threshold, 'ink_reward': ink, 'sort_order': order}
        extra = {'rarity': rarity, 'reward_item': rewards.get(reward) if reward else None}
        achievement = Achievement.objects.filter(code=code).first()
        if achievement is None:
            Achievement.objects.create(code=code, **texts, **extra)
            continue
        fields = {**extra, **(texts if overwrite_texts else {})}
        for name, value in fields.items():
            setattr(achievement, name, value)
        achievement.save(update_fields=list(fields))
