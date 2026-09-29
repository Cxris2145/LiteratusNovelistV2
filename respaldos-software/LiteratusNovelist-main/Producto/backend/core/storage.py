"""
core/storage.py — Subida de archivos al bucket público de Supabase Storage.

Django guarda los archivos en MEDIA_ROOT (disco local), pero MEDIA_URL apunta al
bucket público 'literatus-media' de Supabase. Por eso cada archivo subido se copia
también al bucket con la misma ruta: así `archivo.url` funciona en producción, donde
el disco de Render se borra en cada reinicio.
"""
import os

import requests
from django.conf import settings

SUPABASE_BUCKET = 'literatus-media'


def upload_to_supabase_if_configured(file_data, upload_path, content_type, upsert=False):
    """
    Copia `file_data` a `literatus-media/<upload_path>` si SUPABASE_URL y SUPABASE_KEY
    están configurados. Retorna True solo si Supabase confirmó la subida.

    `upsert=True` reemplaza el archivo si ya existe en el bucket.
    """
    supabase_url = getattr(settings, 'SUPABASE_URL', os.getenv('SUPABASE_URL'))
    supabase_key = getattr(settings, 'SUPABASE_KEY', os.getenv('SUPABASE_KEY'))
    if not supabase_url or not supabase_key:
        return False

    url = f"{supabase_url}/storage/v1/object/{SUPABASE_BUCKET}/{upload_path}"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": content_type,
    }
    if upsert:
        headers["x-upsert"] = "true"

    try:
        response = requests.post(url, headers=headers, data=file_data, timeout=120)
    except requests.RequestException as e:
        print(f"Error subiendo a Supabase: {e}")
        return False

    if response.status_code not in (200, 201):
        print(f"Supabase rechazó la subida de {upload_path}: {response.status_code} {response.text[:200]}")
        return False
    return True
