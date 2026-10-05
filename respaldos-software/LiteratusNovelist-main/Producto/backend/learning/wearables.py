"""
learning/wearables.py — Accesorios de Maguito que se venden en El Bazar.

Cada artículo de tipo 'maguito_wear' guarda en `value` el espacio y la variante
("head:crown"). El atuendo equipado vive en Profile.outfit ({"head": "crown", ...});
un espacio sin valor usa el atuendo de siempre (sombrero de mago, lentes redondos,
capa dorada). El frontend dibuja las variantes en maguito.component.html.
"""
import re

WEAR_SLOTS = ('head', 'eyes', 'face', 'neck', 'cape')
_VARIANT_RE = re.compile(r'^[a-z0-9-]{1,24}$')


def parse_wear_value(value):
    """'head:crown' → ('head', 'crown'); None si el valor no es un accesorio válido."""
    slot, _, variant = str(value or '').partition(':')
    if slot in WEAR_SLOTS and _VARIANT_RE.match(variant):
        return slot, variant
    return None
