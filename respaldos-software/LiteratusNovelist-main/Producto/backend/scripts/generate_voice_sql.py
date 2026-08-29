import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from ai_engine.models import AIAvatar
print('-- Script SQL de referencia para poblar kokoro_voice_id en Supabase')
print('-- Generado automaticamente. Ejecutar en el SQL Editor de Supabase.')
print()
for a in AIAvatar.objects.all().order_by('name'):
    safe_name = a.name.replace("'", "''")
    print(f"UPDATE ai_engine_aiavatar SET kokoro_voice_id = '{a.kokoro_voice_id}' WHERE id = '{a.id}'; -- {safe_name}")
