import os
import sys
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from ai_engine.models import AIAvatar
from catalog.models import Book, Edition

def seed():
    json_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "metamorfosis_manga.json")
    with open(json_path, 'r', encoding='utf-8') as f:
        chars = json.load(f)
        
    book = Book.objects.filter(title__icontains="Metamorfosis").first()
    if not book:
        print("No se encontró el libro La Metamorfosis.")
        return
        
    edition = Edition.objects.filter(book=book).first()
    if not edition:
        print("No se encontró edición para La Metamorfosis.")
        return
        
    for c in chars:
        avatar, created = AIAvatar.objects.update_or_create(
            name=c['name'],
            edition=edition,
            defaults={
                'is_author': False,
                'is_major_character': True,
                'system_prompt': c['base_prompt'],
                'behavioral_context': "Generado automáticamente para manga_assets",
                'greeting_message': f"Hola, soy {c['name']}.",
                'avatar_image': f"manga_assets/{c['id']}/neutral.webp",
                'is_active': True
            }
        )
        status = "Creado" if created else "Actualizado"
        print(f"{status}: {c['name']}")

if __name__ == "__main__":
    seed()
