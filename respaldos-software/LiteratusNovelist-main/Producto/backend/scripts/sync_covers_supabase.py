"""
Script para sincronizar portadas de la carpeta local hacia Supabase Storage.
Sube las imágenes usando multithreading para mayor velocidad y actualiza
el campo `cover_image` en la base de datos de PostgreSQL.
"""
import os
import sys
import mimetypes
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configurar entorno Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()
from django.conf import settings
from catalog.models import Book
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = getattr(settings, 'SUPABASE_URL', os.getenv('SUPABASE_URL'))
SUPABASE_KEY = getattr(settings, 'SUPABASE_KEY', os.getenv('SUPABASE_KEY'))
BUCKET_NAME = 'literatus-media'
BUCKET_PATH = 'book_covers'

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL o SUPABASE_KEY no están configurados en .env")
    sys.exit(1)

def get_public_url(filename):
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{BUCKET_PATH}/{filename}"

def upload_file_to_supabase(file_path: Path):
    """
    Sube un archivo a Supabase Storage y actualiza el libro asociado en la BD.
    Retorna True si tuvo éxito, False si falló.
    """
    filename = file_path.name
    # Extraer el slug del archivo (ej. david-copperfield-charles-dickens.jpg -> slug)
    # Por lo general el nombre del archivo es exactamente el slug o similar, pero
    # dado que hay 1986 covers, buscaremos el libro por ID o Slug.
    # Asumimos que el nombre del archivo sin la extensión es el slug del libro.
    slug = file_path.stem
    
    # Intentar encontrar el libro
    book = Book.objects.filter(slug=slug).first()
    if not book:
        # Si no lo encuentra, tal vez el slug no es exacto, lo omitimos por ahora o solo lo subimos
        pass

    content_type, _ = mimetypes.guess_type(file_path)
    if not content_type:
        content_type = 'application/octet-stream'

    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': content_type
    }

    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{BUCKET_PATH}/{filename}"

    with open(file_path, 'rb') as f:
        response = requests.post(url, headers=headers, data=f)

    # Supabase retorna 400 si ya existe, podemos intentar PUT o ignorar
    if response.status_code == 400 and 'Duplicate' in response.text:
        # Intentar PUT (upsert) en lugar de POST
        response = requests.put(url, headers=headers, data=open(file_path, 'rb'))

    if response.status_code in (200, 201):
        public_url = get_public_url(filename)
        if book:
            book.cover_image = public_url
            book.save(update_fields=['cover_image'])
            return True, f"Subido y enlazado a {book.title}"
        else:
            return True, f"Subido (no se encontró libro para el slug '{slug}')"
    else:
        return False, f"Error subiendo {filename}: {response.status_code} - {response.text}"

def main():
    covers_dir = Path("media/covers_finales")
    if not covers_dir.exists():
        print(f"Error: La carpeta {covers_dir.resolve()} no existe.")
        return

    files = [f for f in covers_dir.iterdir() if f.is_file() and f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']]
    total = len(files)
    print(f"Encontrados {total} archivos de portadas. Iniciando subida a Supabase...")

    success = 0
    failed = 0

    # Usar ThreadPoolExecutor para subidas concurrentes
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(upload_file_to_supabase, f): f for f in files}
        
        for i, future in enumerate(as_completed(futures), start=1):
            file_path = futures[future]
            try:
                is_success, msg = future.result()
                if is_success:
                    success += 1
                    print(f"[{i}/{total}] ✅ {msg}")
                else:
                    failed += 1
                    print(f"[{i}/{total}] ❌ {msg}")
            except Exception as e:
                failed += 1
                print(f"[{i}/{total}] ❌ Error crítico con {file_path.name}: {e}")

    print("\n" + "="*50)
    print("RESUMEN DE SINCRONIZACIÓN")
    print(f"Total procesados: {total}")
    print(f"Subidas exitosas: {success}")
    print(f"Fallidos: {failed}")
    print("="*50)

if __name__ == "__main__":
    main()
