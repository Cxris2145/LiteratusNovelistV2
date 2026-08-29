import os
import sys
import json
import uuid

# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from ai_engine.models import AIAvatar
from catalog.models import Book, Edition

def seed_avatars_from_json():
    json_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "json_data", "manga_frames_generation.json")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        characters = json.load(f)
        
    print(f"Encontrados {len(characters)} personajes en JSON.")
    
    created_count = 0
    updated_count = 0
    
    for char in characters:
        char_id = char['id']
        name = char['name']
        book_title = char['book']
        description = char.get('description', '')
        
        # Buscar el libro (por nombre similar)
        # Algunos titulos pueden no ser exactos, hacemos un icontains
        book = Book.objects.filter(title__icontains=book_title[:15]).first()
        if not book:
            print(f"[SKIP] Libro no encontrado para: {name} (Buscando: {book_title})")
            continue
            
        # Obtener la edicion principal
        edition = Edition.objects.filter(book=book).first()
        if not edition:
            print(f"[SKIP] Libro sin edicion: {book.title}")
            continue
            
        # Generar un system prompt básico basado en la descripción
        system_prompt = f"Eres {name}, un personaje del libro '{book_title}'. {description} Responde siempre manteniendo esta personalidad y época."
        behavioral_context = description
        greeting = f"Hola, soy {name}. ¿Qué deseas saber sobre mi historia?"
        
        # La ruta en supabase para el avatar es manga_assets/{char_id}/calm.webp
        image_path = f"manga_assets/{char_id}/calm.webp"
        
        avatar, created = AIAvatar.objects.update_or_create(
            id=char_id,
            defaults={
                'name': name,
                'edition': edition,
                'is_author': False,
                'is_major_character': True,
                'system_prompt': system_prompt,
                'behavioral_context': behavioral_context,
                'greeting_message': greeting,
                'avatar_image': image_path,
                'is_active': True
            }
        )
        if created:
            created_count += 1
        else:
            updated_count += 1
            
    print(f"Proceso finalizado. Creados: {created_count}, Actualizados: {updated_count}")

if __name__ == "__main__":
    seed_avatars_from_json()
