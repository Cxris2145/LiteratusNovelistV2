import os
import sys
import json
from pathlib import Path

# Añadir el directorio raíz al PATH
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

# Configurar entorno Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from catalog.models import Book, Author

def inject_synopses():
    synopses_file = Path("synopses_backup.json")
    if not synopses_file.exists():
        print("[!] No se encontro el archivo synopses_backup.json")
        return 0

    with open(synopses_file, 'r', encoding='utf-8') as f:
        try:
            synopses_data = json.load(f)
        except json.JSONDecodeError:
            print("[ERROR] Error leyendo synopses_backup.json")
            return 0

    count = 0
    print(f"[>] Inyectando {len(synopses_data)} sinopsis...")
    for book_id, synopsis in synopses_data.items():
        try:
            book = Book.objects.get(id=book_id)
            book.synopsis = synopsis
            book.save(update_fields=['synopsis'])
            count += 1
        except Book.DoesNotExist:
            print(f"  [!] Libro con ID {book_id} no encontrado.")
        except Exception as e:
            print(f"  [!] Error actualizando libro {book_id}: {e}")

    return count

def inject_biographies():
    bio_file = Path("biographies_backup.json")
    if not bio_file.exists():
        print("[!] No se encontro el archivo biographies_backup.json")
        return 0

    with open(bio_file, 'r', encoding='utf-8') as f:
        try:
            bio_data = json.load(f)
        except json.JSONDecodeError:
            print("[ERROR] Error leyendo biographies_backup.json")
            return 0

    count = 0
    print(f"[>] Inyectando {len(bio_data)} biografias...")
    for author_id, bio in bio_data.items():
        try:
            author = Author.objects.get(id=author_id)
            author.bio = bio
            author.save(update_fields=['bio'])
            count += 1
        except Author.DoesNotExist:
            print(f"  [!] Autor con ID {author_id} no encontrado.")
        except Exception as e:
            print(f"  [!] Error actualizando autor {author_id}: {e}")

    return count

def main():
    print("--- INICIANDO INYECCION DE DATOS DE IA ---")
    
    synopses_injected = inject_synopses()
    print(f"[OK] Se inyectaron {synopses_injected} sinopsis en la base de datos.\n")
    
    bios_injected = inject_biographies()
    print(f"[OK] Se inyectaron {bios_injected} biografias en la base de datos.\n")
    
    print("[OK] !Inyeccion completada exitosamente!")

if __name__ == "__main__":
    main()
