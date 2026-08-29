# retry_failed_characters.py
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import os
import json
import time
import requests

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book
from ai_engine.models import AIAvatar
from django.conf import settings

DEEPSEEK_API_KEY = settings.DEEPSEEK_API_KEY
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

def call_deepseek(prompt_text):
    headers = {"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "Eres un experto literario. Responde en JSON puro, sin markdown."},
            {"role": "user", "content": prompt_text}
        ],
        "temperature": 0.7,
        "max_tokens": 4000,
    }
    try:
        # Aumentamos el timeout a 90 segundos para libros pesados como La Ilíada
        resp = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=90)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        
        # Limpieza básica de markdown si la IA ignora la instrucción de "pure JSON"
        if "```json" in content: content = content.split("```json")[1].split("```")[0]
        elif "```" in content: content = content.split("```")[1].split("```")[0]
        
        return json.loads(content)
    except Exception as e:
        print(f"  ⚠️ Error en la llamada: {e}")
        return None

def main():
    # Buscamos solo los libros que NO tienen ningún personaje creado aún
    books_missing = []
    all_books = Book.objects.all()
    for b in all_books:
        if not AIAvatar.objects.filter(edition__book=b).exists():
            books_missing.append(b)
            
    if not books_missing:
        print("✅ No hay libros pendientes. ¡Todo completo!")
        return

    print(f"🔄 Reintentando extracción para {len(books_missing)} libros faltantes con timeout extendido...\n")
    
    # Cargamos el progreso actual del JSON de imágenes
    visual_tasks = []
    if os.path.exists('json_data/characters_to_generate.json'):
        with open('json_data/characters_to_generate.json', 'r', encoding='utf-8') as f:
            try:
                visual_tasks = json.load(f)
            except:
                visual_tasks = []

    for book in books_missing:
        print(f"📖 Procesando: {book.title}...")
        edition = book.editions.first()
        if not edition:
            print(f"  ⏩ Saltado: El libro no tiene ediciones asociadas.")
            continue
        
        prompt = f"""Analiza la obra "{book.title}".
Sinopsis: {book.synopsis if book.synopsis else "No disponible"}

Identifica a los 3 personajes más icónicos. Para cada uno, genera un JSON con:
- name: Nombre.
- description: Rol breve.
- system_prompt: Personalidad detallada (1ra persona).
- behavioral_context: Miedos/deseos.
- sample_dialogues: Estilo de habla.
- greeting_message: Saludo.
- visual_prompt: Descripción física detallada para Stable Diffusion en INGLÉS.

Responde una lista JSON: [{{...}}, {{...}}, {{...}}]"""

        res = call_deepseek(prompt)
        
        if res and isinstance(res, list):
            for char in res:
                new_avatar = AIAvatar.objects.create(
                    edition=edition,
                    name=char.get('name', 'Desconocido')[:250],
                    description=char.get('description', ''),
                    system_prompt=char.get('system_prompt', 'Hola'),
                    behavioral_context=char.get('behavioral_context', ''),
                    sample_dialogues=char.get('sample_dialogues', ''),
                    greeting_message=char.get('greeting_message', 'Hola.'),
                )
                
                visual_tasks.append({
                    "id": str(new_avatar.id),
                    "name": new_avatar.name,
                    "book": book.title,
                    "prompt": char.get('visual_prompt', f"Portrait of {new_avatar.name}")
                })
                print(f"  ✨ Personaje creado: {new_avatar.name}")
            
            # Guardamos progreso en cada libro para no perder nada
            with open('json_data/characters_to_generate.json', 'w', encoding='utf-8') as f:
                json.dump(visual_tasks, f, indent=2, ensure_ascii=False)
            
            print(f"  ✅ {book.title} completado.\n")
        else:
            print(f"  ❌ Falló de nuevo. Puede que la sinopsis sea demasiado compleja.\n")
            
        time.sleep(2) # Respeto a la API

    print("\n🎉 Proceso de recuperación terminado.")

if __name__ == "__main__":
    main()
