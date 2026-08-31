"""Compositor de portadas de la colección Literatus (WEBP 600x900, 2:3).

Extraído de ``Automatizaciones/generate_unique_literatus_covers.py`` para poder
reutilizarlo desde ``catalog.standardization`` y el importador.

Dos modos:
  * procedural  -> ``render_literatus_cover(..., art_background=None)`` : fondo
    generado con Pillow (degradado + glow + textura + medallón + símbolo).
  * híbrido     -> ``render_literatus_cover(..., art_background=<PIL.Image>)`` :
    la ilustración (de Gemini) es la base; encima se aplica un degradado de
    legibilidad y el marco editorial Literatus (borde, cabecera de marca,
    título, autor, pie).

El resultado es siempre una imagen RGB de 600x900. La composición del texto y
el marco es idéntica en ambos modos para dar identidad de colección.
"""

from __future__ import annotations

import hashlib
import math
import random
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from .fonts import get_font

WIDTH = 600
HEIGHT = 900
TARGET_SIZE = (WIDTH, HEIGHT)


# --------------------------------------------------------------------------- #
# Paletas y símbolos deterministas                                            #
# --------------------------------------------------------------------------- #
PALETTES = [
    {"top": (18, 32, 55), "mid": (33, 57, 86), "bottom": (9, 14, 25), "accent": (228, 188, 92), "glow": (112, 177, 199)},
    {"top": (47, 22, 34), "mid": (88, 39, 52), "bottom": (22, 8, 15), "accent": (236, 180, 98), "glow": (205, 91, 113)},
    {"top": (23, 52, 47), "mid": (43, 90, 79), "bottom": (8, 25, 24), "accent": (231, 196, 106), "glow": (102, 196, 154)},
    {"top": (51, 43, 29), "mid": (87, 69, 42), "bottom": (21, 15, 8), "accent": (241, 198, 103), "glow": (207, 151, 72)},
    {"top": (34, 25, 62), "mid": (67, 45, 98), "bottom": (14, 9, 30), "accent": (224, 188, 112), "glow": (155, 125, 220)},
    {"top": (22, 38, 33), "mid": (58, 82, 50), "bottom": (10, 18, 13), "accent": (229, 199, 110), "glow": (169, 205, 105)},
    {"top": (52, 29, 20), "mid": (91, 48, 28), "bottom": (22, 10, 7), "accent": (238, 185, 95), "glow": (219, 111, 76)},
    {"top": (26, 42, 69), "mid": (41, 82, 108), "bottom": (9, 20, 34), "accent": (230, 201, 123), "glow": (118, 172, 227)},
    {"top": (43, 32, 47), "mid": (76, 50, 74), "bottom": (17, 11, 18), "accent": (232, 184, 121), "glow": (204, 128, 174)},
    {"top": (37, 45, 38), "mid": (69, 76, 55), "bottom": (15, 18, 14), "accent": (230, 201, 116), "glow": (173, 191, 125)},
    {"top": (29, 29, 36), "mid": (62, 58, 68), "bottom": (10, 10, 14), "accent": (224, 174, 93), "glow": (166, 160, 171)},
    {"top": (19, 48, 64), "mid": (29, 84, 99), "bottom": (7, 20, 30), "accent": (236, 199, 116), "glow": (92, 197, 212)},
]

# Descripción cromática en español para el prompt de la ilustración.
PALETTE_TONE = [
    "azul medianoche con dorados cálidos",
    "granate profundo con ámbar y rosa apagado",
    "verde bosque con oro viejo y jade",
    "marrón tabaco y trigo con luz de vela",
    "violeta noche con lavanda y oro pálido",
    "verde oliva y musgo con dorado suave",
    "terracota y cobre con ámbar tostado",
    "azul acero y cielo nocturno con oro claro",
    "ciruela y malva con oro rosado",
    "verde salvia y piedra con dorado tenue",
    "grafito y carbón con ámbar cobrizo",
    "azul petróleo y turquesa con oro miel",
]

SYMBOL_RULES = [
    ("insect_shadow", ("metamorfosis", "samsa", "escarabajo", "insecto")),
    ("lightning_flask", ("frankenstein", "laboratorio", "electricidad", "galvanismo")),
    ("crown_swallow", ("principe feliz", "golondrina", "estatua dorada")),
    ("cyclops_wave", ("polifemo", "galatea", "ciclope")),
    ("windmill", ("quijote", "molino de viento", "molinos de viento")),
    ("skull_dagger", ("hamlet", "calavera", "sepulturero")),
    ("compass", ("viaje", "viajes", "aventura", "mar", "luna", "centro", "tierra", "isla", "pirata", "nave", "capitan")),
    ("theater", ("tragedia", "comedia", "drama", "teatro", "hamlet", "yerma", "bernarda", "otelo", "macbeth", "sofocles", "euripides")),
    ("philosophy", ("filosofia", "metafisica", "alma", "socrates", "platon", "nietzsche", "kant", "moral", "verdad", "naturaleza")),
    ("quill", ("poemas", "poesia", "poeta", "rimas", "romancero", "prosas", "sonetos", "cancion", "parnaso", "cartas")),
    ("lantern", ("fantasma", "nocturno", "noche", "misterio", "casa", "calle", "usher", "suenos", "muerto", "difunto")),
    ("rose", ("amor", "amada", "felicidad", "vida", "flor", "flores", "jardin", "primavera", "cristina")),
    ("crown", ("rey", "reina", "principe", "princesa", "emperador", "cesar", "corte", "noble", "don")),
    ("blade", ("guerra", "batalla", "soldado", "gloria", "empecinado", "bruto", "guillermo", "tell", "zaragoza")),
    ("open_book", ("biblia", "evangelio", "cristo", "jesus", "virgen", "tratado", "testamento", "santo")),
    ("key_eye", ("robo", "robada", "detective", "sherlock", "holmes", "secreto", "enigma", "caja", "informe")),
    ("gear_orbit", ("ciencia", "socialismo", "psicopatologia", "narcisismo", "investigaciones", "academia", "descubrimiento")),
    ("path", ("camino", "walden", "recuerdos", "historia", "vidas", "memorias", "pueblo", "aldea")),
]
SYMBOLS = [rule[0] for rule in SYMBOL_RULES] + ["laurel"]

PALETTE_RULES = [
    (7, ("frankenstein", "ciencia ficcion", "electricidad", "tormenta", "rayo")),
    (4, ("polifemo", "galatea", "poesia", "poemas", "rimas", "lirica", "mitologia")),
    (0, ("principe feliz", "infantil", "cuento clasico", "golondrina")),
    (10, ("metamorfosis", "terror", "misterio", "suspense", "fantasma", "crimen")),
    (3, ("quijote", "aventura", "viaje", "viajes", "western")),
    (1, ("tragedia", "drama", "romantica", "amor", "pasion")),
    (2, ("bosque", "naturaleza", "jardin", "selva")),
]


def stable_seed(*parts: str) -> int:
    source = "|".join(part or "" for part in parts)
    return int(hashlib.sha256(source.encode("utf-8")).hexdigest()[:16], 16)


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return ascii_text.lower()


def choose_symbol(title: str, slug: str, authors: str, genres: str, seed: int) -> str:
    haystack = normalize_text(" ".join([title, slug, authors, genres]))
    for symbol, keywords in SYMBOL_RULES:
        if any(keyword in haystack for keyword in keywords):
            return symbol
    return SYMBOLS[seed % len(SYMBOLS)]


def palette_for(seed: int, family: int | None = None) -> dict:
    base = PALETTES[(seed if family is None else family) % len(PALETTES)]
    rng = random.Random(seed ^ 0xA11CE)
    adjusted = {}
    for key, color in base.items():
        shift = rng.randint(-12, 12)
        adjusted[key] = tuple(max(0, min(255, channel + shift)) for channel in color)
    return adjusted


def palette_tone_for(seed: int, family: int | None = None) -> str:
    return PALETTE_TONE[(seed if family is None else family) % len(PALETTE_TONE)]


def choose_palette_family(title: str, slug: str, genres: str, synopsis: str, seed: int) -> int:
    haystack = normalize_text(" ".join([title, slug, genres, synopsis]))
    for family, keywords in PALETTE_RULES:
        if any(keyword in haystack for keyword in keywords):
            return family
    return seed % len(PALETTES)


def build_cover_context(book) -> dict:
    """Metadatos deterministas de portada para un ``Book``."""
    authors = ", ".join(a.full_name for a in book.authors.all()) or "Autor Desconocido"
    genres = ", ".join(g.name for g in book.genres.all())
    title = (book.title or "").strip() or book.slug.replace("-", " ").title()
    synopsis = (getattr(book, "synopsis", "") or "").strip()
    seed = stable_seed(book.slug, title, authors, genres)
    palette_family = choose_palette_family(title, book.slug, genres, synopsis, seed)
    return {
        "title": title,
        "authors": authors,
        "genres": genres,
        "seed": seed,
        "symbol": choose_symbol(title, book.slug, authors, genres + " " + synopsis, seed),
        "palette_family": palette_family,
        "book_code": hashlib.sha1(book.slug.encode("utf-8")).hexdigest()[:7].upper(),
    }


def sha256_file(path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


# --------------------------------------------------------------------------- #
# Primitivas de texto                                                         #
# --------------------------------------------------------------------------- #
def _text_width(draw, text, font) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def _wrap_text(draw, text, font, max_width) -> list[str]:
    words = [w for w in text.split() if w]
    if not words:
        return [""]
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if _text_width(draw, candidate, font) <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
        while _text_width(draw, current, font) > max_width and len(current) > 3:
            split_at = max(3, int(len(current) * max_width / max(_text_width(draw, current, font), 1)) - 1)
            lines.append(current[:split_at] + "-")
            current = current[split_at:]
    if current:
        lines.append(current)
    return lines


def _fit_text_lines(draw, text, role, max_width, max_lines, start_size, min_size):
    for size in range(start_size, min_size - 1, -2):
        font = get_font(role, size, _FONT_SET[0])
        lines = _wrap_text(draw, text, font, max_width)
        if len(lines) <= max_lines:
            return font, lines, size
    font = get_font(role, min_size, _FONT_SET[0])
    lines = _wrap_text(draw, text, font, max_width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while _text_width(draw, last + "...", font) > max_width and len(last) > 1:
            last = last[:-1]
        lines[-1] = last.rstrip(" -") + "..."
    return font, lines, min_size


def _draw_centered_line(draw, text, y, font, fill, shadow=False):
    bbox = draw.textbbox((0, 0), text, font=font)
    x = (WIDTH - (bbox[2] - bbox[0])) // 2
    if shadow:
        draw.text((x + 2, y + 2), text, font=font, fill=(0, 0, 0, 150))
    draw.text((x, y), text, font=font, fill=fill)


def _diamond(draw, x, y, size, color):
    draw.polygon([(x, y - size), (x + size, y), (x, y + size), (x - size, y)], fill=color)


def _draw_corner(draw, x, y, sx, sy, color):
    draw.line([(x, y), (x + 36 * sx, y)], fill=color, width=2)
    draw.line([(x, y), (x, y + 36 * sy)], fill=color, width=2)
    ax0, ax1 = (x + 3, x + 31) if sx > 0 else (x - 41, x - 13)
    ay0, ay1 = (y + 3, y + 31) if sy > 0 else (y - 41, y - 13)
    draw.ellipse([min(ax0, ax1), min(ay0, ay1), max(ax0, ax1), max(ay0, ay1)], outline=color, width=1)
    _diamond(draw, x + 13 * sx, y + 13 * sy, 4, color)


# module-global font-set toggle (set by render_literatus_cover)
_FONT_SET = ["auto"]


# --------------------------------------------------------------------------- #
# Capas procedurales                                                          #
# --------------------------------------------------------------------------- #
def _gradient_background(palette) -> Image.Image:
    top, mid, bottom = palette["top"], palette["mid"], palette["bottom"]
    img = Image.new("RGBA", TARGET_SIZE, top + (255,))
    draw = ImageDraw.Draw(img)
    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        if t < 0.52:
            f, a, b = t / 0.52, top, mid
        else:
            f, a, b = (t - 0.52) / 0.48, mid, bottom
        color = tuple(int(a[i] * (1 - f) + b[i] * f) for i in range(3))
        draw.line([(0, y), (WIDTH, y)], fill=color + (255,))
    return img


def _add_texture(img, rng, palette) -> Image.Image:
    overlay = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    accent, glow = palette["accent"], palette["glow"]
    for _ in range(180):
        x = rng.randint(26, WIDTH - 26)
        y = rng.randint(36, HEIGHT - 36)
        radius = rng.choice((1, 1, 1, 2, 2, 3))
        alpha = rng.randint(18, 80)
        color = accent if rng.random() < 0.42 else glow
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color + (alpha,))
    for _ in range(18):
        x = rng.randint(-80, WIDTH + 80)
        y = rng.randint(120, HEIGHT - 120)
        length = rng.randint(120, 260)
        alpha = rng.randint(18, 44)
        draw.arc([x, y, x + length, y + length], start=rng.randint(0, 180),
                 end=rng.randint(185, 360), fill=accent + (alpha,), width=1)
    return Image.alpha_composite(img, overlay.filter(ImageFilter.GaussianBlur(0.25)))


def _add_glow(img, center, palette) -> Image.Image:
    glow = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    gx, gy = center
    glow_color = palette["glow"]
    for radius in range(245, 8, -6):
        f = (1 - radius / 245) ** 2.2
        alpha = int(105 * f)
        draw.ellipse([gx - radius, gy - radius, gx + radius, gy + radius], fill=glow_color + (alpha,))
    return Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(16)))


def _draw_medallion(draw, palette):
    cx, cy, r = WIDTH // 2, 330, 122
    accent = palette["accent"]
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=accent + (205,), fill=(0, 0, 0, 95), width=3)
    draw.ellipse([cx - r + 9, cy - r + 9, cx + r - 9, cy + r - 9], outline=accent + (88,), width=1)
    for rr in (88, 48):
        draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=accent + (42,), width=1)
    return cx, cy, r


def _draw_symbol(draw, symbol, cx, cy, r, palette, rng):
    accent = palette["accent"] + (240,)
    glow = palette["glow"] + (185,)
    ink = (8, 10, 16, 190)
    if symbol == "insect_shadow":
        for rr in (86, 62, 38):
            draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=accent[:3] + (52,), width=1)
        draw.ellipse([cx - 30, cy - 42, cx + 30, cy + 43], outline=accent, fill=ink, width=3)
        draw.ellipse([cx - 19, cy - 68, cx + 19, cy - 38], outline=accent, fill=glow, width=2)
        draw.line([(cx, cy - 40), (cx, cy + 40)], fill=accent[:3] + (150,), width=2)
        for side in (-1, 1):
            draw.line([(cx + side * 10, cy - 61), (cx + side * 38, cy - 84)], fill=accent, width=2)
            for y, dx, tip_y in ((-31, 58, -48), (-3, 68, 0), (25, 58, 53)):
                draw.line([(cx + side * 25, cy + y),
                           (cx + side * dx, cy + tip_y)], fill=accent, width=3)
        draw.ellipse([cx - 72, cy + 65, cx + 72, cy + 83], fill=(0, 0, 0, 82))
    elif symbol == "lightning_flask":
        draw.rectangle([cx - 20, cy - 76, cx + 20, cy - 45], outline=accent, fill=ink, width=3)
        draw.line([(cx - 18, cy - 45), (cx - 62, cy + 54)], fill=accent, width=3)
        draw.line([(cx + 18, cy - 45), (cx + 62, cy + 54)], fill=accent, width=3)
        draw.arc([cx - 63, cy + 8, cx + 63, cy + 82], 0, 180, fill=accent, width=3)
        draw.polygon([(cx - 48, cy + 34), (cx + 48, cy + 34),
                      (cx + 61, cy + 57), (cx - 61, cy + 57)], fill=glow[:3] + (62,))
        draw.line([(cx + 38, cy - 91), (cx + 7, cy - 28),
                   (cx + 31, cy - 28), (cx - 21, cy + 36),
                   (cx - 5, cy - 9), (cx - 31, cy - 9)], fill=glow, width=5)
        for px, py, rr in ((-32, 29, 5), (20, 48, 7), (41, 20, 4)):
            draw.ellipse([cx + px - rr, cy + py - rr, cx + px + rr, cy + py + rr], outline=accent, width=2)
    elif symbol == "crown_swallow":
        draw.polygon([(cx - 75, cy + 2), (cx - 67, cy - 48), (cx - 31, cy - 13),
                      (cx, cy - 67), (cx + 31, cy - 13), (cx + 67, cy - 48),
                      (cx + 75, cy + 2)], outline=accent, fill=accent[:3] + (64,), width=2)
        draw.rectangle([cx - 70, cy + 2, cx + 70, cy + 22], outline=accent, fill=ink, width=2)
        sy = cy + 55
        draw.polygon([(cx, sy - 18), (cx - 50, sy - 43), (cx - 18, sy - 2),
                      (cx - 34, sy + 28), (cx, sy + 9), (cx + 34, sy + 28),
                      (cx + 18, sy - 2), (cx + 50, sy - 43)], fill=glow)
        draw.ellipse([cx - 7, sy - 12, cx + 7, sy + 4], fill=accent)
    elif symbol == "cyclops_wave":
        draw.arc([cx - 87, cy - 80, cx + 87, cy + 78], 195, 345, fill=accent, width=4)
        draw.ellipse([cx - 65, cy - 45, cx + 65, cy + 30], outline=accent, fill=ink, width=3)
        draw.ellipse([cx - 28, cy - 39, cx + 28, cy + 23], outline=glow, width=3)
        draw.ellipse([cx - 9, cy - 18, cx + 9, cy + 4], fill=glow)
        for offset in (0, 16, 32):
            draw.arc([cx - 93 + offset, cy + 25 + offset // 3,
                      cx + 45 + offset, cy + 72 + offset // 3], 195, 342, fill=accent, width=2)
        draw.polygon([(cx + 53, cy - 73), (cx + 72, cy - 25), (cx + 48, cy - 39)], fill=glow)
    elif symbol == "windmill":
        draw.polygon([(cx - 30, cy + 72), (cx - 22, cy - 20),
                      (cx + 22, cy - 20), (cx + 30, cy + 72)], outline=accent, fill=ink, width=3)
        draw.ellipse([cx - 9, cy + 40, cx + 9, cy + 71], outline=accent, width=2)
        for angle in (35, 125, 215, 305):
            rad = math.radians(angle)
            ex = cx + int(math.cos(rad) * 92)
            ey = cy - 19 + int(math.sin(rad) * 92)
            wx = int(math.sin(rad) * 9)
            wy = int(math.cos(rad) * 9)
            draw.polygon([(cx - wx, cy - 19 + wy), (cx + wx, cy - 19 - wy),
                          (ex + wx, ey - wy), (ex - wx, ey + wy)],
                         outline=accent, fill=glow[:3] + (50,))
        draw.ellipse([cx - 10, cy - 29, cx + 10, cy - 9], fill=glow)
    elif symbol == "skull_dagger":
        draw.line([(cx, cy - 91), (cx, cy + 83)], fill=accent, width=4)
        draw.polygon([(cx, cy - 102), (cx - 12, cy - 76),
                      (cx, cy - 85), (cx + 12, cy - 76)], fill=glow)
        draw.line([(cx - 43, cy - 47), (cx + 43, cy - 47)], fill=accent, width=5)
        draw.ellipse([cx - 40, cy - 33, cx + 40, cy + 38], outline=accent, fill=ink, width=3)
        draw.rectangle([cx - 22, cy + 28, cx + 22, cy + 54], outline=accent, fill=ink, width=2)
        draw.ellipse([cx - 26, cy - 13, cx - 7, cy + 9], fill=glow)
        draw.ellipse([cx + 7, cy - 13, cx + 26, cy + 9], fill=glow)
        draw.polygon([(cx, cy + 8), (cx - 6, cy + 20), (cx + 6, cy + 20)], fill=accent)
    elif symbol == "compass":
        draw.ellipse([cx - 74, cy - 74, cx + 74, cy + 74], outline=accent, width=2)
        for angle in range(0, 360, 45):
            rad = math.radians(angle)
            p1 = (cx + int(math.cos(rad) * 26), cy + int(math.sin(rad) * 26))
            p2 = (cx + int(math.cos(rad) * 72), cy + int(math.sin(rad) * 72))
            draw.line([p1, p2], fill=accent, width=2 if angle % 90 == 0 else 1)
        draw.polygon([(cx, cy - 82), (cx - 16, cy + 8), (cx, cy - 8), (cx + 16, cy + 8)], fill=glow)
        draw.polygon([(cx, cy + 82), (cx - 14, cy - 8), (cx, cy + 8), (cx + 14, cy - 8)], fill=accent)
        draw.arc([cx - 86, cy + 48, cx + 86, cy + 116], 200, 340, fill=accent, width=3)
    elif symbol == "theater":
        draw.ellipse([cx - 62, cy - 50, cx - 5, cy + 38], outline=accent, fill=ink, width=2)
        draw.ellipse([cx + 5, cy - 42, cx + 62, cy + 46], outline=accent, fill=ink, width=2)
        for ox, sad in [(-38, False), (38, True)]:
            draw.ellipse([cx + ox - 14, cy - 14, cx + ox - 2, cy - 2], fill=accent)
            draw.ellipse([cx + ox + 4, cy - 14, cx + ox + 16, cy - 2], fill=accent)
            if sad:
                draw.arc([cx + ox - 15, cy + 6, cx + ox + 15, cy + 28], 180, 360, fill=accent, width=2)
            else:
                draw.arc([cx + ox - 15, cy + 4, cx + ox + 15, cy + 26], 0, 180, fill=accent, width=2)
        draw.arc([cx - 88, cy - 72, cx + 88, cy + 82], 20, 340, fill=glow, width=2)
    elif symbol == "philosophy":
        draw.polygon([(cx, cy - 88), (cx - 82, cy - 48), (cx + 82, cy - 48)], outline=accent, fill=accent[:3] + (48,), width=2)
        draw.rectangle([cx - 90, cy - 48, cx + 90, cy - 36], fill=accent)
        for col_x in (cx - 58, cx - 20, cx + 20, cx + 58):
            draw.line([(col_x, cy - 34), (col_x, cy + 64)], fill=accent, width=4)
        draw.rectangle([cx - 96, cy + 64, cx + 96, cy + 77], fill=accent)
        draw.ellipse([cx - 21, cy - 14, cx + 21, cy + 30], outline=glow, fill=glow, width=2)
    elif symbol == "quill":
        draw.rectangle([cx - 58, cy - 34, cx + 50, cy + 52], outline=accent, fill=(255, 244, 210, 38), width=2)
        for ly in range(cy - 16, cy + 38, 14):
            draw.line([(cx - 42, ly), (cx + 34, ly)], fill=accent[:3] + (120,), width=2)
        draw.line([(cx - 14, cy + 68), (cx + 62, cy - 70)], fill=accent, width=4)
        draw.polygon([(cx + 15, cy - 4), (cx + 68, cy - 78), (cx + 43, cy - 59), (cx + 30, cy - 12)], fill=glow)
        draw.line([(cx + 31, cy - 18), (cx + 61, cy - 68)], fill=ink, width=1)
    elif symbol == "lantern":
        draw.line([(cx, cy - 88), (cx, cy - 60)], fill=accent, width=3)
        draw.polygon([(cx, cy - 68), (cx - 43, cy - 38), (cx + 43, cy - 38)], fill=accent)
        draw.polygon([(cx - 42, cy - 38), (cx - 27, cy + 42), (cx + 27, cy + 42), (cx + 42, cy - 38)], outline=accent, fill=glow[:3] + (82,), width=2)
        draw.ellipse([cx - 13, cy - 13, cx + 13, cy + 16], fill=(255, 221, 129, 235))
        draw.rectangle([cx - 6, cy + 42, cx + 6, cy + 83], fill=accent)
        draw.line([(cx - 35, cy + 83), (cx + 35, cy + 83)], fill=accent, width=4)
    elif symbol == "rose":
        draw.line([(cx, cy + 80), (cx, cy - 8)], fill=(96, 171, 116, 230), width=4)
        draw.arc([cx - 62, cy + 12, cx - 2, cy + 72], 215, 330, fill=(96, 171, 116, 210), width=4)
        for angle in range(0, 360, 60):
            rad = math.radians(angle)
            px = cx + int(math.cos(rad) * 28)
            py = cy - 28 + int(math.sin(rad) * 22)
            draw.ellipse([px - 24, py - 18, px + 24, py + 18], outline=accent, fill=glow[:3] + (115,), width=2)
        draw.ellipse([cx - 15, cy - 44, cx + 15, cy - 13], fill=accent)
    elif symbol == "crown":
        draw.polygon([(cx - 82, cy + 18), (cx - 72, cy - 47), (cx - 34, cy - 12), (cx, cy - 67), (cx + 34, cy - 12), (cx + 72, cy - 47), (cx + 82, cy + 18)], outline=accent, fill=accent[:3] + (72,), width=2)
        draw.rectangle([cx - 75, cy + 18, cx + 75, cy + 38], outline=accent, fill=ink, width=2)
        for px, py in ((cx - 72, cy - 48), (cx - 34, cy - 13), (cx, cy - 68), (cx + 34, cy - 13), (cx + 72, cy - 48)):
            draw.ellipse([px - 5, py - 5, px + 5, py + 5], fill=glow)
        draw.line([(cx - 48, cy + 62), (cx + 48, cy + 62)], fill=accent, width=3)
    elif symbol == "blade":
        draw.line([(cx, cy - 84), (cx, cy + 77)], fill=accent, width=4)
        draw.polygon([(cx, cy - 99), (cx - 13, cy - 70), (cx, cy - 82), (cx + 13, cy - 70)], fill=glow)
        draw.line([(cx - 52, cy - 34), (cx + 52, cy - 34)], fill=accent, width=5)
        draw.arc([cx - 68, cy - 2, cx + 68, cy + 104], 200, 340, fill=accent, width=3)
        draw.ellipse([cx - 8, cy + 70, cx + 8, cy + 86], fill=accent)
    elif symbol == "open_book":
        draw.polygon([(cx - 88, cy - 38), (cx - 10, cy - 12), (cx - 10, cy + 68), (cx - 88, cy + 42)], outline=accent, fill=(255, 245, 213, 48), width=2)
        draw.polygon([(cx + 88, cy - 38), (cx + 10, cy - 12), (cx + 10, cy + 68), (cx + 88, cy + 42)], outline=accent, fill=(255, 245, 213, 48), width=2)
        draw.line([(cx, cy - 13), (cx, cy + 72)], fill=accent, width=2)
        for y in range(cy - 10, cy + 45, 17):
            draw.line([(cx - 72, y), (cx - 22, y + 10)], fill=accent[:3] + (120,), width=2)
            draw.line([(cx + 22, y + 10), (cx + 72, y)], fill=accent[:3] + (120,), width=2)
        draw.ellipse([cx - 32, cy - 94, cx + 32, cy - 30], outline=glow, width=3)
    elif symbol == "key_eye":
        draw.ellipse([cx - 82, cy - 34, cx + 82, cy + 38], outline=accent, width=3)
        draw.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], outline=accent, fill=ink, width=2)
        draw.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=glow)
        draw.line([(cx - 72, cy + 74), (cx + 44, cy - 43)], fill=accent, width=4)
        draw.ellipse([cx - 85, cy + 64, cx - 57, cy + 92], outline=accent, width=3)
        draw.line([(cx + 31, cy - 30), (cx + 59, cy - 30)], fill=accent, width=4)
        draw.line([(cx + 49, cy - 30), (cx + 49, cy - 12)], fill=accent, width=3)
    elif symbol == "gear_orbit":
        for angle in range(0, 360, 30):
            rad = math.radians(angle)
            p1 = (cx + int(math.cos(rad) * 46), cy + int(math.sin(rad) * 46))
            p2 = (cx + int(math.cos(rad) * 69), cy + int(math.sin(rad) * 69))
            draw.line([p1, p2], fill=accent, width=3)
        draw.ellipse([cx - 48, cy - 48, cx + 48, cy + 48], outline=accent, fill=ink, width=4)
        draw.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], outline=glow, fill=glow, width=2)
        draw.arc([cx - 104, cy - 54, cx + 104, cy + 54], 12, 348, fill=accent, width=2)
        draw.ellipse([cx + 83, cy - 9, cx + 101, cy + 9], fill=glow)
    elif symbol == "path":
        draw.arc([cx - 98, cy - 116, cx + 98, cy + 80], 200, 340, fill=accent, width=2)
        draw.line([(cx - 95, cy + 72), (cx - 24, cy - 6), (cx + 8, cy + 76)], fill=accent, width=3)
        draw.line([(cx + 95, cy + 72), (cx + 25, cy - 6), (cx + 8, cy + 76)], fill=accent, width=3)
        draw.polygon([(cx - 90, cy + 72), (cx - 25, cy - 6), (cx + 25, cy - 6), (cx + 90, cy + 72)], fill=accent[:3] + (44,))
        draw.ellipse([cx - 30, cy - 78, cx + 30, cy - 18], outline=glow, width=3)
    else:  # laurel
        draw.arc([cx - 74, cy - 82, cx - 4, cy + 72], 94, 286, fill=accent, width=4)
        draw.arc([cx + 4, cy - 82, cx + 74, cy + 72], 254, 86, fill=accent, width=4)
        for side in (-1, 1):
            for idx in range(7):
                y = cy - 50 + idx * 20
                x = cx + side * (32 + idx * 4)
                draw.ellipse([x - 12, y - 7, x + 12, y + 7], fill=glow if idx % 2 else accent)
        draw.line([(cx - 40, cy + 68), (cx + 40, cy + 68)], fill=accent, width=3)
    for _ in range(6):
        angle = rng.random() * math.tau
        rr = rng.randint(76, 106)
        x = cx + int(math.cos(angle) * rr)
        y = cy + int(math.sin(angle) * rr)
        _diamond(draw, x, y, rng.choice((3, 4, 5)), glow)


def _draw_frame(draw, palette, book_code):
    accent = palette["accent"]
    gold = accent + (220,)
    soft = accent + (120,)
    draw.rectangle([24, 24, WIDTH - 24, HEIGHT - 24], outline=gold, width=2)
    draw.rectangle([33, 33, WIDTH - 33, HEIGHT - 33], outline=soft, width=1)
    _draw_corner(draw, 30, 30, 1, 1, gold)
    _draw_corner(draw, WIDTH - 30, 30, -1, 1, gold)
    _draw_corner(draw, 30, HEIGHT - 30, 1, -1, gold)
    _draw_corner(draw, WIDTH - 30, HEIGHT - 30, -1, -1, gold)
    brand_font = get_font("brand", 18, _FONT_SET[0])
    _draw_centered_line(draw, "L I T E R A T U S", 54, brand_font, gold)
    draw.line([(175, 84), (425, 84)], fill=soft, width=1)
    _diamond(draw, WIDTH // 2, 84, 4, gold)
    label_font = get_font("label", 11, _FONT_SET[0])
    _draw_centered_line(draw, f"COLECCION LITERATUS  /  {book_code}", HEIGHT - 54, label_font, accent + (185,))


def _scrim(img, palette) -> Image.Image:
    """Degradado inferior para legibilidad del título sobre la ilustración."""
    overlay = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    start = int(HEIGHT * 0.40)
    for y in range(start, HEIGHT):
        f = (y - start) / (HEIGHT - start)
        alpha = int(210 * (f ** 1.35))
        draw.line([(0, y), (WIDTH, y)], fill=(8, 10, 16, alpha))
    # viñeta superior suave para la cabecera de marca
    for y in range(0, 150):
        alpha = int(150 * (1 - y / 150) ** 1.6)
        draw.line([(0, y), (WIDTH, y)], fill=(8, 10, 16, alpha))
    return Image.alpha_composite(img, overlay)


# --------------------------------------------------------------------------- #
# API pública                                                                 #
# --------------------------------------------------------------------------- #
def _draw_text_block(img, title, authors, palette):
    draw = ImageDraw.Draw(img)
    accent = palette["accent"] + (230,)
    cream = (249, 246, 235, 255)
    muted = (236, 220, 171, 225)

    draw.line([(62, 494), (WIDTH - 62, 494)], fill=accent, width=1)
    _diamond(draw, WIDTH // 2, 494, 5, accent)

    title_font, title_lines, title_size = _fit_text_lines(
        draw, title, "title", max_width=464, max_lines=4, start_size=40, min_size=20)
    line_gap = int(title_size * 1.16)
    title_height = len(title_lines) * line_gap
    title_y = 524 + max(0, (128 - title_height) // 2)
    for index, line in enumerate(title_lines):
        _draw_centered_line(draw, line, title_y + index * line_gap, title_font, cream, shadow=True)

    # separador: siempre debajo del título real y con margen para el autor
    sep_y = min(748, max(660, title_y + title_height + 18))
    draw.line([(WIDTH // 2 - 70, sep_y), (WIDTH // 2 + 70, sep_y)], fill=accent[:3] + (150,), width=1)
    _diamond(draw, WIDTH // 2, sep_y, 3, accent)

    author_font, author_lines, author_size = _fit_text_lines(
        draw, authors, "author_bold", max_width=436, max_lines=2, start_size=24, min_size=15)
    author_gap = int(author_size * 1.22)
    author_block = author_lines and author_gap * len(author_lines) or author_gap
    author_y = min(sep_y + 20, 792 - author_block)
    for index, line in enumerate(author_lines):
        _draw_centered_line(draw, line, author_y + index * author_gap, author_font, muted, shadow=True)

    motif_font = get_font("label", 11, _FONT_SET[0])
    _draw_centered_line(draw, "EDICION LITERATUS", 812, motif_font, palette["accent"] + (150,))
    return img


def prepare_art(image: Image.Image) -> Image.Image:
    """Recorta/ajusta una ilustración a 600x900 RGB con encuadre superior."""
    image = ImageOps.exif_transpose(image).convert("RGB")
    return ImageOps.fit(image, TARGET_SIZE, method=Image.LANCZOS, centering=(0.5, 0.38))


def render_literatus_cover(
    *,
    title: str,
    authors: str,
    book_code: str,
    seed: int,
    symbol: str,
    palette: dict | None = None,
    art_background: Image.Image | None = None,
    with_medallion: bool = True,
    font_set: str = "auto",
) -> Image.Image:
    """Devuelve la portada RGB 600x900 (híbrida si ``art_background`` está dado)."""
    _FONT_SET[0] = font_set
    palette = palette or palette_for(seed)
    rng = random.Random(seed)

    if art_background is not None:
        base = prepare_art(art_background).convert("RGBA")
        base = ImageEnhance.Brightness(base).enhance(0.94)
        base = ImageEnhance.Color(base).enhance(0.96)
        img = _scrim(base, palette)
        draw = ImageDraw.Draw(img)
        _draw_frame(draw, palette, book_code)
        _draw_text_block(img, title, authors, palette)
        return img.convert("RGB")

    # ---- procedural ----
    img = _gradient_background(palette)
    img = _add_glow(img, (WIDTH // 2, 324), palette)
    img = _add_texture(img, rng, palette)
    draw = ImageDraw.Draw(img)
    _draw_frame(draw, palette, book_code)
    if with_medallion:
        cx, cy, radius = _draw_medallion(draw, palette)
        _draw_symbol(draw, symbol, cx, cy, radius, palette, rng)
    _draw_text_block(img, title, authors, palette)
    return img.convert("RGB")
