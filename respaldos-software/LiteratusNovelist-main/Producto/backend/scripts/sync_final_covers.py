import os
import sys
import django
from dotenv import load_dotenv

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.conf import settings
from catalog.models import Book
import requests

load_dotenv()
SUPABASE_URL = getattr(settings, 'SUPABASE_URL', os.getenv('SUPABASE_URL'))
SUPABASE_KEY = getattr(settings, 'SUPABASE_KEY', os.getenv('SUPABASE_KEY'))
BUCKET_NAME = 'literatus-media'
BUCKET_PATH = 'book_covers'

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL y SUPABASE_KEY deben estar configurados.")
    sys.exit(1)

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

def delete_all_covers():
    print(f"Buscando archivos existentes en {BUCKET_NAME}/{BUCKET_PATH}...")
    url = f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET_NAME}"
    payload = {"prefix": f"{BUCKET_PATH}/", "limit": 10000}
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code == 200:
        files = response.json()
        if not files:
            print("No hay archivos para eliminar.")
            return
        
        file_paths = [f"{BUCKET_PATH}/{f['name']}" for f in files if f['name'] != '.emptyFolderPlaceholder']
        if file_paths:
            print(f"Eliminando {len(file_paths)} archivos antiguos...")
            del_url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}"
            del_payload = {"prefixes": file_paths}
            del_resp = requests.delete(del_url, headers=headers, json=del_payload)
            if del_resp.status_code == 200:
                print("Archivos antiguos eliminados con éxito.")
            else:
                print(f"Error eliminando archivos: {del_resp.text}")
    else:
        print(f"Error listando archivos: {response.text}")

def upload_new_covers():
    covers_dir = os.path.join(settings.MEDIA_ROOT, 'covers_finales')
    if not os.path.exists(covers_dir):
        print(f"Error: No existe el directorio {covers_dir}")
        return

    files = [f for f in os.listdir(covers_dir) if f.endswith(('.jpg', '.png', '.jpeg'))]
    print(f"Encontrados {len(files)} archivos en covers_finales para subir.")
    
    uploaded_count = 0
    failed_count = 0

    for filename in files:
        file_path = os.path.join(covers_dir, filename)
        upload_path = f"{BUCKET_PATH}/{filename}"
        upload_url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{upload_path}"
        
        with open(file_path, 'rb') as f:
            file_data = f.read()

        content_type = "image/png" if filename.endswith('.png') else "image/jpeg"
        up_headers = headers.copy()
        up_headers['Content-Type'] = content_type
        
        response = requests.post(upload_url, headers=up_headers, data=file_data)
        
        if response.status_code in (200, 201):
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{upload_path}"
            
            slug = os.path.splitext(filename)[0]
            try:
                book = Book.objects.get(slug=slug)
                book.cover_image = public_url
                book.save()
                print(f"[{uploaded_count+1}/{len(files)}] Subido y enlazado: {book.title}")
                uploaded_count += 1
            except Book.DoesNotExist:
                print(f"[{uploaded_count+1}/{len(files)}] Subido (no se encontró libro para slug: {slug})")
                uploaded_count += 1
        else:
            print(f"Error al subir {filename}: {response.text}")
            failed_count += 1
            
    print(f"\nResumen: {uploaded_count} subidos, {failed_count} fallidos.")

if __name__ == "__main__":
    delete_all_covers()
    upload_new_covers()
