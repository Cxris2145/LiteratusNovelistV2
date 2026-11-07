"""
Color del Maguito de cada lector.

Vive en Profile.outfit['colors'], junto a la ropa: todo lo que envía el atuendo a los amigos
(tarjetas, lista, chat, mesa, lecturas conjuntas) ya lleva también el color. Sin esa clave, el
Maguito es el clásico. Las claves son las de MaguitoCustomColors en
frontend/src/app/core/components/maguito/maguito-colors.ts.
"""
import re

from rest_framework import serializers

MAGUITO_COLOR_KEYS = frozenset({
    'capeA', 'capeB', 'capeTrim', 'hatA', 'hatB', 'hatBand', 'bodyA', 'bodyB',
    'magicAura', 'magicSparks', 'metal', 'ink', 'shade',
})

_HEX_COLOR = re.compile(r'#[0-9a-fA-F]{6}')


def clean_maguito_colors(colors):
    """
    Deja solo las partes conocidas, con colores '#rrggbb' en minúsculas.

    Una parte desconocida se ignora (puede venir de un frontend más nuevo que este servidor);
    un color inválido se rechaza. Sin ninguna parte, no hay color: vuelve al clásico (None).
    """
    cleaned = {}
    for key, value in (colors or {}).items():
        if key not in MAGUITO_COLOR_KEYS:
            continue
        if not isinstance(value, str) or not _HEX_COLOR.fullmatch(value):
            raise serializers.ValidationError('Ese color de Maguito no es válido.')
        cleaned[key] = value.lower()
    return cleaned or None


def with_maguito_colors(outfit, colors):
    """El atuendo con esos colores (None = el clásico); la ropa no se toca."""
    updated = dict(outfit or {})
    if colors:
        updated['colors'] = colors
    else:
        updated.pop('colors', None)
    return updated


class MaguitoColorsField(serializers.DictField):
    """Colores que manda el frontend; null o {} vuelven al Maguito clásico."""

    def to_internal_value(self, data):
        return clean_maguito_colors(super().to_internal_value(data))
