import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Chapter, ChapterAudio

# Cap 1 del Principito (order=2 en este caso)
chapter = Chapter.objects.filter(book__title__icontains='Principito', order=2).first()

if chapter:
    # Texto de los primeros párrafos para el alignment de prueba
    text = "Cuando tenía seis años vi, una vez, una imagen magnífica en un libro sobre la selva virgen titulado Historias vividas. "
    text += "Representaba a una serpiente boa tragándose a una fiera. He aquí la copia del dibujo. "
    text += "En el libro se decía: \"Las serpientes boas tragan a su presa entera, sin masticarla. Luego ya no pueden moverse y duermen durante los seis meses que dura su digestión.\""

    chars = list(text)
    # Estimación simple: ~12 caracteres por segundo
    starts = [round(i * 0.085, 3) for i in range(len(chars))]
    ends = [round(i * 0.085 + 0.08, 3) for i in range(len(chars))]
    
    alignment = {
        "characters": chars,
        "character_start_times_seconds": starts,
        "character_end_times_seconds": ends
    }
    
    # Crear el registro en ChapterAudio para vincularlo con el archivo físico que ya existe
    audio, created = ChapterAudio.objects.update_or_create(
        chapter=chapter,
        voice_name="Carito (Demo Local)",
        defaults={
            "audio_file": "audio_narrations/principito/cap_1_voz_caro.mp3",
            "alignment_data": alignment
        }
    )
    print(f"✅ ChapterAudio {'creado' if created else 'actualizado'} para '{chapter.title}'")
    print(f"   Archivo: {audio.audio_file}")
else:
    print("❌ No se encontró el Capítulo I del Principito para vincular el audio.")
