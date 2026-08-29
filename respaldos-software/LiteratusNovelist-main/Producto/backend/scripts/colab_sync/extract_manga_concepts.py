"""
extract_manga_concepts.py
Genera los prompts visuales para crear un set de 5 poses expresivas (efecto manga/novela visual)
para los personajes de: "El príncipe feliz", "La metamorfosis" y "El gato negro".
Crea un archivo JSON optimizado para cargarse directamente en Google Colab.
"""
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
from catalog.models import Book

# 1. Definir los libros seleccionados
SELECTED_BOOKS_SUBSTRINGS = [
    "príncipe feliz",
    "metamorfosis",
    "gato negro"
]

# 2. Prompts curados en inglés, altamente fieles y cortos para evitar truncamientos en CLIP (77 tokens)
# Optimizados al 100% para consistencia y calidad visual
CURATED_ENGLISH_PROMPTS = {
    # --- El Príncipe Feliz ---
    "el ángel": "A beautiful young angel with large white wings, white hair, soft blue eyes, wearing a glowing divine robe",
    "el príncipe feliz": "A beautiful young prince statue, skin covered in gold leaf, deep sapphire eyes, holding a ruby-hilted sword",
    "el dramaturgo": "A young handsome Victorian writer, messy brown hair, pale skin, wearing a simple shirt and wool vest, sitting in a cold attic",
    "la niña de los fósforos": "A small poor Victorian girl, messy blonde hair, tattered clothes, holding a single glowing match in her hands",
    "la costurera": "A poor, tired Victorian woman seamstress, dark brown hair, worn dress, sewing under a single candle",
    "la golondrina": "A handsome young anthropomorphic swallow boy, dark blue hair, white feather coat, bright amber eyes",
    "el alcalde": "A portly wealthy Victorian mayor, thick mustache, top hat, expensive suit with a gold pocket watch",

    # --- El Gato Negro ---
    "plutón (el gato negro original)": "A sleek glossy black cat with bright emerald green eyes, regal sitting pose, thin golden collar",
    "el segundo gato negro": "A mysterious black cat with a white patch on its chest shaped like a noose, glowing golden eyes",
    "el narrador (protagonista)": "A disheveled 19th-century man, gaunt pale face, hollow dark eyes, worn dark vest and white shirt",
    "la esposa del narrador": "A gentle pale woman in a simple Victorian dress, brown hair tied in a bun, worried expression",

    # --- La Metamorfosis (Kafka) ---
    "gregor samsa": "A giant segmented dark beetle-like insect with sad intelligent human eyes",
    "grete samsa": "A young early 20th-century German girl, blonde hair in braids, wearing a simple apron and dress",
    "el señor samsa": "A stern elderly German man, thick gray mustache, wearing a dark formal uniform, angry posture",
    "la señora samsa": "A frail middle-aged German woman, pale face, sad weary eyes, wearing a dark Victorian lace collar dress",

    # --- Metamorfosis (Ovidio) ---
    "júpiter (zeus)": "A majestic muscular Greek god, long gray hair and beard, stern eyes, wearing a white toga and laurel wreath",
    "apolo": "A handsome radiant Greek god, glowing golden hair, blue eyes, athletic body, wearing a white chiton",
    "dafne": "A beautiful Greek nymph, long flowing brown hair, skin beginning to turn into smooth laurel tree bark",
    "píramo y tisbe": "Two young beautiful Greek lovers standing next to a cracked stone wall, emotional and tragic atmosphere"
}

def load_base_prompts():
    """Carga los prompts base desde el archivo characters_to_generate.json si existe."""
    base_prompts = {}
    json_path = 'json_data/characters_to_generate.json'
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for char in data:
                    key = (char['name'].strip().lower(), char['book'].strip().lower())
                    base_prompts[key] = char['prompt']
            print(f"[INFO] Cargados {len(base_prompts)} prompts base de characters_to_generate.json")
        except Exception as e:
            print(f"[WARN] Error cargando prompts base: {e}")
    return base_prompts

def clean_base_prompt_for_poses(prompt: str) -> str:
    """Limpia y acorta cualquier prompt base para evitar redundancias."""
    conflict_words = [
        "standing", "sitting", "leaning", "reclining", "holding", "smirk", "smile", 
        "smiling", "sad expression", "sorrowful", "thoughtful expression", "brooding", 
        "intense expression", "defiant smirk", "looking out", "pointing", "with a look of",
        "looking down", "looking up", "looking away", "closed eyes", "piercing eyes"
    ]
    cleaned = prompt
    for word in conflict_words:
        cleaned = cleaned.replace(f" with a {word}", "")
        cleaned = cleaned.replace(f" holding a", "")
        cleaned = cleaned.replace(word, "")
        
    cleaned = cleaned.strip().rstrip('.')
    return cleaned

def generate_manga_frames(char_name: str, book_title: str, base_prompt: str):
    """
    Construye las 5 variaciones de poses/expresiones tipo manga.
    Colocamos la expresión al PRINCIPIO del prompt con peso alto (:1.3) para que 
    nunca sea truncada por CLIP y reciba máxima prioridad durante la generación.
    """
    cleaned_base = clean_base_prompt_for_poses(base_prompt)
    
    # Estilo anime/manga consistente y limpio
    manga_style = "manga art style, high quality, masterpiece, solo, upper body portrait, clean lineart, simple neutral studio background"
    
    # 1. Calm / Waiting
    prompt_calm = f"(calm expression, looking at viewer, closed mouth:1.3), {manga_style}, {cleaned_base}"
    
    # 2. Thinking
    prompt_thinking = f"(thoughtful expression, hand on chin, closed eyes, tilted head, thinking pose:1.3), {manga_style}, {cleaned_base}"
    
    # 3. Talking 1
    prompt_talking_1 = f"(speaking expression, slightly open mouth, looking at viewer, slight head tilt:1.3), {manga_style}, {cleaned_base}"
    
    # 4. Talking 2
    prompt_talking_2 = f"(explaining expression, open mouth, hand gesturing, animated speaking pose, looking slightly away:1.3), {manga_style}, {cleaned_base}"
    
    # 5. Talking 3
    prompt_talking_3 = f"(warm friendly expression, smiling while talking, wide open mouth, happy speaking pose, gesturing warmly, looking at viewer:1.3), {manga_style}, {cleaned_base}"

    return {
        "calm": prompt_calm,
        "thinking": prompt_thinking,
        "talking_1": prompt_talking_1,
        "talking_2": prompt_talking_2,
        "talking_3": prompt_talking_3
    }

def main():
    print("[INFO] Iniciando generador de conceptos visuales tipo Manga...")
    
    # Cargar prompts base precalculados
    base_prompts_map = load_base_prompts()
    
    # Buscar los libros en la base de datos
    books = Book.objects.all()
    target_books = []
    
    for book in books:
        title_lower = book.title.lower()
        if any(substring in title_lower for substring in SELECTED_BOOKS_SUBSTRINGS):
            target_books.append(book)
            
    print(f"[INFO] Libros encontrados coincidentes: {[b.title for b in target_books]}")
    
    if not target_books:
        print("[ERROR] No se encontraron los libros especificados en la base de datos.")
        return

    manga_generation_tasks = []
    total_characters = 0

    for book in target_books:
        print(f"\n[INFO] Procesando personajes para: {book.title}...")
        edition = book.editions.first()
        if not edition:
            print(f"  [WARN] No hay ediciones para {book.title}, saltando.")
            continue
            
        avatars = AIAvatar.objects.filter(edition=edition)
        for avatar in avatars:
            name_lower = avatar.name.strip().lower()
            
            # Buscar primero en la lista curada para maxima fidelidad
            base_prompt = None
            if name_lower in CURATED_ENGLISH_PROMPTS:
                base_prompt = CURATED_ENGLISH_PROMPTS[name_lower]
                print(f"  [CURATED] Usando prompt curado y fiel en inglés para {avatar.name}")
            else:
                # Fallback: intentar por coincidencia parcial en la lista curada
                for cur_key, cur_val in CURATED_ENGLISH_PROMPTS.items():
                    if cur_key in name_lower or name_lower in cur_key:
                        base_prompt = cur_val
                        print(f"  [CURATED-PARTIAL] Coincidencia parcial para {avatar.name} -> usando: {cur_key}")
                        break
            
            # Si no está en nuestra lista curada, buscar en el JSON master
            if not base_prompt:
                for (name_k, book_k), prompt_val in base_prompts_map.items():
                    if avatar.name.lower() in name_k and any(sub in book_k for sub in SELECTED_BOOKS_SUBSTRINGS):
                        base_prompt = prompt_val
                        break
            
            # Último fallback genérico
            if not base_prompt:
                desc = avatar.description or "A mysterious literary character"
                base_prompt = f"Anime portrait of {avatar.name}, {desc}. Elaborate outfit, detailed hair and eyes."
                print(f"  [WARN] Prompt base no encontrado. Usando fallback en inglés para {avatar.name}.")
            
            # Generar los 5 frames expresivos
            frames = generate_manga_frames(avatar.name, book.title, base_prompt)
            
            manga_generation_tasks.append({
                "id": str(avatar.id),
                "name": avatar.name,
                "book": book.title,
                "description": avatar.description,
                "base_prompt": base_prompt,
                "frames": frames
            })
            print(f"  [OK] [Manga Config] {avatar.name} listo con 5 frames.")
            total_characters += 1

    # Guardar en un JSON dedicado para la generación en Colab
    output_path = 'json_data/manga_frames_generation.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(manga_generation_tasks, f, indent=2, ensure_ascii=False)
        
    print("\n" + "="*60)
    print("CONFIGURACION MANGA DEFINITIVA GENERADA CON EXITO")
    print("="*60)
    print(f"Archivo guardado: {output_path}")
    print(f"Total de personajes procesados: {total_characters}")
    print(f"Total de frames a generar en Colab: {total_characters * 5}")
    print("="*60)
    print("¡Descarga este JSON definitivo y pásalo a tu Colab para comenzar la producción final!")

if __name__ == "__main__":
    main()
