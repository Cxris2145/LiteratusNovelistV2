import os
import django
import json
import requests
import time
import traceback
import sys
from pathlib import Path

# Añadir el directorio raíz al PATH para encontrar 'config'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

# Configurar entorno Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import models
from django.db.models.functions import Length
from catalog.models import Book, Edition
from ai_engine.models import AIAvatar

def get_api_key():
    try:
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        with open(os.path.join(backend_dir, '.env'), 'r') as f:
            for line in f:
                if line.startswith('DEEPSEEK_API_KEY='):
                    return line.split('=')[1].strip()
    except: pass
    return None

DEEPSEEK_API_KEY = get_api_key()

def get_literary_data(book_batch):
    books_info = "\n".join([f"- {b.title} ({b.authors.first().full_name if b.authors.exists() else 'Anónimo'})" for b in book_batch])
    
    prompt = (
        "Act as a world-class literary editor. For each book below, provide a CAPTIVATING 3-paragraph synopsis in Spanish "
        "and a list of main characters with deep psychological profiles.\n"
        "Return ONLY a JSON object with a 'results' key containing a list of objects.\n"
        f"BOOKS:\n{books_info}"
    )

    try:
        response = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "You are a literary expert. Return ONLY valid JSON with 'results' list."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"},
                "max_tokens": 4000
            },
            timeout=180
        )
        res_data = response.json()
        raw_content = res_data['choices'][0]['message']['content']
        return json.loads(raw_content).get('results', [])
    except Exception as e:
        print(f"  ⚠️ Error de red o formato en batch: {e}")
        return None

def main():
    if not DEEPSEEK_API_KEY:
        print("❌ Error en API Key"); return

    books = Book.objects.annotate(syn_len=Length('synopsis')).filter(
        models.Q(syn_len__lt=100) | models.Q(synopsis__isnull=True)
    ).order_by('id')
    
    total = books.count()
    if total == 0:
        print("✅ Biblioteca completa."); return

    print(f"--- 🖋️ GENERANDO ALMA LITERARIA PARA {total} LIBROS ---")
    
    batch_size = 2
    for i in range(0, total, batch_size):
        batch = list(books[i:i+batch_size])
        current_titles = ", ".join([b.title for b in batch])
        print(f"🚀 [{i+1}/{total}] Procesando: {current_titles}...")
        
        results = get_literary_data(batch)
        if not results:
            continue
            
        for j, res in enumerate(results):
            try:
                if j >= len(batch): break
                book = batch[j]
                
                # Guardar Sinopsis
                book.synopsis = res.get('synopsis', book.synopsis)
                book.save()
                
                # Poblar Avatares
                edition = book.editions.first()
                if edition:
                    for char in res.get('characters', []):
                        name = char.get('name')
                        if name and not AIAvatar.objects.filter(edition=edition, name=name).exists():
                            AIAvatar.objects.create(
                                edition=edition,
                                name=name,
                                description=char.get('description', f'Personaje de {book.title}'),
                                system_prompt=char.get('system_prompt', ''),
                                behavioral_context=char.get('behavioral_context', ''),
                                sample_dialogues=char.get('sample_dialogues', ''),
                                greeting_message=char.get('greeting', f'Hola, soy {name}.'),
                                is_major_character=char.get('is_major', True)
                            )
            except Exception as e:
                print(f"  ❌ Error procesando un libro del batch: {e}")
        
        print(f"  ✅ Bloque de {len(batch)} completado.")
        time.sleep(0.5)

if __name__ == "__main__":
    main()
