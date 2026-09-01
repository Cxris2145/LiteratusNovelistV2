import json
import torch
import os
from diffusers import StableDiffusionXLPipeline, EulerAncestralDiscreteScheduler
from PIL import Image

# Necesitarás instalar rembg en Colab: !pip install rembg[gpu] Pillow
# Ojo: si estás en local sin GPU potente, puede que rembg[gpu] falle, usa rembg (cpu)
try:
    from rembg import remove
except ImportError:
    print("Por favor instala rembg ejecutando en tu Colab: !pip install rembg[gpu]")
    exit(1)

# 1. Configuración de Directorios y Carga del JSON
tasks_file = "metamorfosis_manga.json"
output_dir = "manga_assets"
os.makedirs(output_dir, exist_ok=True)

with open(tasks_file, "r", encoding="utf-8") as f:
    characters = json.load(f)

# 2. Inicialización del Pipeline (Usando Animagine XL 3.1)
model_id = "cagliostrolab/animagine-xl-3.1"
print(f"⏳ Cargando modelo Animagine XL desde HuggingFace...")

pipe = StableDiffusionXLPipeline.from_pretrained(
    model_id,
    torch_dtype=torch.float16,
    use_safetensors=True
)
pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
pipe = pipe.to("cuda")

# Activar optimizaciones de memoria en Colab T4/V100
pipe.enable_attention_slicing()
print("✅ Modelo cargado con éxito en GPU.")

# 3. Bucle de Generación
for idx, char in enumerate(characters, 1):
    char_id = char["id"]
    char_name = char["name"]
    book_title = char["book"]
    base_prompt = char["base_prompt"]
    frames = char["frames"]

    print(f"\n🎭 [{idx}/{len(characters)}] Generando expresiones para: {char_name} ({book_title})")

    # Generamos una semilla fija para este personaje específico
    char_seed = hash(char_id) % (2**32)

    # Crear carpeta dedicada para el personaje basada en su UUID o ID de base de datos
    char_folder = os.path.join(output_dir, char_id)
    os.makedirs(char_folder, exist_ok=True)

    # Guardar metadata básica del personaje en su carpeta
    with open(os.path.join(char_folder, "metadata.json"), "w", encoding="utf-8") as meta_f:
        json.dump({
            "id": char_id,
            "name": char_name,
            "book": book_title,
            "seed": char_seed
        }, meta_f, indent=2)

    for frame_name, emotion_prompt in frames.items():
        print(f"  🖼️ Generando frame: {frame_name}...")
        
        # Unimos el prompt base del personaje con la emoción específica
        full_prompt = f"{base_prompt}, {emotion_prompt}"

        generator = torch.Generator(device="cuda").manual_seed(char_seed)

        # Generar imagen
        with torch.inference_mode():
            image = pipe(
                prompt=full_prompt,
                negative_prompt="lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry, photo, realistic, background, scenery",
                width=832,
                height=1216, # Formato vertical
                guidance_scale=7.0,
                num_inference_steps=28,
                generator=generator
            ).images[0]

        print(f"  ✂️  Recortando fondo y convirtiendo a WEBP...")
        
        # Usamos rembg para quitar el fondo automáticamente
        image_no_bg = remove(image)
        
        # Guardar imagen optimizada en WEBP con el nombre clave (ej: neutral.webp)
        filename = f"{frame_name}.webp"
        save_path = os.path.join(char_folder, filename)
        
        image_no_bg.save(save_path, 'WEBP')
        print(f"    💾 Guardado: {save_path}")

print("\n🎉 ¡Proceso completado! Todas las imágenes expresivas han sido generadas, recortadas y comprimidas.")
