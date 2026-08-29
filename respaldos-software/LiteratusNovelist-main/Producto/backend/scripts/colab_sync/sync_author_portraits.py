import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
from django.core.files import File

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Author

def sync_portraits(portraits_dir='media/authors/photos'):
    """
    Sincroniza las imágenes generadas por la IA con los autores en la base de datos.
    Busca archivos .jpg cuyo nombre coincida con el slug del autor.
    """
    if not os.path.exists(portraits_dir):
        print(f"Error: No se encontro la carpeta '{portraits_dir}'. Asegurate de extraer las imagenes ahi.")
        return

    authors_updated = 0
    not_found = 0

    print(f"Iniciando sincronizacion desde la carpeta '{portraits_dir}'...")

    for filename in os.listdir(portraits_dir):
        if not filename.endswith('.jpg'):
            continue

        # El nombre del archivo es el slug del autor (ej: edgar-allan-poe.jpg)
        slug = filename.replace('.jpg', '')
        
        try:
            author = Author.objects.get(slug=slug)
            
            # Asignamos la ruta relativa directamente al campo photo
            author.photo = f"authors/photos/{filename}"
            author.save(update_fields=['photo'])
            
            print(f"Foto asignada a: {author.full_name}")
            authors_updated += 1
            
        except Author.DoesNotExist:
            # print(f"Autor con slug '{slug}' no encontrado en la BD. Ignorando imagen.")
            not_found += 1
        except Exception as e:
            print(f"Error procesando {filename}: {e}")

    print("\n--- RESUMEN ---")
    print(f"Autores actualizados: {authors_updated}")
    print(f"Imagenes sin autor:   {not_found}")
    print("Sincronizacion terminada!")

if __name__ == "__main__":
    sync_portraits()

