"""
generate_missing_prompts.py
Genera personalidad (IA) y prompts visuales (Imagen) para los personajes usando DeepSeek.
Crea un JSON para Colab con IDs únicos para sincronización perfecta.
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
            {"role": "system", "content": "Eres un experto en diseño de personajes literarios y prompts para Stable Diffusion XL. Responde siempre en JSON válido."},
            {"role": "user", "content": prompt_text}
        ],
        "temperature": 0.7,
        "max_tokens": 1000,
    }
    try:
        resp = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        return json.loads(content)
    except Exception as e:
        print(f"  ⚠️  Error DeepSeek: {e}")
        return None

def build_prompt(avatar) -> str:
    book_title = avatar.edition.book.title
    book_synopsis = avatar.edition.book.synopsis[:400] if avatar.edition.book.synopsis else "Sin sinopsis"
    char_desc = avatar.description or "Sin descripción"
    
    return f"""Actúa como un diseñador de personajes para la obra "{book_title}".
Personaje: {avatar.name}
Rol/Descripción inicial: {char_desc}
Contexto de la obra: {book_synopsis}

Genera un JSON con estas 5 claves:
{{
  "system_prompt": "Instrucciones de personalidad en primera persona (voz, actitud, vocabulario). En español.",
  "behavioral_context": "Motivaciones y miedos internos secretos. En español.",
  "sample_dialogues": "2 frases cortas típicas del personaje. En español.",
  "greeting_message": "Saludo inicial en carácter. En español.",
  "visual_prompt": "Descripción física DETALLADA para IA de generación de imagen (Stable Diffusion). Debe incluir rasgos faciales, vestimenta de la época, etnia y ambiente cinematográfico. EN INGLÉS."
}}

Responde SOLO el JSON."""

def main():
    # Buscamos avatares que no tengan system_prompt O que no tengan imagen
    avatars = AIAvatar.objects.filter(system_prompt='').select_related('edition__book')
    total = avatars.count()
    
    if total == 0:
        print("[INFO] No hay personajes nuevos que procesar.")
        return

    print(f"[INFO] Procesando {total} personajes...\n")

    image_tasks = []
    updated = 0

    for i, avatar in enumerate(avatars, 1):
        print(f"[{i}/{total}] {avatar.name} ({avatar.edition.book.title})")
        
        res = call_deepseek(build_prompt(avatar))
        
        if res:
            # 1. Guardar en Base de Datos (Personalidad)
            avatar.system_prompt = res.get("system_prompt", "")
            avatar.behavioral_context = res.get("behavioral_context", "")
            avatar.sample_dialogues = res.get("sample_dialogues", "")
            avatar.greeting_message = res.get("greeting_message", "Hola.")
            avatar.save()
            
            # 2. Guardar en lista para el JSON de Colab (Imagen)
            # Usamos el ID como slug para que no haya pérdida en la sincronización
            image_tasks.append({
                "id": avatar.id,
                "name": avatar.name,
                "prompt": res.get("visual_prompt", f"Portrait of {avatar.name}")
            })
            
            print(f"  [OK] Datos guardados. Prompt visual generado.")
            updated += 1
        else:
            print(f"  [FAIL] Error en la API para este personaje.")

        time.sleep(1.2) # Respetar límites de la API

    # Exportar JSON para Colab
    if image_tasks:
        with open('json_data/characters_to_generate.json', 'w', encoding='utf-8') as f:
            json.dump(image_tasks, f, indent=2, ensure_ascii=False)
        print(f"\n✅ Proceso terminado. Se ha creado 'json_data/characters_to_generate.json' con {len(image_tasks)} tareas para Colab.")
    
    print(f"Total actualizados en BD: {updated}")

if __name__ == "__main__":
    main()
