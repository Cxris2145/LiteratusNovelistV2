import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import shutil
from pathlib import Path

# Configurar entorno Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book

def main():
    # Carpeta donde descomprimiste las fotos de Colab
    source_folder = Path("covers_descargadas") 
    
    if not source_folder.exists():
        print(f"Error: Crea la carpeta '{source_folder}' y mete los JPG ahí.")
        return

    print("--- 📥 SINCRONIZANDO PORTADAS GENERADAS ---")
    
    for img_path in source_folder.glob("*.jpg"):
        slug = img_path.stem # El nombre del archivo sin .jpg
        
        book = Book.objects.filter(slug=slug).first()
        if book:
            # Ruta de destino: media/books/slug/cover.jpg
            dest_dir = Path(f"media/books/{slug}")
            dest_dir.mkdir(parents=True, exist_ok=True)
            
            dest_path = dest_dir / "cover.jpg"
            shutil.copy(img_path, dest_path)
            
            # Actualizar DB
            book.cover_image = f"books/{slug}/cover.jpg"
            book.save()
            print(f"✅ Portada vinculada: {slug}")
        else:
            print(f"⚠️ No se encontró el libro para: {slug}")

if __name__ == "__main__":
    main()
