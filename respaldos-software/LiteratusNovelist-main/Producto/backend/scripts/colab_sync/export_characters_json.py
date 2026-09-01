import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from ai_engine.models import AIAvatar

def export_json():
    # Exportamos personajes que no tienen imagen cargada
    avatars = AIAvatar.objects.filter(avatar_image='')
    tasks = []
    
    for av in avatars:
        # Recuperamos el prompt visual que guardamos en behavioral_context
        # o usamos uno genérico si está vacío
        visual_prompt = av.behavioral_context if av.behavioral_context else f"Portrait of {av.name}, literary character"
        
        tasks.append({
            "id": av.id,
            "name": av.name,
            "prompt": visual_prompt
        })
        
    with open('json_data/characters_to_generate.json', 'w', encoding='utf-8') as f:
        json.dump(tasks, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Se han exportado {len(tasks)} personajes a 'json_data/characters_to_generate.json'.")

if __name__ == "__main__":
    export_json()
