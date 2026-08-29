import os
import sys
import django
import requests
from dotenv import load_dotenv
from PIL import Image
import io

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.conf import settings
from catalog.models import Author

load_dotenv()
SUPABASE_URL = getattr(settings, 'SUPABASE_URL', os.getenv('SUPABASE_URL'))
SUPABASE_KEY = getattr(settings, 'SUPABASE_KEY', os.getenv('SUPABASE_KEY'))
BUCKET_NAME = 'literatus-media'

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL y SUPABASE_KEY deben estar configurados.")
    sys.exit(1)

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

def upload_to_supabase(file_data, upload_path, content_type):
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{upload_path}"
    up_headers = headers.copy()
    up_headers['Content-Type'] = content_type
    
    # Intentamos subir (hace un UPSERT si ya existe, idealmente)
    response = requests.post(url, headers=up_headers, data=file_data)
    if response.status_code in (200, 201) or "Duplicate" in response.text:
        return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{upload_path}"
    else:
        print(f"Error al subir {upload_path}: {response.text}")
        return None

def process_manga_assets():
    base_dir = os.path.join(settings.MEDIA_ROOT, 'ai_avatars', 'manga_assets')
    if not os.path.exists(base_dir):
        print(f"No existe el directorio de manga assets: {base_dir}")
        return

    print("--- SUBIENDO MANGA ASSETS (YA ESTÁN EN WEBP) ---")
    for root, dirs, files in os.walk(base_dir):
        for filename in files:
            if filename.endswith('.webp'):
                file_path = os.path.join(root, filename)
                
                # Para mantener la estructura de carpetas (ej. manga_assets/gregor_samsa/neutral.webp)
                rel_path = os.path.relpath(file_path, base_dir)
                upload_path = f"manga_assets/{rel_path}".replace("\\", "/")
                
                with open(file_path, 'rb') as f:
                    file_data = f.read()
                
                url = upload_to_supabase(file_data, upload_path, "image/webp")
                if url:
                    print(f"✅ Subido: {upload_path}")

def process_authors():
    base_dir = os.path.join(settings.MEDIA_ROOT, 'authors')
    if not os.path.exists(base_dir):
        print(f"No existe el directorio de autores: {base_dir}")
        return

    print("\n--- COMPRIMIENDO Y SUBIENDO FOTOS DE AUTORES ---")
    
    for root, dirs, files in os.walk(base_dir):
        for filename in files:
            if filename.endswith(('.jpg', '.jpeg', '.png', '.webp')):
                file_path = os.path.join(root, filename)
                author_slug = os.path.splitext(filename)[0]
                
                # 1. Comprimir a WEBP
                img = Image.open(file_path)
                img = img.convert("RGB")
                
                output_io = io.BytesIO()
                img.save(output_io, format="WEBP", quality=85)
                file_data = output_io.getvalue()
                
                # 2. Subir a Supabase
                upload_path = f"authors/{author_slug}.webp"
                url = upload_to_supabase(file_data, upload_path, "image/webp")
                
                if url:
                    # 3. Actualizar la Base de Datos
                    try:
                        author = Author.objects.get(slug=author_slug)
                        author.photo = url
                        author.save()
                        print(f"✅ Comprimido, Subido y Enlazado: {author.full_name}")
                    except Author.DoesNotExist:
                        print(f"⚠️ Subido, pero no se encontró el autor en BD para: {author_slug}")

if __name__ == "__main__":
    process_manga_assets()
    process_authors()
