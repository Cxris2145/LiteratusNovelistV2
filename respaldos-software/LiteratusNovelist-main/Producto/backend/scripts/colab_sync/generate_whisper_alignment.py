import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import json
import argparse
import sys
import re

# Añadir FFmpeg de Winget al PATH dinámicamente para que no falle en terminales sin reiniciar
winget_path = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'WinGet', 'Links')
if winget_path not in os.environ.get('PATH', ''):
    os.environ['PATH'] = f"{winget_path};{os.environ.get('PATH', '')}"

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Chapter, ChapterAudio
from django.conf import settings

def process_file(mp3_path, chapter, voice_name, model):
    print(f"\nProcesando: {os.path.basename(mp3_path)} -> Capítulo '{chapter.title}' (Orden: {chapter.order})")
    
    # Transcribir extrayendo timestamps por palabra
    result = model.transcribe(mp3_path, word_timestamps=True, language="es")

    chars = []
    starts = []
    ends = []

    for segment in result.get("segments", []):
        for word_info in segment.get("words", []):
            word_text = word_info["word"] + " " # Agregamos espacio al final
            word_start = word_info["start"]
            word_end = word_info["end"]
            
            num_chars = len(word_text)
            time_per_char = (word_end - word_start) / num_chars if num_chars > 0 else 0

            for i, char in enumerate(word_text):
                chars.append(char)
                starts.append(round(word_start + (i * time_per_char), 3))
                ends.append(round(word_start + ((i + 1) * time_per_char), 3))

    alignment = {
        "characters": chars,
        "character_start_times_seconds": starts,
        "character_end_times_seconds": ends
    }

    # Ruta relativa para la BD (ej. audio_narrations/...)
    rel_path = os.path.relpath(mp3_path, settings.MEDIA_ROOT).replace('\\', '/')

    audio_obj, created = ChapterAudio.objects.update_or_create(
        chapter=chapter,
        voice_name=voice_name,
        defaults={
            "audio_file": rel_path,
            "alignment_data": alignment
        }
    )

    print(f"Exito! Guardado en BD con {len(chars)} caracteres.")

def main():
    parser = argparse.ArgumentParser(description="Genera alignment_data masivo para una carpeta de MP3s.")
    parser.add_argument('--book', type=str, required=True, help="Slug o fragmento del titulo del libro (ej: principito, jekyll, principe)")
    parser.add_argument('--folder', type=str, required=True, help="Ruta de la carpeta dentro de media (ej: audio_narrations/El_extrano_caso)")
    parser.add_argument('--voice-name', type=str, default="Audio Original", help="Nombre de la voz")
    parser.add_argument('--offset', type=int, default=0, help="Desfase entre el numero del MP3 y el orden del capitulo en BD (ej: si Capitulo_01.mp3 es el order=2, offset=1)")

    args = parser.parse_args()

    try:
        import whisper
    except ImportError:
        print("Error: openai-whisper no esta instalado. Instala con: pip install openai-whisper")
        sys.exit(1)

    folder_path = os.path.join(settings.MEDIA_ROOT, args.folder)
    if not os.path.isdir(folder_path):
        print(f"Error: No se encontró la carpeta en: {folder_path}")
        sys.exit(1)

    mp3_files = [f for f in os.listdir(folder_path) if f.lower().endswith('.mp3')]
    if not mp3_files:
        print(f"Error: No se encontraron archivos MP3 en {folder_path}")
        sys.exit(1)

    print("Cargando modelo Whisper... (esto puede tardar unos segundos)")
    model = whisper.load_model("base")

    mp3_files.sort() # Capitulo_01.mp3, Capitulo_02.mp3...
    
    for filename in mp3_files:
        mp3_path = os.path.join(folder_path, filename)
        
        # Extraer el numero del archivo
        match = re.search(r'(\d+)', filename)
        if not match:
            print(f"Saltando {filename}: No se encontro un numero en el nombre del archivo.")
            continue
            
        num_in_file = int(match.group(1))
        target_order = num_in_file + args.offset
        
        chapter = Chapter.objects.filter(book__slug__icontains=args.book, order=target_order).first()
        if not chapter:
            chapter = Chapter.objects.filter(book__title__icontains=args.book, order=target_order).first()
            
        if not chapter:
            print(f"Advertencia: No se encontro el capitulo order={target_order} en la BD para el archivo {filename}.")
            continue
            
        process_file(mp3_path, chapter, args.voice_name, model)

    print("\nPROCESO POR CARPETA FINALIZADO CORRECTAMENTE.")

if __name__ == "__main__":
    main()
