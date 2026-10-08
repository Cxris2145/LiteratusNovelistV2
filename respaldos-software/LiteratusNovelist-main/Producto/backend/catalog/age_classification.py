"""Clasificación +18 basada en categorías editoriales y obras identificadas del catálogo.

No usa palabras aisladas de sinopsis: mencionar sexualidad, violencia o religión
en una obra educativa no la convierte automáticamente en contenido para adultos.
"""
import unicodedata


ADULT_BOOK_SLUGS = frozenset({
    'historia-de-aline-y-valcour-marques-de-sade',
    'la-historia-secreta-de-isabel-de-baviera-marques-de-sade',
    'juliette-o-las-prosperidades-del-vicio-marques-de-sade',
    'justine-o-los-infortunios-de-la-virtud-marques-de-sade',
    'los-120-dias-de-sodoma-marques-de-sade',
})

ADULT_BOOK_TITLES = frozenset({
    'historia de aline y valcour',
    'historia secreta de isabel de baviera',
    'juliette o las prosperidades del vicio',
    'justine o los infortunios de la virtud',
    'los 120 dias de sodoma',
})


def normalized(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', value.lower())
                    if not unicodedata.combining(c))
    return ' '.join(value.replace(',', '').replace('-', ' ').split())


def adult_rating_reason(slug, title, genres):
    """`genres` contiene nombres o slugs; devuelve evidencia o una cadena vacía."""
    if any('erotic' in normalized(genre) for genre in genres):
        return 'Categoría editorial de ficción erótica: requiere 18 años o más.'
    if slug in ADULT_BOOK_SLUGS or normalized(title) in ADULT_BOOK_TITLES:
        return 'Obra para adultos identificada en la revisión del catálogo (Marqués de Sade).'
    return ''
