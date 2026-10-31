"""
library/achievement_catalog.py — Catálogo completo de logros (fuente única).

Categorías consolidadas en 4 pilares principales:
- 'reading' (Lectura): hitos de lectura, rachas (streak), horarios (time) y lector activo (reader).
- 'social' (Social): conversaciones con personajes IA y vida social en La Taberna.
- 'games' (Juegos): desafíos del Salón de Juegos (El Enigma e Interrogatorio).
- 'learning' (La Senda): progresión en La Senda, exploración de géneros y colección de cosméticos/nivel.

Rarezas visuales e hitos predefinidos:
- 'bronze' (Bronce)
- 'silver' (Plata)
- 'gold' (Oro)
- 'diamond' (Diamante)
"""

BRONZE, SILVER, GOLD, DIAMOND = 'bronze', 'silver', 'gold', 'diamond'
# Alias de compatibilidad hacia atrás
COMMON, RARE, EPIC, LEGENDARY = BRONZE, SILVER, GOLD, DIAMOND

# Sub-grupos para mostrar sub-hitos de Exploración y Colección en el resumen del perfil
SUB_GROUPS = {
    'classic_explorer_3': 'exploration',
    'classic_explorer_10': 'exploration',
    'genres_5': 'exploration',
    'level_5': 'collection',
    'bazar_5': 'collection',
    'maguito_full': 'collection',
    'streak_3': 'streak',
    'streak_7': 'streak',
    'streak_14': 'streak',
    'streak_30': 'streak',
    'streak_100': 'streak',
    'night_owl': 'time',
    'night_owl_10': 'time',
    'night_owl_25': 'time',
    'early_bird': 'time',
    'early_bird_10': 'time',
    'highlight_first': 'reader',
    'highlights_50': 'reader',
    'postits_10': 'reader',
    'bookmarks_10': 'reader',
    'review_first': 'reader',
    'reviews_10': 'reader',
    'favorites_10': 'reader',
}

# Porcentaje de rareza predefinido antes de ponderar el cálculo dinámico comunitario
PREDEFINED_RARITY_PCT = {
    'first_chapter': 78.4,
    'first_book': 54.2,
    'books_5': 26.5,
    'books_10': 9.8,
    'books_25': 1.9,
    'streak_3': 61.0,
    'streak_7': 29.4,
    'streak_14': 18.2,
    'streak_30': 7.6,
    'streak_100': 1.2,
    'classic_explorer_3': 24.8,
    'classic_explorer_10': 8.4,
    'genres_5': 11.2,
    'night_owl': 48.5,
    'night_owl_10': 19.6,
    'night_owl_25': 6.9,
    'early_bird': 44.0,
    'early_bird_10': 17.5,
    'social_first_chat': 68.0,
    'social_fluent': 31.2,
    'social_fluent_5': 10.4,
    'social_5_chars': 22.7,
    'social_10_books': 7.8,
    'tavern_first_friend': 49.3,
    'tavern_full_table': 21.0,
    'tavern_toasted': 8.9,
    'senda_first': 64.5,
    'senda_10': 27.3,
    'senda_stars_10': 10.6,
    'senda_50': 5.8,
    'senda_summit': 1.5,
    'enigma_first': 52.0,
    'enigma_10': 9.2,
    'interrogation_first': 46.8,
    'interrogation_10': 8.1,
    'highlight_first': 58.6,
    'highlights_50': 20.4,
    'postits_10': 23.1,
    'bookmarks_10': 42.0,
    'review_first': 47.5,
    'reviews_10': 9.5,
    'favorites_10': 51.2,
    'level_5': 10.2,
    'bazar_5': 22.4,
    'maguito_full': 18.9,
}

# (code, title, description, category, icon, threshold, ink_reward, sort_order, rarity, reward)
ACHIEVEMENTS = [
    # ── Pilar 1: Lectura (incluye Lectura, Racha, Horario y Lector activo) ──
    ('first_chapter', 'Primera Página', 'Abriste tu primer libro y comenzaste a leer. ¡El viaje comienza aquí!',
     'reading', '📖', 1, 5, 10, BRONZE, None),
    ('first_book', 'Obra Completa', 'Terminaste tu primer libro de principio a fin. ¡Eres un lector de verdad!',
     'reading', '📚', 1, 20, 20, BRONZE, None),
    ('books_5', 'Bibliófilo', 'Has completado 5 libros. Tu biblioteca personal está creciendo.',
     'reading', '🎯', 5, 30, 30, SILVER, None),
    ('books_10', 'Devorador de Libros', '10 libros completados. La literatura corre por tus venas.',
     'reading', '🔥', 10, 50, 40, GOLD, 'wear_neck_medal'),
    ('books_25', 'Biblioteca Andante', 'Terminaste 25 obras. Llevas una biblioteca entera en la cabeza.',
     'reading', '🏰', 25, 120, 45, DIAMOND, 'frame_library'),

    # Racha (consolidado bajo Lectura)
    ('streak_3', 'Lector Constante', '3 días seguidos leyendo. ¡Estás formando un hábito!',
     'reading', '⚡', 3, 10, 50, BRONZE, None),
    ('streak_7', 'Semana de Lectura', '7 días seguidos. Una semana completa dedicada a los libros.',
     'reading', '🌟', 7, 25, 60, SILVER, None),
    ('streak_14', 'Quincena de Tinta', '14 días seguidos leyendo. La constancia ya es parte de ti.',
     'reading', '✨', 14, 40, 65, SILVER, None),
    ('streak_30', 'Maratón Literario', '30 días sin parar. Eres un lector extraordinario.',
     'reading', '👑', 30, 100, 70, GOLD, 'frame_laurel'),
    ('streak_100', 'Centenario', '100 días seguidos leyendo. Pocos llegan hasta aquí.',
     'reading', '☄️', 100, 250, 75, DIAMOND, 'frame_eternal_flame'),

    # Horario (consolidado bajo Lectura)
    ('night_owl', 'Lector Nocturno', 'Leíste entre la medianoche y las 5 AM. Los mejores mundos se descubren de noche.',
     'reading', '🦉', 1, 10, 100, BRONZE, 'title_midnight_owl'),
    ('night_owl_10', 'Búho Veterano', 'Leer de noche no es algo ocasional para ti: ya son 10 sesiones nocturnas.',
     'reading', '🌙', 10, 30, 110, SILVER, 'frame_owl'),
    ('night_owl_25', 'Guardián de la Medianoche', '25 sesiones de lectura entre la medianoche y las 5 AM.',
     'reading', '🌌', 25, 60, 115, GOLD, 'wear_cape_midnight'),
    ('early_bird', 'Madrugador', 'Leíste entre las 5 y las 8 de la mañana. ¡El mejor comienzo del día!',
     'reading', '🐦', 1, 10, 120, BRONZE, None),
    ('early_bird_10', 'Alondra', '10 sesiones de lectura entre las 5 y las 8 de la mañana.',
     'reading', '🌅', 10, 30, 125, SILVER, None),

    # Lector activo (consolidado bajo Lectura)
    ('highlight_first', 'Subrayador', 'Subrayaste tu primer pasaje.',
     'reading', '🖍️', 1, 5, 130, BRONZE, None),
    ('highlights_50', 'Lápiz Incansable', 'Subrayaste 50 pasajes en tus lecturas.',
     'reading', '✏️', 50, 30, 135, SILVER, None),
    ('postits_10', 'Notas al Margen', 'Pegaste 10 post-its en tus lecturas.',
     'reading', '🗒️', 10, 20, 140, SILVER, None),
    ('bookmarks_10', 'Marcapáginas', 'Guardaste 10 marcadores.',
     'reading', '🔖', 10, 10, 145, BRONZE, None),
    ('review_first', 'Crítico Literario', 'Escribiste tu primera reseña.',
     'reading', '✍️', 1, 10, 150, BRONZE, None),
    ('reviews_10', 'Cronista', 'Escribiste 10 reseñas.',
     'reading', '📰', 10, 50, 155, GOLD, 'title_chronicler'),
    ('favorites_10', 'Estantería Favorita', 'Guardaste 10 obras en tus favoritos.',
     'reading', '💛', 10, 10, 160, BRONZE, None),

    # ── Pilar 2: Social ──
    ('social_first_chat', 'Forastero curioso', 'Al iniciar la primera conversación con un personaje.',
     'social', '🗣️', 1, 5, 200, BRONZE, None),
    ('social_fluent', 'Tertuliano', 'Mantuviste 1 conversación fluida y sustancial con un personaje.',
     'social', '🎭', 1, 20, 210, SILVER, None),
    ('social_fluent_5', 'Aristócrata del Diálogo', 'Has mantenido conversaciones fluidas y sustanciales con 5 personajes distintos.',
     'social', '🎩', 5, 40, 215, GOLD, None),
    ('social_5_chars', 'Socialité de Ficción', 'Has conversado con más de 5 personajes literarios distintos.',
     'social', '🍷', 6, 30, 220, SILVER, None),
    ('social_10_books', 'Viajero de Mundos', 'Conversaste con personajes en 10 libros distintos.',
     'social', '🌍', 10, 50, 230, GOLD, None),
    ('tavern_first_friend', 'Compañero de Mesa', 'Sentaste a tu primer amigo a tu mesa en La Taberna.',
     'social', '🍺', 1, 10, 240, BRONZE, None),
    ('tavern_full_table', 'Mesa Llena', 'Tienes 5 amigos en La Taberna.',
     'social', '🪑', 5, 25, 245, SILVER, 'frame_tavern'),
    ('tavern_toasted', 'Alma de la Fiesta', 'Tus amigos brindaron 10 veces por ti.',
     'social', '🥂', 10, 25, 250, GOLD, 'title_tavern_soul'),

    # ── Pilar 3: La Senda (incluye La Senda, Exploración y Colección) ──
    ('senda_first', 'Primer Paso', 'Aprobaste tu primer nivel de La Senda del Lector.',
     'learning', '🥾', 1, 5, 300, BRONZE, None),
    ('senda_10', 'Caminante', 'Aprobaste 10 niveles de La Senda.',
     'learning', '🧗', 10, 20, 310, SILVER, None),
    ('senda_stars_10', 'Tres Estrellas', 'Conseguiste 3 estrellas en 10 niveles de La Senda.',
     'learning', '⭐', 10, 30, 320, GOLD, 'wear_head_laurel'),
    ('senda_50', 'Peregrino', 'Aprobaste 50 niveles de La Senda.',
     'learning', '⛰️', 50, 60, 330, GOLD, 'title_pilgrim'),
    ('senda_summit', 'La Cumbre', 'Completaste la última unidad de La Senda del Lector.',
     'learning', '🏔️', 1, 150, 340, DIAMOND, 'frame_summit'),

    # Exploración (integrado en La Senda y sub-hitos del perfil)
    ('classic_explorer_3', 'Explorador de Clásicos', 'Has completado 3 libros del mismo género. ¡Un verdadero explorador literario!',
     'learning', '🗺️', 3, 15, 350, SILVER, None),
    ('classic_explorer_10', 'Maestro del Género', '10 libros completados en un mismo género. ¡Eres un experto!',
     'learning', '🏛️', 10, 50, 360, GOLD, 'title_genre_master'),
    ('genres_5', 'Trotamundos Literario', 'Terminaste obras de 5 géneros distintos.',
     'learning', '🧭', 5, 60, 365, GOLD, None),

    # Colección (integrado en La Senda y sub-hitos del perfil)
    ('level_5', 'Lector Consagrado', 'Llegaste al nivel 5 de lector.',
     'learning', '🎖️', 5, 60, 370, GOLD, None),
    ('bazar_5', 'Coleccionista', 'Reuniste 5 marcos, títulos o accesorios.',
     'learning', '🛍️', 5, 25, 380, SILVER, None),
    ('maguito_full', 'Maguito de Gala', 'Vestiste a Maguito en sus 5 espacios a la vez.',
     'learning', '🧙', 5, 25, 390, SILVER, None),

    # ── Pilar 4: Juegos ──
    ('enigma_first', 'Descifrador', 'Descifraste tu primer enigma literario.',
     'games', '🧩', 1, 10, 400, BRONZE, None),
    ('enigma_10', 'Mente Brillante', 'Descifraste 10 enigmas literarios.',
     'games', '🧠', 10, 50, 410, GOLD, 'wear_head_deerstalker'),
    ('interrogation_first', 'Interrogador', 'Ganaste tu primer Interrogatorio a ciegas.',
     'games', '🕵️', 1, 10, 420, BRONZE, None),
    ('interrogation_10', 'Detective de Salón', 'Ganaste 10 Interrogatorios a ciegas.',
     'games', '🔎', 10, 50, 430, GOLD, 'title_detective'),
]


def sync_achievements(Achievement, ShopItem, overwrite_texts=False):
    """
    Crea los logros que falten y actualiza categoría consolidada, rareza (bronce, plata, oro,
    diamante), porcentaje predefinido y premio.
    """
    rewards = {item.code: item for item in ShopItem.objects.filter(
        code__in=[r[-1] for r in ACHIEVEMENTS if r[-1]])}
    # Las migraciones viejas (0011) reciben el modelo de su época, todavía sin predefined_rarity_pct.
    model_fields = {field.name for field in Achievement._meta.get_fields()}
    for code, title, description, category, icon, threshold, ink, order, rarity, reward in ACHIEVEMENTS:
        predefined_pct = PREDEFINED_RARITY_PCT.get(code, 45.0)
        texts = {'title': title, 'description': description, 'icon': icon,
                 'threshold': threshold, 'ink_reward': ink}
        extra = {
            'category': category,
            'sort_order': order,
            'rarity': rarity,
            'predefined_rarity_pct': predefined_pct,
            'reward_item': rewards.get(reward) if reward else None,
        }
        extra = {name: value for name, value in extra.items() if name in model_fields}
        achievement = Achievement.objects.filter(code=code).first()
        if achievement is None:
            Achievement.objects.create(code=code, **texts, **extra)
            continue
        fields = {**extra, **(texts if overwrite_texts else {})}
        for name, value in fields.items():
            setattr(achievement, name, value)
        achievement.save(update_fields=list(fields))
