"""
test_samples.py — Generación y verificación de 5 portadas de muestra
"""
import sys
import os

sys.path.insert(0, r"c:\Users\guerr\Downloads\LiteratusNovelist\respaldos-software\Automatizaciones")
from generate_covers import generate_single_cover
from PIL import Image

samples = [
    {
        "slug": "el-principe-feliz",
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
    {
        "slug": "la-metamorfosis-kafka-franz",
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
    {
        "slug": "hamlet-shakespeare-william",
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
    {
        "slug": "fedon-platon",
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
    {
        "slug": "historia-de-los-grandes-viajes-y-los-grandes-viajeros-verne-julio",
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
    }
]

out_dir = r"c:\Users\guerr\Downloads\LiteratusNovelist\respaldos-software\LiteratusNovelist-main\Producto\backend\media\sample_covers"
os.makedirs(out_dir, exist_ok=True)

print("=== GENERATING 5 SAMPLE COVERS ===")
for s in samples:
    slug = s["slug"]
    title = s["title"]
    out_file = os.path.join(out_dir, f"{slug}.webp")
    size_kb = generate_single_cover(s, out_file)
    with Image.open(out_file) as img:
        print(f"OK: '{title}' -> Dims: {img.size[0]}x{img.size[1]} | Format: {img.format} | Size: {size_kb:.1f} KB | Path: {out_file}")
