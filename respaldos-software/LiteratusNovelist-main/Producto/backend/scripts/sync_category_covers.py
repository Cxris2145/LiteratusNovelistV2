"""
sync_category_covers.py
Sincroniza y asegura las 33 portadas de géneros literarios:
1. Descarga cada portada .webp desde el bucket original srbmswjsbkpftjabcurg
2. Guarda una copia local en media/category_covers/
3. Sube la portada al bucket 'literatus-media/category_covers/' del proyecto activo (tknsbrxgkreikcbowvla)
4. Actualiza el campo cover_image en la base de datos PostgreSQL: 'category_covers/{slug}.webp'
"""
import os
import sys
from pathlib import Path
import urllib.request
import requests

# Inicializar entorno Django
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BACKEND_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from catalog.models import Genre
from django.conf import settings

SOURCE_SUPABASE_URL = "https://srbmswjsbkpftjabcurg.supabase.co/storage/v1/object/public/literatus-media/category_covers"
TARGET_SUPABASE_URL = getattr(settings, 'SUPABASE_URL', os.getenv('SUPABASE_URL', 'https://tknsbrxgkreikcbowvla.supabase.co'))
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_KEY')
BUCKET_NAME = 'literatus-media'
SUBDIR = 'category_covers'

LOCAL_MEDIA_DIR = BACKEND_DIR / 'media' / 'category_covers'
LOCAL_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

def main():
    genres = Genre.objects.all().order_by('slug')
    print(f"Iniciando sincronizacion para {genres.count()} generos literarios...")
    print(f"Destino Supabase: {TARGET_SUPABASE_URL}")
    print(f"Directorio local: {LOCAL_MEDIA_DIR}")

    headers = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'image/webp'
    }

    success_count = 0
    updated_db_count = 0

    for idx, genre in enumerate(genres, start=1):
        filename = f"{genre.slug}.webp"
        source_url = f"{SOURCE_SUPABASE_URL}/{filename}"
        local_file = LOCAL_MEDIA_DIR / filename

        print(f"\n[{idx}/{genres.count()}] Genero: '{genre.name}' ({genre.slug})")

        # 1. Descargar imagen si no existe localmente
        if not local_file.exists() or local_file.stat().st_size == 0:
            try:
                print(f"  -> Descargando desde {source_url}...")
                req = urllib.request.Request(source_url, headers={'User-Agent': 'LiteratusSync/1.0'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                    with open(local_file, 'wb') as lf:
                        lf.write(data)
                print(f"  -> Guardado localmente: {local_file.stat().st_size} bytes")
            except Exception as e:
                print(f"  [ERROR] Descargando {source_url}: {e}")
                continue
        else:
            print(f"  -> Archivo local existente ({local_file.stat().st_size} bytes)")

        # 2. Subir a Supabase Target
        if TARGET_SUPABASE_URL and SUPABASE_SERVICE_KEY:
            upload_url = f"{TARGET_SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{SUBDIR}/{filename}"
            try:
                with open(local_file, 'rb') as f:
                    file_bytes = f.read()

                # Intentar POST
                res = requests.post(upload_url, headers=headers, data=file_bytes, timeout=15)
                if res.status_code in (200, 201):
                    print(f"  [OK] Subido a Supabase target: {SUBDIR}/{filename}")
                    success_count += 1
                elif res.status_code == 400 and ('Duplicate' in res.text or 'AlreadyExists' in res.text or 'already exists' in res.text):
                    # Intentar PUT (upsert)
                    put_res = requests.put(upload_url, headers=headers, data=file_bytes, timeout=15)
                    if put_res.status_code in (200, 201):
                        print(f"  [OK] Actualizado en Supabase target (PUT): {SUBDIR}/{filename}")
                        success_count += 1
                    else:
                        print(f"  [WARN] Objeto ya existia o PUT retorno {put_res.status_code}")
                        success_count += 1
                else:
                    # Intentar PUT por si acaso
                    put_res = requests.put(upload_url, headers=headers, data=file_bytes, timeout=15)
                    if put_res.status_code in (200, 201):
                        print(f"  [OK] Subido con PUT: {SUBDIR}/{filename}")
                        success_count += 1
                    else:
                        print(f"  [ERROR] Subiendo a Supabase ({res.status_code}): {res.text[:150]}")
            except Exception as ex:
                print(f"  [ERROR] Excepcion subiendo a Supabase: {ex}")

        # 3. Actualizar base de datos
        db_path = f"{SUBDIR}/{filename}"
        if genre.cover_image.name != db_path:
            genre.cover_image.name = db_path
            genre.save(update_fields=['cover_image'])
            updated_db_count += 1
            print(f"  [DB] Base de datos actualizada: cover_image = '{db_path}'")
        else:
            print(f"  [DB] Base de datos ya estaba al dia: '{db_path}'")

    print("\n" + "="*50)
    print("RESUMEN DE SINCRONIZACION DE PORTADAS")
    print(f"Total generos: {genres.count()}")
    print(f"Subidos / verificados en Supabase: {success_count}")
    print(f"Registros actualizados en BD: {updated_db_count}")
    print("="*50)

if __name__ == '__main__':
    main()
