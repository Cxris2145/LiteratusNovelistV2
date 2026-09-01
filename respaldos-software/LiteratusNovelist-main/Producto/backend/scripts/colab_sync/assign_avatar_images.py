import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from ai_engine.models import AIAvatar

# Mapeo de nombre de personaje → archivo de imagen
CHARACTER_IMAGES = {
    'El Principito': 'ai_avatars/principito.png',
    'El Aviador':    'ai_avatars/aviador.png',
    'La Rosa':       'ai_avatars/rosa.png',
    'El Rey':        'ai_avatars/rey.png',
    'El Zorro':      'ai_avatars/zorro.png',
    'La Serpiente':  'ai_avatars/serpiente.png',
}

updated = 0
not_found = []

for name, image_path in CHARACTER_IMAGES.items():
    try:
        avatar = AIAvatar.objects.get(name=name)
        # Asignamos la ruta relativa al campo ImageField directamente
        # (el archivo ya existe en MEDIA_ROOT/ai_avatars/, así que solo apuntamos)
        avatar.avatar_image = image_path
        avatar.save(update_fields=['avatar_image'])
        print(f"✅ {name} → imagen asignada: {image_path}")
        updated += 1
    except AIAvatar.DoesNotExist:
        print(f"WARN: Personaje no encontrado: '{name}'")
        not_found.append(name)
    except Exception as e:
        print(f"Error en '{name}': {e}")

print(f"\nResumen: {updated} personajes actualizados, {len(not_found)} no encontrados")
if not_found:
    print(f"No encontrados: {not_found}")
    # Listar todos los avatares disponibles para referencia
    print("\nAvatares disponibles en la BD:")
    for a in AIAvatar.objects.all():
        print(f"  - Name: {a.name} | ID: {a.id} | Book: {a.edition.book.title}")

