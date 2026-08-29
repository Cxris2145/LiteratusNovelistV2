import os
import sys
import json
import time
import requests
from pathlib import Path

# Añadir el directorio raíz al PATH para encontrar 'config'
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

# Configurar entorno Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from catalog.models import Book

def get_api_key():
    try:
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(backend_dir, '.env'), 'r', encoding='utf-8') as f:
            for line in f:
                if line.startswith('DEEPSEEK_API_KEY='):
                    return line.split('=')[1].strip()
    except Exception as e:
        pass
    return None

DEEPSEEK_API_KEY = get_api_key()

def get_synopses_batch(books_batch):
    # Formato de entrada para la IA
    books_info = "\n".join([
        f"- ID: {b.id} | Título: {b.title} | Autor: {b.authors.first().full_name if b.authors.exists() else 'Anónimo'}" 
        for b in books_batch
    ])
    
    prompt = (
        "Actúa como un experto literario. Para cada libro de la siguiente lista, escribe una sinopsis cautivadora y profesional "
        "de exactamente un párrafo en español (máximo 100-150 palabras por libro).\n"
        "Devuelve ÚNICAMENTE un objeto JSON con una clave 'results' que contenga una lista de objetos. "
        "Cada objeto debe tener 'book_id' (entero) y 'synopsis' (cadena de texto).\n\n"
        f"LIBROS:\n{books_info}"
    )

    try:
        response = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "You are a literary API. Return ONLY valid JSON with 'results' list."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"},
                "max_tokens": 1500
            },
            timeout=60
        )
        response.raise_for_status()
        res_data = response.json()
        raw_content = res_data['choices'][0]['message']['content']
        return json.loads(raw_content).get('results', [])
    except Exception as e:
        print(f"  [!] Error llamando a DeepSeek: {e}")
        return None

def main():
    if not DEEPSEEK_API_KEY:
        print("[ERROR] No se encontro DEEPSEEK_API_KEY en el archivo .env")
        return

    output_file = Path("synopses_backup.json")
    
    # Cargar progreso previo para no repetir
    existing_data = {}
    if output_file.exists():
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
        except json.JSONDecodeError:
            pass

    # Obtener libros cuya sinopsis este vacia o nula en la base de datos
    from django.db.models import Q
    books_to_process = list(Book.objects.filter(Q(synopsis__exact='') | Q(synopsis__isnull=True)).only('id', 'title').prefetch_related('authors'))

    total = len(books_to_process)
    if total == 0:
        print("[OK] Todos los libros ya tienen su sinopsis generada en el JSON.")
        return

    print(f"--- GENERANDO SINOPSIS PARA {total} LIBROS (Aproximadamente ${(total*0.00007):.2f} USD) ---")
    
    batch_size = 5  # Procesar 5 libros a la vez para optimizar tokens y tiempo
    
    for i in range(0, total, batch_size):
        batch = books_to_process[i:i+batch_size]
        current_titles = " | ".join([b.title[:20] for b in batch])
        print(f"[>] [{i+1}/{total}] Procesando lote: {current_titles}...")
        
        results = get_synopses_batch(batch)
        if not results:
            print("  Reintentando en 5 segundos...")
            time.sleep(5)
            results = get_synopses_batch(batch) # Intentar una vez más
            
        if results:
            for res in results:
                book_id = str(res.get('book_id'))
                synopsis = res.get('synopsis')
                if book_id and synopsis:
                    existing_data[book_id] = synopsis
            
            # Guardar incrementalmente en cada lote
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
                
            print(f"  [OK] Lote guardado. Total en JSON: {len(existing_data)}")
        else:
            print("  [ERROR] Fallo el procesamiento de este lote, saltando...")
            
        # Esperar un poco para no saturar los límites de la API
        time.sleep(1)

if __name__ == "__main__":
    main()
