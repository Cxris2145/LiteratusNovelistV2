import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import json
import requests
from pathlib import Path
import time
import re

# Configurar entorno Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

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

def clean_json_string(s):
    s = s.replace("```json", "").replace("```", "").strip()
    start = s.find('{')
    end = s.rfind('}')
    if start != -1 and end != -1:
        return s[start:end+1]
    return s

def get_visual_descriptions(book_batch):
    titles_list = "\n".join([f"- ID: {i} | Title: {b['title']} | Author: {b['author']}" for i, b in enumerate(book_batch)])
    
    prompt = (
        "Provide a short 1-sentence visual description for each book below. "
        "Focus on iconic imagery. English only. NO titles, NO author names. "
        "Return ONLY a JSON object with a key 'results' containing a list of strings. "
        "IMPORTANT: Escape all double quotes with backslashes."
        f"\n\n{titles_list}"
    )

    try:
        response = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "You are a JSON assistant. You ONLY output valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"}
            },
            timeout=120
        )
        
        res_data = response.json()
        raw_content = res_data['choices'][0]['message']['content']
        data = json.loads(clean_json_string(raw_content))
        return data.get('results', [])
    except Exception as e:
        print(f"  ⚠️ Error en batch: {e}")
        return [None] * len(book_batch)

def main():
    if not DEEPSEEK_API_KEY:
        print("❌ Error en API Key"); return

    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    json_path = Path(backend_dir) / "books_to_generate.json"
    with open(json_path, "r", encoding="utf-8") as f:
        tasks = json.load(f)

    to_process = [t for t in tasks if not t['prompt'].startswith("A masterpiece")]
    
    if not to_process:
        print("✅ ¡TODOS LOS LIBROS ESTÁN ENRIQUECIDOS! 100% COMPLETADO."); return

    print(f"--- 🎯 FINALIZANDO ENRIQUECIMIENTO: {len(to_process)} RESTANTES ---")
    
    # Reducimos el batch a 10 para máxima precision en los que faltan
    batch_size = 10
    for i in range(0, len(to_process), batch_size):
        end = min(i + batch_size, len(to_process))
        batch = to_process[i:end]
        
        print(f"🚀 Procesando bloque final ({i} a {end})...")
        descriptions = get_visual_descriptions(batch)
        
        for j, desc in enumerate(descriptions):
            if desc:
                original_task = next((t for t in tasks if t['slug'] == batch[j]['slug']), None)
                if original_task:
                    original_task['prompt'] = (
                        f"A masterpiece oil painting of {desc}. "
                        "Cinematic lighting, rich textures, fine art style. "
                        "STRICTLY NO TEXT, NO LETTERS, NO SIGNATURES."
                    )
        
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(tasks, f, indent=4, ensure_ascii=False)
        time.sleep(1)

if __name__ == "__main__":
    main()
