"""
sync_avatar_images.py
Escanea una carpeta de imágenes generadas (nombradas por UUID)
y las asigna al campo avatar_image del AIAvatar correspondiente.

Uso:
    1. Descomprime el ZIP de Colab en una carpeta local, ej: media/avatars_generated/
    2. Ajusta IMAGES_FOLDER abajo
    3. python sync_avatar_images.py
"""
import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import shutil

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from ai_engine.models import AIAvatar

# ── Configuración ──────────────────────────────────────────────────────────
# Carpeta donde están los avatares
IMAGES_FOLDER = 'media/avatars'

# Carpeta destino dentro del proyecto (donde Django sirve las imágenes)
DEST_FOLDER   = 'media/ai_avatars'
os.makedirs(DEST_FOLDER, exist_ok=True)
# ──────────────────────────────────────────────────────────────────────────

def main():
    if not os.path.exists(IMAGES_FOLDER):
        print(f"Carpeta no encontrada: {IMAGES_FOLDER}")
        return

    image_files = [f for f in os.listdir(IMAGES_FOLDER) if f.endswith('.png')]
    print(f"Imagenes encontradas en la carpeta: {len(image_files)}")

    synced   = 0
    missing  = 0

    for filename in image_files:
        avatar_id = filename.replace('.png', '')

        try:
            # First check if it is a valid UUID before trying to query database
            import uuid
            try:
                val_uuid = uuid.UUID(avatar_id)
            except ValueError:
                print(f"  WARN: Ignorando archivo no-UUID: {filename}")
                missing += 1
                continue
                
            avatar = AIAvatar.objects.get(id=val_uuid)
        except AIAvatar.DoesNotExist:
            print(f"  WARN: Sin match en DB: {filename}")
            missing += 1
            continue

        # Copiar imagen al destino final
        src  = os.path.join(IMAGES_FOLDER, filename)
        dest = os.path.join(DEST_FOLDER, f"{avatar_id}.png")
        shutil.copy2(src, dest)

        # Asignar la ruta relativa al campo del modelo
        avatar.avatar_image = f'ai_avatars/{avatar_id}.png'
        avatar.save(update_fields=['avatar_image'])

        synced += 1


    print("\n" + "="*45)
    print("REPORTE DE SINCRONIZACION")
    print("="*45)
    print(f"Avatares sincronizados : {synced}")
    print(f"Sin match en DB       : {missing}")
    print(f"Total imagenes         : {len(image_files)}")
    print("="*45)

if __name__ == '__main__':
    main()

