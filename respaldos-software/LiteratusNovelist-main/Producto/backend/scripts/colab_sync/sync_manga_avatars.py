import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from ai_engine.models import AIAvatar

def main():
    print("=" * 60)
    print("SINCRONIZADOR DE AVATARES MANGA - LITERATUS NOVELIST")
    print("=" * 60)

    # Carpeta origen de los assets manga relativos a MEDIA_ROOT
    manga_assets_dir = os.path.join('media', 'ai_avatars', 'manga_assets')

    if not os.path.exists(manga_assets_dir):
        print(f"[ERROR] No se encontro la carpeta '{manga_assets_dir}'.")
        print("Asegurate de descomprimir el ZIP en: media/ai_avatars/manga_assets/")
        return

    # Escanear subcarpetas por UUID
    subfolders = [f for f in os.listdir(manga_assets_dir) if os.path.isdir(os.path.join(manga_assets_dir, f))]
    print(f"[INFO] Carpetas de personajes detectadas: {len(subfolders)}")

    synced = 0
    not_found = 0

    for uuid_folder in subfolders:
        calm_image_relative = f"manga_assets/{uuid_folder}/calm.webp"
        calm_image_path = os.path.join('media', 'ai_avatars', calm_image_relative)

        # Verificar que la pose 'calm.webp' realmente exista
        if not os.path.exists(calm_image_path):
            print(f"[WARN] Carpeta {uuid_folder} no tiene 'calm.webp'. Saltando...")
            continue

        try:
            # Buscar el personaje por su ID (UUID)
            avatar = AIAvatar.objects.get(id=uuid_folder)
            
            # Asignar la ruta relativa al campo ImageField
            avatar.avatar_image = calm_image_relative
            avatar.save(update_fields=['avatar_image'])
            
            print(f"[OK] Sincronizado: {avatar.name:<25} (Libro: {avatar.edition.book.title})")
            synced += 1
            
        except AIAvatar.DoesNotExist:
            print(f"[WARN] El personaje con ID '{uuid_folder}' no existe en la base de datos.")
            not_found += 1
        except Exception as e:
            print(f"[ERROR] Error procesando ID '{uuid_folder}': {e}")

    print("\n" + "=" * 60)
    print("REPORTE DE SINCRONIZACION")
    print("=" * 60)
    print(f"Personajes actualizados en DB : {synced}")
    print(f"ID no encontrados en DB     : {not_found}")
    print(f"Total carpetas procesadas     : {len(subfolders)}")
    print("=" * 60)

if __name__ == '__main__':
    main()
