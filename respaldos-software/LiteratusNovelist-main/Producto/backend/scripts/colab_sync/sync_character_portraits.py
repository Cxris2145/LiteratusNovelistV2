import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
from django.core.files import File

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from ai_engine.models import AIAvatar

def sync_character_images(images_dir='character_portraits'):
    """
    Sincroniza las imágenes generadas en Colab con los AIAvatar.
    El nombre de la imagen DEBE ser el ID del avatar (ej: 42.jpg).
    """
    if not os.path.exists(images_dir):
        print(f"❌ Error: No se encontró la carpeta '{images_dir}'.")
        return

    updated = 0
    errors = 0

    print(f"🚀 Sincronizando personajes desde '{images_dir}'...")

    for filename in os.listdir(images_dir):
        if not filename.endswith('.jpg') and not filename.endswith('.png'):
            continue

        # Extraer el ID del nombre del archivo (ej: "123.jpg" -> "123")
        char_id = filename.split('.')[0]
        
        try:
            avatar = AIAvatar.objects.get(id=int(char_id))
            
            file_path = os.path.join(images_dir, filename)
            with open(file_path, 'rb') as f:
                avatar.avatar_image.save(filename, File(f), save=True)
            
            print(f"✅ Imagen asignada a: {avatar.name} (Libro: {avatar.edition.book.title})")
            updated += 1
            
        except (AIAvatar.DoesNotExist, ValueError):
            print(f"⚠️ No se encontró el personaje con ID {char_id}. Ignorando {filename}.")
            errors += 1
        except Exception as e:
            print(f"❌ Error procesando {filename}: {e}")

    print(f"\n--- Sincronización Finalizada ---")
    print(f"Personajes actualizados: {updated}")
    print(f"Archivos ignorados/error: {errors}")

if __name__ == "__main__":
    # Puedes cambiar el nombre de la carpeta aquí si lo deseas
    sync_character_images('covers_finales') 
