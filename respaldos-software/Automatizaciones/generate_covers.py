"""
generate_covers.py — Motor de Generación y Unificación de Portadas LiteratusNovelist
Genera portadas editoriales unificadas de 600x900 px en formato WebP optimizado y sincroniza con Django DB.
"""

import os
import sys
import math
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Dimensiones canónicas
WIDTH = 600
HEIGHT = 900

# Fuentes del sistema Windows
FONT_DIR = r"C:\Windows\Fonts"
FONT_TITLE = os.path.join(FONT_DIR, "georgiab.ttf") if os.path.exists(os.path.join(FONT_DIR, "georgiab.ttf")) else "arial.ttf"
FONT_TITLE_ITALIC = os.path.join(FONT_DIR, "georgiai.ttf") if os.path.exists(os.path.join(FONT_DIR, "georgiai.ttf")) else "arial.ttf"
FONT_AUTHOR = os.path.join(FONT_DIR, "pala.ttf") if os.path.exists(os.path.join(FONT_DIR, "pala.ttf")) else os.path.join(FONT_DIR, "georgia.ttf")
FONT_AUTHOR_BOLD = os.path.join(FONT_DIR, "palab.ttf") if os.path.exists(os.path.join(FONT_DIR, "palab.ttf")) else os.path.join(FONT_DIR, "georgiab.ttf")
FONT_BRAND = os.path.join(FONT_DIR, "timesbd.ttf") if os.path.exists(os.path.join(FONT_DIR, "timesbd.ttf")) else "arial.ttf"
FONT_LABEL = os.path.join(FONT_DIR, "segoeui.ttf") if os.path.exists(os.path.join(FONT_DIR, "segoeui.ttf")) else "arial.ttf"

def get_font(font_path, size):
    try:
        return ImageFont.truetype(font_path, size)
    except Exception:
        return ImageFont.load_default()

def create_gradient(width, height, color_top, color_bottom, color_mid=None):
    """Crea una imagen base con degradado vertical suave."""
    base = Image.new("RGBA", (width, height), color_top)
    draw = ImageDraw.Draw(base)
    
    for y in range(height):
        factor = y / height
        if color_mid:
            if factor < 0.5:
                f2 = factor * 2
                r = int(color_top[0] * (1 - f2) + color_mid[0] * f2)
                g = int(color_top[1] * (1 - f2) + color_mid[1] * f2)
                b = int(color_top[2] * (1 - f2) + color_mid[2] * f2)
            else:
                f2 = (factor - 0.5) * 2
                r = int(color_mid[0] * (1 - f2) + color_bottom[0] * f2)
                g = int(color_mid[1] * (1 - f2) + color_bottom[1] * f2)
                b = int(color_mid[2] * (1 - f2) + color_bottom[2] * f2)
        else:
            r = int(color_top[0] * (1 - factor) + color_bottom[0] * factor)
            g = int(color_top[1] * (1 - factor) + color_bottom[1] * factor)
            b = int(color_top[2] * (1 - factor) + color_bottom[2] * factor)
        draw.line([(0, y), (width, y)], fill=(r, g, b, 255))
    return base

def add_radial_vignette(img, center, radius, color_glow, alpha_max=160):
    """Añade un resplandor radial o viñeta."""
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    cx, cy = center
    
    for r in range(radius, 0, -4):
        f = (1 - (r / radius)) ** 1.8
        alpha = int(alpha_max * f)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(color_glow[0], color_glow[1], color_glow[2], alpha))
        
    glow = glow.filter(ImageFilter.GaussianBlur(12))
    return Image.alpha_composite(img, glow)

def add_texture_and_stars(img, num_dots=120, seed=42):
    """Añade textura sutil y partículas de luz/estrellas."""
    rng = random.Random(seed)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    for _ in range(num_dots):
        x = rng.randint(20, WIDTH - 20)
        y = rng.randint(40, HEIGHT - 40)
        size = rng.choice([1, 1, 2, 2, 3])
        brightness = rng.randint(110, 240)
        alpha = rng.randint(40, 180)
        draw.ellipse([x - size, y - size, x + size, y + size], fill=(brightness, brightness, brightness, alpha))
        
    return Image.alpha_composite(img, overlay)

def draw_diamond(draw, cx, cy, size, color):
    """Dibuja un rombo ornamental."""
    draw.polygon([(cx, cy - size), (cx + size, cy), (cx, cy + size), (cx - size, cy)], fill=color)

def draw_corner_ornament(draw, x, y, size, color, flip_x=False, flip_y=False):
    """Dibuja un esquinero ornamental clásico."""
    sx = -1 if flip_x else 1
    sy = -1 if flip_y else 1
    
    draw.line([(x, y), (x + size * sx, y)], fill=color, width=2)
    draw.line([(x, y), (x, y + size * sy)], fill=color, width=2)
    draw.line([(x + 6 * sx, y + 6 * sy), (x + (size - 8) * sx, y + 6 * sy)], fill=color, width=1)
    draw.line([(x + 6 * sx, y + 6 * sy), (x + 6 * sx, y + (size - 8) * sy)], fill=color, width=1)
    draw_diamond(draw, x + 12 * sx, y + 12 * sy, 3, color)

def draw_editorial_frame(img, gold_color=(212, 175, 55)):
    """Dibuja el marco editorial estructurado de Literatus."""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    m1 = 24
    draw.rectangle([m1, m1, WIDTH - m1, HEIGHT - m1], outline=(gold_color[0], gold_color[1], gold_color[2], 220), width=2)
    
    m2 = 30
    draw.rectangle([m2, m2, WIDTH - m2, HEIGHT - m2], outline=(gold_color[0], gold_color[1], gold_color[2], 140), width=1)
    
    c_size = 28
    draw_corner_ornament(draw, m1 + 2, m1 + 2, c_size, (gold_color[0], gold_color[1], gold_color[2], 240), False, False)
    draw_corner_ornament(draw, WIDTH - m1 - 2, m1 + 2, c_size, (gold_color[0], gold_color[1], gold_color[2], 240), True, False)
    draw_corner_ornament(draw, m1 + 2, HEIGHT - m1 - 2, c_size, (gold_color[0], gold_color[1], gold_color[2], 240), False, True)
    draw_corner_ornament(draw, WIDTH - m1 - 2, HEIGHT - m1 - 2, c_size, (gold_color[0], gold_color[1], gold_color[2], 240), True, True)
    
    return Image.alpha_composite(img, overlay)

def draw_illustration_symbol(draw, symbol_type, cx, cy, radius, primary_color, accent_color):
    """Dibuja una ilustración simbólica temática de alta calidad."""
    gold = accent_color
    pri = primary_color
    
    if symbol_type == "crown_swallow":
        # Corona Real + Golondrina (El Príncipe Feliz)
        draw.polygon([(cx - 70, cy + 10), (cx - 70, cy - 40), (cx - 35, cy - 10), (cx, cy - 60), (cx + 35, cy - 10), (cx + 70, cy - 40), (cx + 70, cy + 10)], outline=gold, fill=(gold[0], gold[1], gold[2], 50))
        for px, py in [(cx - 70, cy - 42), (cx - 35, cy - 12), (cx, cy - 62), (cx + 35, cy - 12), (cx + 70, cy - 42)]:
            draw.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(255, 230, 120, 255))
        sy = cy + 50
        draw.polygon([(cx, sy - 20), (cx - 45, sy - 45), (cx - 15, sy - 5), (cx - 30, sy + 30), (cx, sy + 10), (cx + 30, sy + 30), (cx + 15, sy - 5), (cx + 45, sy - 45)], fill=gold)

    elif symbol_type == "scarab_maze":
        # Escarabajo / Metamorfosis geométrica
        for r in [radius, radius - 25, radius - 50]:
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(gold[0], gold[1], gold[2], 90), width=1)
        draw.ellipse([cx - 28, cy - 45, cx + 28, cy + 25], outline=gold, fill=(pri[0], pri[1], pri[2], 180), width=2)
        draw.ellipse([cx - 18, cy - 70, cx + 18, cy - 42], outline=gold, fill=gold, width=2)
        for side in [-1, 1]:
            draw.line([(cx + side * 8, cy - 65), (cx + side * 32, cy - 85)], fill=gold, width=2)
            draw.line([(cx + side * 20, cy - 35), (cx + side * 55, cy - 50), (cx + side * 70, cy - 30)], fill=gold, width=2)
            draw.line([(cx + side * 26, cy - 10), (cx + side * 65, cy - 5), (cx + side * 75, cy + 20)], fill=gold, width=2)
            draw.line([(cx + side * 22, cy + 15), (cx + side * 55, cy + 45), (cx + side * 60, cy + 75)], fill=gold, width=2)

    elif symbol_type == "skull_dagger":
        # Calavera clásica / Daga (Hamlet)
        draw.arc([cx - radius + 15, cy - radius + 15, cx + radius - 15, cy + radius - 15], 30, 330, fill=(gold[0], gold[1], gold[2], 120), width=2)
        draw.line([(cx, cy - 85), (cx, cy + 80)], fill=gold, width=3)
        draw.line([(cx - 35, cy - 40), (cx + 35, cy - 40)], fill=gold, width=4)
        draw.ellipse([cx - 8, cy - 95, cx + 8, cy - 79], fill=gold)
        draw.ellipse([cx - 35, cy - 25, cx + 35, cy + 30], outline=gold, fill=(20, 25, 40, 220), width=2)
        draw.rectangle([cx - 18, cy + 25, cx + 18, cy + 45], outline=gold, fill=(20, 25, 40, 220), width=2)
        draw.ellipse([cx - 22, cy - 8, cx - 6, cy + 12], fill=gold)
        draw.ellipse([cx + 6, cy - 8, cx + 22, cy + 12], fill=gold)
        draw.polygon([(cx, cy + 12), (cx - 5, cy + 22), (cx + 5, cy + 22)], fill=gold)

    elif symbol_type == "greek_pillar_psyche":
        # Columnas griegas y alma alada (Fedón / Platón / Góngora / Nietzsche)
        draw.polygon([(cx, cy - 85), (cx - 75, cy - 45), (cx + 75, cy - 45)], outline=gold, fill=(gold[0], gold[1], gold[2], 40), width=2)
        draw.rectangle([cx - 80, cy - 45, cx + 80, cy - 35], outline=gold, fill=gold, width=2)
        for col_x in [cx - 55, cx - 20, cx + 20, cx + 55]:
            draw.line([(col_x, cy - 35), (col_x, cy + 50)], fill=gold, width=3)
        draw.rectangle([cx - 85, cy + 50, cx + 85, cy + 62], outline=gold, fill=gold, width=2)
        draw.ellipse([cx - 18, cy - 25, cx + 18, cy + 15], outline=(255, 230, 150, 255), fill=gold, width=2)

    elif symbol_type == "compass_caravel":
        # Rosa de los vientos / Navío / Astrolabio (Verne / Magallanes)
        draw.ellipse([cx - radius + 20, cy - radius + 20, cx + radius - 20, cy + radius - 20], outline=gold, width=2)
        draw.ellipse([cx - radius + 35, cy - radius + 35, cx + radius - 35, cy + radius - 35], outline=(gold[0], gold[1], gold[2], 100), width=1)
        draw.polygon([(cx, cy - 75), (cx - 12, cy), (cx, cy - 15)], fill=gold)
        draw.polygon([(cx, cy - 75), (cx + 12, cy), (cx, cy - 15)], fill=(gold[0], gold[1], gold[2], 150))
        draw.polygon([(cx, cy + 75), (cx - 12, cy), (cx, cy + 15)], fill=(gold[0], gold[1], gold[2], 150))
        draw.polygon([(cx, cy + 75), (cx + 12, cy), (cx, cy + 15)], fill=gold)
        draw.polygon([(cx - 75, cy), (cx, cy - 12), (cx - 15, cy)], fill=gold)
        draw.polygon([(cx - 75, cy), (cx, cy + 12), (cx - 15, cy)], fill=(gold[0], gold[1], gold[2], 150))
        draw.polygon([(cx + 75, cy), (cx, cy - 12), (cx + 15, cy)], fill=(gold[0], gold[1], gold[2], 150))
        draw.polygon([(cx + 75, cy), (cx, cy + 12), (cx + 15, cy)], fill=gold)
        draw.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=(255, 240, 180, 255))

    elif symbol_type == "theater_masks":
        # Máscaras de teatro clásico (Sófocles / Chejov)
        draw.arc([cx - 75, cy - 60, cx + 75, cy + 60], 20, 340, fill=(gold[0], gold[1], gold[2], 140), width=2)
        draw.ellipse([cx - 55, cy - 35, cx - 5, cy + 25], outline=gold, fill=(30, 20, 30, 200), width=2)
        draw.ellipse([cx - 45, cy - 18, cx - 33, cy - 6], fill=gold)
        draw.ellipse([cx - 27, cy - 18, cx - 15, cy - 6], fill=gold)
        draw.arc([cx - 40, cy + 2, cx - 20, cy + 22], 0, 180, fill=gold, width=2)
        draw.ellipse([cx + 5, cy - 25, cx + 55, cy + 35], outline=gold, fill=(30, 20, 30, 200), width=2)
        draw.ellipse([cx + 15, cy - 8, cx + 27, cy + 4], fill=gold)
        draw.ellipse([cx + 33, cy - 8, cx + 45, cy + 4], fill=gold)
        draw.arc([cx + 20, cy + 8, cx + 40, cy + 26], 180, 360, fill=gold, width=2)

    elif symbol_type == "fable_animals":
        # Animales / Fábulas (Esopo / Iriarte / Virgilio)
        draw.ellipse([cx - radius + 20, cy - radius + 20, cx + radius - 20, cy + radius - 20], outline=gold, width=2)
        draw.polygon([(cx - 45, cy + 35), (cx - 15, cy - 15), (cx, cy + 10), (cx + 25, cy - 10), (cx + 45, cy + 35), (cx + 15, cy + 25), (cx - 15, cy + 25)], outline=gold, fill=(gold[0], gold[1], gold[2], 80), width=2)
        draw.line([(cx - 60, cy - 20), (cx + 50, cy - 40)], fill=gold, width=3)
        draw.polygon([(cx + 10, cy - 42), (cx + 35, cy - 65), (cx + 45, cy - 45), (cx + 25, cy - 38)], fill=gold)

    elif symbol_type == "quill_manuscript":
        # Pluma y pergamino (Nebrija / Chejov)
        draw.ellipse([cx - radius + 25, cy - radius + 25, cx + radius - 25, cy + radius - 25], outline=gold, width=1)
        draw.rectangle([cx - 45, cy - 35, cx + 45, cy + 45], outline=gold, fill=(240, 230, 200, 40), width=2)
        for ly in range(cy - 20, cy + 35, 12):
            draw.line([(cx - 32, ly), (cx + 32, ly)], fill=(gold[0], gold[1], gold[2], 120), width=2)
        draw.line([(cx - 20, cy + 50), (cx + 50, cy - 65)], fill=gold, width=3)
        draw.polygon([(cx + 10, cy - 15), (cx + 45, cy - 65), (cx + 25, cy - 50)], fill=gold)

    elif symbol_type == "garden_bloom":
        # Jardín / Flores / Naturaleza (Mansfield / Rosalía / Valle-Inclán)
        draw.ellipse([cx - radius + 15, cy - radius + 15, cx + radius - 15, cy + radius - 15], outline=gold, width=2)
        for angle in range(0, 360, 72):
            rad = math.radians(angle)
            px = cx + math.cos(rad) * 35
            py = cy + math.sin(rad) * 35
            draw.ellipse([px - 22, py - 22, px + 22, py + 22], outline=gold, fill=(gold[0], gold[1], gold[2], 60), width=2)
        draw.ellipse([cx - 15, cy - 15, cx + 15, cy + 15], fill=(255, 235, 160, 255))

    elif symbol_type == "victorian_lantern":
        # Farol Victoriano / Calle nocturna (Hawthorne / Galdós)
        draw.polygon([(cx, cy - 65), (cx - 35, cy - 35), (cx + 35, cy - 35)], outline=gold, fill=gold)
        draw.polygon([(cx - 35, cy - 35), (cx - 22, cy + 25), (cx + 22, cy + 25), (cx + 35, cy - 35)], outline=gold, fill=(255, 240, 150, 80), width=2)
        draw.ellipse([cx - 10, cy - 15, cx + 10, cy + 5], fill=(255, 215, 0, 255))
        draw.rectangle([cx - 4, cy + 25, cx + 4, cy + 65], fill=gold)
        draw.line([(cx - 25, cy + 65), (cx + 25, cy + 65)], fill=gold, width=3)

    elif symbol_type == "cosmic_rose":
        # Asteroide, estrella y rosa (Verne / Cyrano / Carroll)
        for sx, sy, srad in [(cx - 65, cy - 55, 12), (cx + 70, cy - 45, 15), (cx + 50, cy + 50, 10)]:
            draw.line([(sx - srad, sy), (sx + srad, sy)], fill=(255, 240, 180, 255), width=2)
            draw.line([(sx, sy - srad), (sx, sy + srad)], fill=(255, 240, 180, 255), width=2)
        draw.ellipse([cx - 60, cy + 10, cx + 60, cy + 85], outline=gold, fill=(35, 25, 55, 220), width=2)
        draw.line([(cx, cy + 15), (cx, cy - 25)], fill=(100, 200, 120, 255), width=3)
        draw.ellipse([cx - 18, cy - 50, cx + 18, cy - 20], outline=gold, fill=(230, 60, 80, 255), width=2)

    else:
        # Clásico Laurel y Lira (Pardo Bazán)
        draw.ellipse([cx - radius + 15, cy - radius + 15, cx + radius - 15, cy + radius - 15], outline=gold, width=2)
        draw.arc([cx - 35, cy - 35, cx + 35, cy + 45], 0, 180, fill=gold, width=3)
        draw.line([(cx - 35, cy - 35), (cx - 35, cy + 5)], fill=gold, width=3)
        draw.line([(cx + 35, cy - 35), (cx + 35, cy + 5)], fill=gold, width=3)
        draw.line([(cx - 40, cy - 35), (cx + 40, cy - 35)], fill=gold, width=4)
        for c_x in [-15, 0, 15]:
            draw.line([(cx + c_x, cy - 35), (cx + c_x, cy + 25)], fill=(gold[0], gold[1], gold[2], 180), width=2)


def wrap_text(text, font, max_width, draw):
    """Envuelve texto respetando el ancho máximo de píxeles."""
    words = text.split()
    lines = []
    current_line = []
    
    for word in words:
        current_line.append(word)
        test_line = " ".join(current_line)
        bbox = draw.textbbox((0, 0), test_line, font=font)
        w = bbox[2] - bbox[0]
        if w > max_width and len(current_line) > 1:
            current_line.pop()
            lines.append(" ".join(current_line))
            current_line = [word]
            
    if current_line:
        lines.append(" ".join(current_line))
    return lines


def generate_single_cover(book_info, output_path):
    """
    Genera una portada canónica 600x900 WebP para un libro específico.
    """
    title = book_info.get("title", "").strip()
    author = book_info.get("author", "Autor Desconocido").strip()
    symbol_type = book_info.get("symbol", "classic_lyre")
    
    palette = book_info.get("palette", {
        "top": (15, 23, 42),
        "mid": (30, 41, 59),
        "bottom": (10, 15, 30),
        "gold": (212, 175, 55),
        "glow": (255, 215, 0)
    })
    
    gold = palette.get("gold", (212, 175, 55))
    glow = palette.get("glow", (255, 215, 0))
    cream = (248, 246, 240)
    
    # 1. Fondo con degradado suave
    img = create_gradient(WIDTH, HEIGHT, palette["top"], palette["bottom"], palette.get("mid"))
    
    # 2. Resplandor radial para la ilustración
    art_center = (WIDTH // 2, 330)
    img = add_radial_vignette(img, art_center, 210, glow, alpha_max=90)
    
    # 3. Textura y estrellas
    img = add_texture_and_stars(img, num_dots=100, seed=abs(hash(title)) % 10000)
    
    # 4. Marco editorial exterior e interior
    img = draw_editorial_frame(img, gold_color=gold)
    
    draw = ImageDraw.Draw(img)
    
    # --- CABECERA BRANDING (L I T E R A T U S) ---
    brand_font = get_font(FONT_BRAND, 18)
    brand_text = "L I T E R A T U S"
    bbox = draw.textbbox((0, 0), brand_text, font=brand_font)
    bw = bbox[2] - bbox[0]
    bx = (WIDTH - bw) // 2
    by = 54
    draw.text((bx, by), brand_text, fill=gold, font=brand_font)
    
    # Rombos ornamentales a los costados de LITERATUS
    draw_diamond(draw, bx - 22, by + 11, 4, gold)
    draw_diamond(draw, bx + bw + 22, by + 11, 4, gold)
    
    # Línea decorativa bajo marca
    draw.line([(WIDTH // 2 - 120, 82), (WIDTH // 2 + 120, 82)], fill=(gold[0], gold[1], gold[2], 160), width=1)
    draw_diamond(draw, WIDTH // 2, 82, 3, gold)
    
    # --- MEDALLÓN CENTRAL ILUSTRATIVO ---
    art_radius = 120
    draw.ellipse([art_center[0] - art_radius, art_center[1] - art_radius, art_center[0] + art_radius, art_center[1] + art_radius], outline=(gold[0], gold[1], gold[2], 180), fill=(palette["top"][0]//2, palette["top"][1]//2, palette["top"][2]//2, 160), width=2)
    draw.ellipse([art_center[0] - art_radius + 6, art_center[1] - art_radius + 6, art_center[0] + art_radius - 6, art_center[1] + art_radius - 6], outline=(gold[0], gold[1], gold[2], 80), width=1)
    
    # Dibujar símbolo ilustrativo
    draw_illustration_symbol(draw, symbol_type, art_center[0], art_center[1], art_radius, palette["top"], gold)
    
    # --- PLACA EDITORIAL / ZONA DE TÍTULO Y AUTOR ---
    plaque_top = 495
    
    draw.line([(60, plaque_top), (WIDTH - 60, plaque_top)], fill=(gold[0], gold[1], gold[2], 180), width=1)
    draw_diamond(draw, WIDTH // 2, plaque_top, 4, gold)
    
    # Cálculo dinámico de tamaño de fuente del título
    max_title_width = 460
    title_font_size = 38
    if len(title) > 30:
        title_font_size = 32
    if len(title) > 50:
        title_font_size = 27
    if len(title) > 70:
        title_font_size = 23
        
    title_font = get_font(FONT_TITLE, title_font_size)
    lines = wrap_text(title, title_font, max_title_width, draw)
    
    if len(lines) > 3 and title_font_size > 24:
        title_font_size = 24
        title_font = get_font(FONT_TITLE, title_font_size)
        lines = wrap_text(title, title_font, max_title_width, draw)
        
    line_spacing = int(title_font_size * 1.25)
    total_title_h = len(lines) * line_spacing
    title_start_y = plaque_top + 40 + (120 - total_title_h) // 2
    if title_start_y < plaque_top + 25:
        title_start_y = plaque_top + 25
        
    for i, line in enumerate(lines):
        t_bbox = draw.textbbox((0, 0), line, font=title_font)
        tw = t_bbox[2] - t_bbox[0]
        tx = (WIDTH - tw) // 2
        ty = title_start_y + (i * line_spacing)
        
        draw.text((tx + 2, ty + 2), line, fill=(5, 5, 10, 230), font=title_font)
        draw.text((tx, ty), line, fill=cream, font=title_font)
        
    sep_y = title_start_y + total_title_h + 20
    draw.line([(WIDTH // 2 - 60, sep_y), (WIDTH // 2 + 60, sep_y)], fill=(gold[0], gold[1], gold[2], 140), width=1)
    draw_diamond(draw, WIDTH // 2, sep_y, 3, gold)
    
    author_font_size = 24
    if len(author) > 35:
        author_font_size = 20
    author_font = get_font(FONT_AUTHOR_BOLD, author_font_size)
    
    a_bbox = draw.textbbox((0, 0), author, font=author_font)
    aw = a_bbox[2] - a_bbox[0]
    ax = (WIDTH - aw) // 2
    ay = sep_y + 22
    
    draw.text((ax + 1, ay + 1), author, fill=(10, 10, 15, 200), font=author_font)
    draw.text((ax, ay), author, fill=(gold[0], gold[1], gold[2], 255), font=author_font)
    
    # Footer de Colección
    footer_font = get_font(FONT_LABEL, 12)
    footer_text = "COLECCIÓN CLÁSICA  ·  EDICIÓN ILUSTRADA"
    f_bbox = draw.textbbox((0, 0), footer_text, font=footer_font)
    fw = f_bbox[2] - f_bbox[0]
    draw.text(((WIDTH - fw) // 2, HEIGHT - 52), footer_text, fill=(gold[0], gold[1], gold[2], 180), font=footer_font)
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    rgb_img = img.convert("RGB")
    rgb_img.save(output_path, "WEBP", quality=90, method=6)
    
    size_kb = os.path.getsize(output_path) / 1024
    return size_kb


# Catálogo Maestro Curado para los 27 Libros
CATALOG_DEFINITIONS = {
    "el-principe-feliz": {
        "title": "El Príncipe Feliz",
        "author": "Oscar Wilde",
        "symbol": "crown_swallow",
        "palette": {
            "top": (12, 45, 60),
            "mid": (20, 70, 85),
            "bottom": (8, 25, 38),
            "gold": (235, 195, 75),
            "glow": (255, 220, 100)
        }
    },
    "la-metamorfosis-kafka-franz": {
        "title": "La metamorfosis",
        "author": "Franz Kafka",
        "symbol": "scarab_maze",
        "palette": {
            "top": (35, 15, 20),
            "mid": (55, 25, 30),
            "bottom": (20, 8, 12),
            "gold": (215, 160, 60),
            "glow": (220, 140, 60)
        }
    },
    "hamlet-shakespeare-william": {
        "title": "Hamlet",
        "author": "William Shakespeare",
        "symbol": "skull_dagger",
        "palette": {
            "top": (15, 20, 38),
            "mid": (25, 35, 60),
            "bottom": (10, 12, 25),
            "gold": (220, 180, 70),
            "glow": (190, 170, 240)
        }
    },
    "fedon-platon": {
        "title": "Fedón, o sobre el alma",
        "author": "Platón",
        "symbol": "greek_pillar_psyche",
        "palette": {
            "top": (15, 35, 45),
            "mid": (28, 60, 75),
            "bottom": (10, 22, 30),
            "gold": (225, 185, 80),
            "glow": (240, 210, 140)
        }
    },
    "historia-de-los-grandes-viajes-y-los-grandes-viajeros-verne-julio": {
        "title": "Historia de los grandes viajes y de los grandes viajeros",
        "author": "Julio Verne",
        "symbol": "compass_caravel",
        "palette": {
            "top": (40, 28, 15),
            "mid": (70, 48, 25),
            "bottom": (25, 16, 8),
            "gold": (235, 190, 80),
            "glow": (255, 210, 120)
        }
    },
    "el-talento-anton-chejov": {
        "title": "El talento",
        "author": "Antón Chéjov",
        "symbol": "quill_manuscript",
        "palette": {
            "top": (25, 30, 45),
            "mid": (40, 50, 70),
            "bottom": (15, 18, 30),
            "gold": (225, 180, 75),
            "glow": (245, 215, 130)
        }
    },
    "el-tragico-anton-chejov": {
        "title": "El trágico",
        "author": "Antón Chéjov",
        "symbol": "theater_masks",
        "palette": {
            "top": (40, 18, 25),
            "mid": (65, 28, 40),
            "bottom": (22, 10, 15),
            "gold": (230, 175, 70),
            "glow": (245, 195, 110)
        }
    },
    "fabula-de-polifemo-y-galatea-luis-de-gongora": {
        "title": "Fábula de Polifemo y Galatea",
        "author": "Luis de Góngora",
        "symbol": "greek_pillar_psyche",
        "palette": {
            "top": (12, 40, 32),
            "mid": (20, 65, 52),
            "bottom": (8, 24, 18),
            "gold": (235, 190, 75),
            "glow": (210, 240, 160)
        }
    },
    "fabulas-esopo": {
        "title": "Fábulas",
        "author": "Esopo",
        "symbol": "fable_animals",
        "palette": {
            "top": (25, 38, 22),
            "mid": (42, 62, 35),
            "bottom": (14, 22, 12),
            "gold": (230, 185, 75),
            "glow": (240, 225, 130)
        }
    },
    "fabulas-literarias-tomas-de-iriarte": {
        "title": "Fábulas literarias",
        "author": "Tomás de Iriarte",
        "symbol": "fable_animals",
        "palette": {
            "top": (38, 32, 20),
            "mid": (62, 52, 32),
            "bottom": (20, 16, 10),
            "gold": (225, 180, 70),
            "glow": (240, 210, 120)
        }
    },
    "fantasmagoria-carroll-lewis": {
        "title": "Fantasmagoría",
        "author": "Lewis Carroll",
        "symbol": "cosmic_rose",
        "palette": {
            "top": (28, 16, 42),
            "mid": (48, 28, 70),
            "bottom": (16, 8, 25),
            "gold": (220, 175, 80),
            "glow": (210, 170, 250)
        }
    },
    "fatum-e-historia-friedrich-nietzsche": {
        "title": "Fatum e historia",
        "author": "Friedrich Nietzsche",
        "symbol": "greek_pillar_psyche",
        "palette": {
            "top": (24, 24, 28),
            "mid": (42, 42, 48),
            "bottom": (12, 12, 16),
            "gold": (220, 165, 65),
            "glow": (230, 185, 110)
        }
    },
    "feathertop-nathaniel-hawthorne": {
        "title": "Feathertop",
        "author": "Nathaniel Hawthorne",
        "symbol": "victorian_lantern",
        "palette": {
            "top": (42, 24, 15),
            "mid": (68, 38, 22),
            "bottom": (22, 12, 8),
            "gold": (230, 180, 70),
            "glow": (250, 205, 110)
        }
    },
    "felicidad-katherine-mansfield": {
        "title": "Felicidad",
        "author": "Katherine Mansfield",
        "symbol": "garden_bloom",
        "palette": {
            "top": (32, 22, 45),
            "mid": (55, 36, 75),
            "bottom": (18, 12, 26),
            "gold": (235, 190, 85),
            "glow": (250, 215, 160)
        }
    },
    "fernando-de-magallanes-zweig-stefan": {
        "title": "Fernando de Magallanes",
        "author": "Stefan Zweig",
        "symbol": "compass_caravel",
        "palette": {
            "top": (14, 28, 48),
            "mid": (22, 45, 78),
            "bottom": (8, 16, 28),
            "gold": (230, 185, 75),
            "glow": (200, 220, 255)
        }
    },
    "fiesta-en-el-jardin-katherine-mansfield": {
        "title": "Fiesta en el jardín",
        "author": "Katherine Mansfield",
        "symbol": "garden_bloom",
        "palette": {
            "top": (15, 42, 40),
            "mid": (25, 68, 65),
            "bottom": (8, 24, 22),
            "gold": (235, 195, 80),
            "glow": (210, 245, 200)
        }
    },
    "filoctetes-sofocles": {
        "title": "Filoctetes",
        "author": "Sófocles",
        "symbol": "theater_masks",
        "palette": {
            "top": (42, 22, 16),
            "mid": (70, 36, 24),
            "bottom": (22, 10, 8),
            "gold": (235, 180, 70),
            "glow": (250, 200, 120)
        }
    },
    "flavio-rosalia-de-castro": {
        "title": "Flavio",
        "author": "Rosalía de Castro",
        "symbol": "garden_bloom",
        "palette": {
            "top": (22, 38, 30),
            "mid": (36, 62, 48),
            "bottom": (12, 22, 16),
            "gold": (225, 180, 75),
            "glow": (220, 240, 180)
        }
    },
    "flores-de-almendro-ramon-maria-del-valle-inclan": {
        "title": "Flores de almendro",
        "author": "Ramón María del Valle-Inclán",
        "symbol": "garden_bloom",
        "palette": {
            "top": (38, 18, 32),
            "mid": (64, 30, 52),
            "bottom": (20, 8, 16),
            "gold": (230, 185, 80),
            "glow": (250, 190, 210)
        }
    },
    "follas-novas-rosalia-de-castro": {
        "title": "Follas novas",
        "author": "Rosalía de Castro",
        "symbol": "garden_bloom",
        "palette": {
            "top": (16, 36, 28),
            "mid": (28, 58, 45),
            "bottom": (10, 20, 16),
            "gold": (225, 185, 75),
            "glow": (190, 235, 190)
        }
    },
    "fortunata-y-jacinta-benito-perez-galdos": {
        "title": "Fortunata y Jacinta",
        "author": "Benito Pérez Galdós",
        "symbol": "victorian_lantern",
        "palette": {
            "top": (44, 24, 18),
            "mid": (72, 38, 28),
            "bottom": (24, 12, 8),
            "gold": (235, 185, 70),
            "glow": (255, 215, 130)
        }
    },
    "fraternidad-pardo-bazan-emilia": {
        "title": "Fraternidad",
        "author": "Emilia Pardo Bazán",
        "symbol": "classic_lyre",
        "palette": {
            "top": (42, 16, 22),
            "mid": (68, 26, 36),
            "bottom": (22, 8, 12),
            "gold": (230, 180, 75),
            "glow": (245, 180, 180)
        }
    },
    "georgicas-virgilio": {
        "title": "Geórgicas",
        "author": "Virgilio",
        "symbol": "fable_animals",
        "palette": {
            "top": (36, 30, 16),
            "mid": (62, 50, 26),
            "bottom": (18, 14, 8),
            "gold": (235, 190, 75),
            "glow": (250, 225, 130)
        }
    },
    "gramatica-castellana-antonio-de-nebrija": {
        "title": "Gramática castellana",
        "author": "Antonio de Nebrija",
        "symbol": "quill_manuscript",
        "palette": {
            "top": (38, 28, 18),
            "mid": (64, 46, 28),
            "bottom": (20, 14, 8),
            "gold": (235, 190, 75),
            "glow": (255, 220, 130)
        }
    },
    "hector-servadac-verne-julio": {
        "title": "Héctor Servadac",
        "author": "Julio Verne",
        "symbol": "cosmic_rose",
        "palette": {
            "top": (14, 22, 46),
            "mid": (24, 38, 76),
            "bottom": (8, 12, 26),
            "gold": (230, 185, 75),
            "glow": (210, 220, 255)
        }
    },
    "historia-comica-de-los-estados-e-imperios-del-sol-cyrano-de-bergerac": {
        "title": "Historia cómica de los Estados e Imperios del Sol",
        "author": "Cyrano de Bergerac",
        "symbol": "cosmic_rose",
        "palette": {
            "top": (44, 30, 12),
            "mid": (74, 50, 18),
            "bottom": (24, 16, 6),
            "gold": (240, 195, 70),
            "glow": (255, 225, 110)
        }
    },
    "la-quimera-pardo-bazan-emilia": {
        "title": "La Quimera",
        "author": "Emilia Pardo Bazán",
        "symbol": "classic_lyre",
        "palette": {
            "top": (34, 20, 38),
            "mid": (58, 32, 64),
            "bottom": (18, 10, 20),
            "gold": (225, 180, 75),
            "glow": (235, 185, 220)
        }
    }
}


def process_all_library():
    """Procesa y sincroniza los 27 libros de la base de datos de Django."""
    import sys
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    sys.path.insert(0, r"c:\Users\guerr\Downloads\LiteratusNovelist\respaldos-software\LiteratusNovelist-main\Producto\backend")
    import django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()
    from catalog.models import Book, Author, BookAuthor

    media_root = r"c:\Users\guerr\Downloads\LiteratusNovelist\respaldos-software\LiteratusNovelist-main\Producto\backend\media"
    
    print("=" * 70)
    print("PROCESANDO BIBLIOTECA COMPLETA — GENERACION Y SINCRONIZACION")
    print("=" * 70)
    
    processed = 0
    updated_db = 0
    
    for book in Book.objects.all().order_by('slug'):
        slug = book.slug
        config = CATALOG_DEFINITIONS.get(slug)
        
        if config:
            canonical_title = config["title"]
            canonical_author = config["author"]
            symbol = config["symbol"]
            palette = config["palette"]
        else:
            canonical_title = book.title
            canonical_author = ', '.join([a.full_name for a in book.authors.all()]) or "Autor Desconocido"
            symbol = "classic_lyre"
            palette = {
                "top": (20, 28, 45),
                "mid": (35, 48, 75),
                "bottom": (10, 15, 25),
                "gold": (225, 185, 75),
                "glow": (240, 210, 130)
            }
            
        # Actualizar título si era temporal o malformado
        if book.title != canonical_title:
            print(f"[METADATA] Actualizando titulo: '{book.title}' -> '{canonical_title}'")
            book.title = canonical_title
            
        # Actualizar autor si era 'Unknown' o 'Autor Desconocido'
        current_authors = [a.full_name for a in book.authors.all()]
        if canonical_author not in current_authors and canonical_author != "Autor Desconocido":
            author_obj, _ = Author.objects.get_or_create(full_name=canonical_author)
            # Reemplazar o asignar autor principal
            BookAuthor.objects.filter(book=book).delete()
            BookAuthor.objects.create(book=book, author=author_obj, role=BookAuthor.RoleChoices.PRIMARY)
            print(f"[METADATA] Actualizando autor: {current_authors} -> '{canonical_author}'")
            
        # Ruta de guardado uniforme
        rel_cover_path = f"books/{slug}/cover.webp"
        abs_cover_path = os.path.join(media_root, "books", slug, "cover.webp")
        
        # Generar portada
        book_info = {
            "title": canonical_title,
            "author": canonical_author,
            "symbol": symbol,
            "palette": palette
        }
        size_kb = generate_single_cover(book_info, abs_cover_path)
        
        # Sincronizar referencia en base de datos
        book.cover_image = rel_cover_path
        book.save()
        
        processed += 1
        updated_db += 1
        print(f"[{processed:2d}/27] OK: {canonical_title} ({canonical_author})")
        print(f"       -> Ruta: {rel_cover_path} | Tamano: {size_kb:.1f} KB (600x900 WebP)")

    print("=" * 70)
    print(f"PROCESO FINALIZADO EXITOSAMENTE: {processed} portadas generadas y sincronizadas en DB.")
    print("=" * 70)

if __name__ == "__main__":
    process_all_library()
