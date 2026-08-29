import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import json

# Configurar Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

# Importar dependencias
import imageio_ffmpeg
from faster_whisper import WhisperModel
from catalog.models import Chapter, ChapterAudio

# 1. Inyectar FFmpeg local en el PATH para que faster-whisper pueda usarlo
ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
ffmpeg_dir = os.path.dirname(ffmpeg_exe)
os.environ["PATH"] += os.pathsep + ffmpeg_dir

print(f"-> FFmpeg local inyectado desde: {ffmpeg_exe}")

def interpolate_word_to_char(words):
    """
    Convierte timestamps a nivel de palabra en timestamps a nivel de caracter
    mediante interpolación lineal.
    """
    characters = []
    starts = []
    ends = []
    
    for word_info in words:
        word_text = word_info.word
        start_t = word_info.start
        end_t = word_info.end
        
        char_count = len(word_text)
        if char_count == 0:
            continue
            
        duration = end_t - start_t
        time_per_char = duration / char_count
        
        for i, char in enumerate(word_text):
            characters.append(char)
            starts.append(round(start_t + (i * time_per_char), 3))
            ends.append(round(start_t + ((i + 1) * time_per_char), 3))
            
    return {
        "characters": characters,
        "character_start_times_seconds": starts,
        "character_end_times_seconds": ends
    }

def process_chapter_audio(chapter_order, audio_file_path, voice_name):
    chapter = Chapter.objects.filter(book__title__icontains='Principito', order=chapter_order).first()
    if not chapter:
        print(f"-> Capitulo con order={chapter_order} no encontrado.")
        return
        
    full_audio_path = os.path.join(django.conf.settings.MEDIA_ROOT, audio_file_path)
    if not os.path.exists(full_audio_path):
        print(f"-> Archivo de audio no encontrado: {full_audio_path}")
        return

    print(f"\n-> Procesando {audio_file_path} para '{chapter.title}'...")
    
    # 2. Cargar modelo optimizado
    print("Cargando modelo Whisper (base, int8)...")
    model = WhisperModel("base", device="cpu", compute_type="int8")
    
    # 3. Transcribir
    print("Transcribiendo y extrayendo timestamps...")
    segments, info = model.transcribe(full_audio_path, word_timestamps=True, language="es")
    
    words_data = []
    for segment in segments:
        words_data.extend(segment.words)
        
    print(f"Transcodificadas {len(words_data)} palabras.")
    
    # 4. Interpolación a caracteres
    alignment = interpolate_word_to_char(words_data)
    
    # 5. Guardar en Base de Datos
    audio_record, created = ChapterAudio.objects.update_or_create(
        chapter=chapter,
        voice_name=voice_name,
        defaults={
            "audio_file": audio_file_path,
            "alignment_data": alignment
        }
    )
    
    estado = "creado" if created else "actualizado"
    print(f"-> Sincronizacion completa. ChapterAudio {estado}.")

if __name__ == "__main__":
    # Procesar capítulos 3 a 9 (orders 4 a 10)
    for i in range(3, 10):
        process_chapter_audio(
            chapter_order=i + 1, # Order is usually i + 1 (Cap 3 = order 4)
            audio_file_path=f"audio_narrations/principito/cap{i}.wav",
            voice_name="Carito (Demo Local Whisper)"
        )
