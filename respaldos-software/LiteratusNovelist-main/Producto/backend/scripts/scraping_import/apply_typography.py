import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import json
import requests
import random
import traceback
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageStat

# Configurar entorno Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book

LOG_FILE = "errores_portadas.txt"
FONT_DIR = Path("fonts")

# LIBRERÍA DE ESTILOS CALIBRADA
COVER_STYLES_LIBRARY = {
    "Classic_Gold": {
        "fonts": {"title": "Cinzel-Bold.ttf", "author": "EBGaramond-Italic.ttf"},
        "colors": {"title": (251, 191, 36, 255), "author": (245, 245, 220, 220)},
        "treatment": "upper", "base_size": 85, "spacing": 1.2
    },
    "Modern_Clean": {
        "fonts": {"title": "Montserrat-Bold.ttf", "author": "Montserrat-Light.ttf"},
        "colors": {"title": (255, 255, 255, 255), "author": (0, 255, 255, 220)},
        "treatment": "upper", "base_size": 80, "spacing": 1.1
    },
    "Elegant_Serif": {
        "fonts": {"title": "PlayfairDisplay-Black.ttf", "author": "PlayfairDisplay-Italic.ttf"},
        "colors": {"title": (255, 255, 255, 255), "author": (220, 220, 220, 200)},
        "treatment": "capitalize", "base_size": 95, "spacing": 1.1
    }
}

def log_error(slug, message, detail=None):
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"--- ERROR EN: {slug} ---\n{message}\n{detail if detail else ''}\n\n")

def get_font_safe(name, size):
    path = FONT_DIR / name
    try:
        if path.exists() and path.stat().st_size > 1000:
            return ImageFont.truetype(str(path), size)
    except: pass
    try: return ImageFont.truetype("arial.ttf", size)
    except: return ImageFont.load_default()

def apply_adaptive_design(image_path, title, author, output_path):
    img = Image.open(image_path).convert("RGBA")
    img = img.resize((800, 800), Image.Resampling.LANCZOS)
    w, h = img.size
    
    style = COVER_STYLES_LIBRARY[random.choice(list(COVER_STYLES_LIBRARY.keys()))]
    
    # Análisis de brillo mejorado
    gray = img.convert("L")
    top_score = ImageStat.Stat(gray.crop((0, 0, w, int(h*0.35)))).mean[0]
    bot_score = ImageStat.Stat(gray.crop((0, int(h*0.65), w, h))).mean[0]
    pos = "bottom" if bot_score < top_score else "top"
    
    txt_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(txt_layer)
    
    title_str = title.upper() if style['treatment'] == "upper" else title.title()
    title_str = title_str.replace("\n", " ").strip()

    # AJUSTE DINÁMICO DE TAMAÑO Y LÍNEAS
    font_size = style['base_size']
    max_text_width = w * 0.85 # Margen de seguridad del 15%
    
    # Bucle para encontrar el tamaño ideal
    while font_size > 20:
        t_font = get_font_safe(style['fonts']['title'], font_size)
        # Calcular cuantas letras caben por linea a este tamaño
        avg_char_w = draw.textlength("W", font=t_font)
        chars_per_line = max(8, int(max_text_width / avg_char_w * 1.2))
        lines = textwrap.wrap(title_str, width=chars_per_line)
        
        # Verificar si el bloque de texto es demasiado alto
        total_h = len(lines) * (font_size * style['spacing'])
        if total_h < h * 0.35: # No queremos que ocupe mas del 35% de la imagen
            break
        font_size -= 5

    # Dibujar degradado
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ov_draw = ImageDraw.Draw(overlay)
    
    if pos == "bottom":
        y_cursor = h - total_h - 100
        for i in range(int(h*0.5), h):
            ov_draw.line([(0, i), (w, i)], fill=(0, 0, 0, int((i-h*0.5)/(h*0.5)*230)))
    else:
        y_cursor = 80
        for i in range(0, int(h*0.5)):
            ov_draw.line([(0, i), (w, i)], fill=(0, 0, 0, int((1-i/(h*0.5))*230)))

    # Dibujar líneas de título
    for line in lines:
        tw = draw.textlength(line, font=t_font)
        draw.text(((w - tw) / 2, y_cursor), line, fill=style['colors']['title'], font=t_font)
        y_cursor += font_size * style['spacing']

    # Dibujar autor
    a_font = get_font_safe(style['fonts']['author'], 35)
    aw = draw.textlength(author, font=a_font)
    ay = h - 70 if pos == "bottom" else y_cursor + 20
    draw.text(((w - aw) / 2, ay), author, fill=style['colors']['author'], font=a_font)

    final = Image.alpha_composite(img, overlay)
    final = Image.alpha_composite(final, txt_layer)
    final.convert("RGB").save(output_path, "JPEG", quality=95)

def main():
    source_folder = Path("covers_descargadas/covers_finales")
    final_media_base = Path("media/books")
    
    with open("books_to_generate.json", "r", encoding="utf-8") as f:
        tasks = json.load(f)

    print(f"--- ⚖️ CALIBRANDO PORTADAS: MODO EQUILIBRIO PREMIUM ---")
    for i, task in enumerate(tasks):
        img_path = source_folder / f"{task['slug']}.jpg"
        if img_path.exists():
            dest_dir = final_media_base / task['slug']
            dest_dir.mkdir(parents=True, exist_ok=True)
            output_file = dest_dir / "cover.jpg"
            try:
                apply_adaptive_design(img_path, task['title'], task['author'], output_file)
                if i % 50 == 0: print(f"⚖️ [{i}/{len(tasks)}] {task['slug']} calibrado.")
            except Exception:
                log_error(task['slug'], "Error en calibracion", traceback.format_exc())

if __name__ == "__main__":
    main()
