import os
import django
import json
from django.utils.text import slugify
import unicodedata

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from ai_engine.models import AIAvatar

# Mapa de normalización de nombres para evitar duplicados en la DB
NORMALIZATION_MAP = {
    "miguel de cervantes saavedra": "Miguel de Cervantes",
    "jules verne": "Julio Verne",
    "julio verne": "Julio Verne",
    "b. perez galdos": "Benito Pérez Galdós",
    "benito perez galdos": "Benito Pérez Galdós",
    "lucio anneo seneca": "Séneca",
    "seneca": "Séneca",
    "william shakespear": "William Shakespeare",
    "w. shakespeare": "William Shakespeare",
    "f. dostoievski": "Fiódor Dostoyevski",
    "fiodor dostoievski": "Fiódor Dostoyevski",
    "fiodor dostoyevski": "Fiódor Dostoyevski",
    "edgar a. poe": "Edgar Allan Poe",
    "anonimo": "Anónimo"
}

def normalize_name(raw_name):
    """
    Intenta normalizar el nombre. Elimina acentos para comparar contra el mapa.
    """
    clean_name = raw_name.strip()
    
    # Quitar acentos para la comparación en el mapa
    ascii_name = ''.join(c for c in unicodedata.normalize('NFD', clean_name.lower())
                  if unicodedata.category(c) != 'Mn')
                  
    if ascii_name in NORMALIZATION_MAP:
        return NORMALIZATION_MAP[ascii_name]
        
    # Si detectamos que un nombre largo contiene a uno corto famoso,
    # podríamos aplicar reglas más agresivas aquí. Por ahora, devolvemos el limpio.
    return clean_name

def generate_avatar_prompts():
    unique_names = set()
    authors = []
    characters = []

    avatars = AIAvatar.objects.values('name', 'is_author')
    for avatar in avatars:
        # Aplicamos la normalización
        normalized = normalize_name(avatar['name'])
        
        if normalized not in unique_names:
            unique_names.add(normalized)
            
            base_prompt = f"portrait of {normalized}, highly detailed, elegant, "
            if avatar['is_author']:
                base_prompt += "classic writer, distinguished author, historical figure, "
            else:
                base_prompt += "fictional character, book protagonist, "
                
            base_prompt += "anime style illustration, studio ghibli inspired, masterpiece, 8k resolution, vibrant colors"
            
            filename = f"{slugify(normalized)}.webp"
            
            data = {
                "name": normalized,
                "is_author": avatar['is_author'],
                "filename": filename,
                "prompt": base_prompt
            }
            
            if avatar['is_author']:
                authors.append(data)
            else:
                characters.append(data)
            
    with open('author_prompts.json', 'w', encoding='utf-8') as f:
        json.dump(authors, f, indent=4, ensure_ascii=False)
        
    with open('character_prompts.json', 'w', encoding='utf-8') as f:
        json.dump(characters, f, indent=4, ensure_ascii=False)
        
    print(f"Generated {len(authors)} unique author prompts in author_prompts.json")
    print(f"Generated {len(characters)} character prompts in character_prompts.json")

if __name__ == '__main__':
    generate_avatar_prompts()
