import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import json
import re
from pathlib import Path

# Configurar entorno Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book

def get_visual_keywords(title):
    """Genera palabras clave visuales basadas en el titulo para ayudar a la IA."""
    title = title.lower()
    keywords = []
    
    if "principito" in title: keywords = ["little prince", "blonde boy", "small asteroid", "rose", "stars"]
    elif "quijote" in title: keywords = ["old knight", "armor", "windmills", "don quixote", "spanish landscape"]
    elif "mar" in title or "oceano" in title: keywords = ["ocean waves", "nautical", "deep blue sea"]
    elif "misterio" in title or "muerte" in title: keywords = ["dark atmosphere", "noir", "shadows", "mystery"]
    elif "amor" in title or "madre" in title: keywords = ["soft lighting", "emotive", "roses", "warm colors"]
    elif "guerra" in title: keywords = ["epic", "battlefield", "smoke", "historical"]
    
    return ", ".join(keywords)

def main():
    books = Book.objects.all()
    tasks = []
    
    print("--- 🧠 GENERANDO PROMPTS DE ALTA PRECISION ---")
    
    for book in books:
        author = book.authors.first()
        author_name = author.full_name if author else ""
        
        # Palabras clave segun el titulo
        v_keywords = get_visual_keywords(book.title)
        
        # PROMPT "ANTI-TEXTO": No mencionamos libro, ni autor, ni diseño.
        # Solo describimos una pintura.
        prompt = (
            f"A magnificent oil painting on canvas of: {v_keywords if v_keywords else book.title}. "
            f"Atmospheric masterpiece, cinematic lighting, vibrant textures, high detail, "
            f"fine art gallery style. ABSTRACT AND ARTISTIC. "
            f"STRICTLY NO TEXT, NO LETTERS, NO NUMBERS, NO WORDS, NO TYPOGRAPHY."
        )
        
        tasks.append({
            "slug": book.slug,
            "title": book.title,
            "author": author_name,
            "prompt": prompt
        })
    
    with open("books_to_generate.json", "w", encoding="utf-8") as f:
        json.dump(tasks, f, indent=4, ensure_ascii=False)
        
    print(f"✅ Se han preparado {len(tasks)} prompts de alta precisión.")

if __name__ == "__main__":
    main()
