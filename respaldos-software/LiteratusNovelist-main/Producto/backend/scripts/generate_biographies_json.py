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

from catalog.models import Author

def get_api_key():
    try:
        with open(os.path.join(backend_dir, '.env'), 'r', encoding='utf-8') as f:
            for line in f:
                if line.startswith('DEEPSEEK_API_KEY='):
                    return line.split('=')[1].strip()
    except Exception as e:
        pass
    return None

DEEPSEEK_API_KEY = get_api_key()

def get_biographies_batch(authors_batch):
    # Formato de entrada para la IA
    authors_info = "\n".join([
        f"- ID: {a.id} | Nombre: {a.full_name}" 
        for a in authors_batch
    ])
    
    prompt = (
        "Actúa como un historiador y experto literario. Para cada autor de la siguiente lista, escribe una biografía "
        "atrapante y profesional de exactamente un párrafo en español (máximo 100-150 palabras por autor), enfocándote "
        "en su estilo literario y su impacto histórico.\n"
        "Si el autor es 'Anónimo' o 'Desconocido', crea un breve párrafo explicando que las obras con este nombre pertenecen a "
        "autores no identificados a lo largo de la historia o la cultura popular.\n"
        "Devuelve ÚNICAMENTE un objeto JSON con una clave 'results' que contenga una lista de objetos. "
        "Cada objeto debe tener 'author_id' (entero) y 'bio' (cadena de texto).\n\n"
        f"AUTORES:\n{authors_info}"
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

    output_file = Path("biographies_backup.json")
    
    # Cargar progreso previo para no repetir
    existing_data = {}
    if output_file.exists():
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
        except json.JSONDecodeError:
            pass

    # Obtener autores únicos que aún no están en el JSON
    all_authors = Author.objects.only('id', 'full_name')
    authors_to_process = [a for a in all_authors if str(a.id) not in existing_data]

    total = len(authors_to_process)
    if total == 0:
        print("[OK] Todos los autores ya tienen su biografia generada en el JSON.")
        return

    print(f"--- GENERANDO BIOGRAFIAS PARA {total} AUTORES (Aproximadamente ${(total*0.00007):.2f} USD) ---")
    
    batch_size = 5  # Procesar 5 autores a la vez
    
    for i in range(0, total, batch_size):
        batch = authors_to_process[i:i+batch_size]
        current_names = " | ".join([a.full_name[:20] for a in batch])
        print(f"[>] [{i+1}/{total}] Procesando lote: {current_names}...")
        
        results = get_biographies_batch(batch)
        if not results:
            print("  Reintentando en 5 segundos...")
            time.sleep(5)
            results = get_biographies_batch(batch) # Intentar una vez más
            
        if results:
            for res in results:
                author_id = str(res.get('author_id'))
                bio = res.get('bio')
                if author_id and bio:
                    existing_data[author_id] = bio
            
            # Guardar incrementalmente
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
                
            print(f"  [OK] Lote guardado. Total en JSON: {len(existing_data)}")
        else:
            print("  [ERROR] Fallo el procesamiento de este lote, saltando...")
            
        # Esperar un poco
        time.sleep(1)

if __name__ == "__main__":
    main()
