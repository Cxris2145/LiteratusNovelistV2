"""Compositor de portadas de la colección Literatus.

Uso típico::

    from catalog.covers import build_cover_context, render_literatus_cover, palette_for

    ctx = build_cover_context(book)
    img = render_literatus_cover(**ctx, palette=palette_for(ctx["seed"], ctx["palette_family"]),
                                 art_background=gemini_illustration_or_None)
    img.save(path, "WEBP", quality=88, method=6)
"""

from .engine import (
    HEIGHT,
    PALETTE_TONE,
    PALETTES,
    SYMBOLS,
    SYMBOL_RULES,
    TARGET_SIZE,
    WIDTH,
    build_cover_context,
    choose_symbol,
    normalize_text,
    palette_for,
    palette_tone_for,
    prepare_art,
    render_literatus_cover,
    sha256_file,
    stable_seed,
)
from .fonts import active_font_report, get_font

__all__ = [
    "WIDTH",
    "HEIGHT",
    "TARGET_SIZE",
    "PALETTES",
    "PALETTE_TONE",
    "SYMBOLS",
    "SYMBOL_RULES",
    "build_cover_context",
    "choose_symbol",
    "normalize_text",
    "palette_for",
    "palette_tone_for",
    "prepare_art",
    "render_literatus_cover",
    "sha256_file",
    "stable_seed",
    "get_font",
    "active_font_report",
]
