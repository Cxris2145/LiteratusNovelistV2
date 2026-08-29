"""
auto_discover_characters.py (Versión Premium)
Identifica personajes, extrae su personalidad basada en la obra 
y genera prompts visuales, todo en un solo paso.
"""
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

def call_deepseek(prompt_text: str) -> dict | None:
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "Eres un experto literario y psicólogo de personajes. Tu misión es dar vida a personajes de libros. Responde en JSON."},
            {"role": "user", "content": prompt_text}
        ],
        "temperature": 0.7,
        "max_tokens": 6000,
    }
    try:
        resp = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=45)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        return json.loads(content)
    except Exception as e:
        print(f"  ⚠️ Error API: {e}")
        return None

def build_discovery_prompt(book) -> str:
    return f"""Analiza la obra "{book.title}".
Sinopsis: {book.synopsis if book.synopsis else "No disponible"}

Identifica a TODOS los personajes importantes de la obra (como mínimo 3, pero incluye a todos los que sean verdaderamente relevantes: protagonistas, antagonistas, mentores, villanos, intereses amorosos, etc.).
Para cada uno, genera un JSON con:
- name: Nombre del personaje.
- description: Su rol en la historia (para la ficha pública).
- system_prompt: Instrucciones detalladas de personalidad (en 1ra persona, define su tono, época y actitud). Mínimo 4 frases.
- behavioral_context: Sus miedos, deseos y motivaciones secretas según la trama.
- sample_dialogues: Un par de frases que capturen su estilo de habla único.
- greeting_message: Su saludo inicial al lector.
- visual_prompt: Descripción física detallada para generación de imagen (Stable Diffusion) en INGLÉS.

Responde una lista JSON: [{{...}}, {{...}}, {{...}}]"""

def main():
    start_time = time.time()
    
    all_books = Book.objects.all()
    books_to_process = []
    
    for b in all_books:
        if not AIAvatar.objects.filter(edition__book=b).exists():
            books_to_process.append(b)

    total = len(books_to_process)
    if total == 0:
        print("\n🎉 ¡Todos los libros ya tienen personajes! Catálogo completo.")
        return
        
    print(f"Iniciando descubrimiento premium para {total} libros pendientes...\n")

    processed = 0
    successful_books = 0
    failed_books = 0
    total_chars_created = 0
    
    visual_tasks = []
    if os.path.exists('json_data/characters_to_generate.json'):
        try:
            with open('json_data/characters_to_generate.json', 'r', encoding='utf-8') as f:
                visual_tasks = json.load(f)
        except Exception:
            print("  ⚠️ Archivo JSON previo corrupto. Empezando lista desde cero.")
            visual_tasks = []

    for book in books_to_process:
        print(f"Procesando obra: {book.title}...")
        edition = book.editions.first()
        if not edition:
            failed_books += 1
            continue
            
        res = call_deepseek(build_discovery_prompt(book))
        
        if res and isinstance(res, list):
            chars_for_this_book = 0
            for char in res:
                new_avatar = AIAvatar.objects.create(
                    edition=edition,
                    name=char.get('name', 'Desconocido')[:250], # Recorte de seguridad
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
                print(f"  [OK] Personaje creado: {new_avatar.name}")
                chars_for_this_book += 1
                total_chars_created += 1
            
            if chars_for_this_book > 0:
                successful_books += 1
            else:
                failed_books += 1
                
            processed += 1
            with open('json_data/characters_to_generate.json', 'w', encoding='utf-8') as f:
                json.dump(visual_tasks, f, indent=2, ensure_ascii=False)
        else:
            failed_books += 1
        
        time.sleep(1.2)

    end_time = time.time()
    elapsed_minutes = (end_time - start_time) / 60

    print("\n" + "="*50)
    print("📊 REPORTE DE EXTRACCIÓN DE PERSONAJES")
    print("="*50)
    print(f"⏱️  Tiempo transcurrido:   {elapsed_minutes:.2f} minutos")
    print(f"📚 Libros procesados:     {processed}")
    print(f"✅ Libros con éxito:      {successful_books}")
    print(f"❌ Libros con error:      {failed_books}")
    print(f"🎭 Personajes creados:    {total_chars_created}")
    print("="*50)
    print(f"El archivo 'json_data/characters_to_generate.json' ha sido actualizado.")

if __name__ == "__main__":
    main()
