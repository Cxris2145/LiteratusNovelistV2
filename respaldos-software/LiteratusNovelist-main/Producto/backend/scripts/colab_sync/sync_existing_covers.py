import os
import sys
import django
from pathlib import Path

# Setup Django Environment
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book

def main():
    print("--- SCANNING AND SYNCING PORTADAS IN MEDIA/BOOKS/* ---")
    books_dir = Path("media/books")
    if not books_dir.exists():
        print("No media/books/ directory found.")
        return

    updated_count = 0
    for book_folder in books_dir.iterdir():
        if book_folder.is_dir():
            slug = book_folder.name
            
            # Check for cover.jpg, cover.jpeg, cover.webp, cover.png
            cover_path = None
            for ext in ['.jpg', '.jpeg', '.webp', '.png']:
                test_path = book_folder / f"cover{ext}"
                if test_path.exists():
                    cover_path = f"books/{slug}/cover{ext}"
                    break
                    
            if cover_path:
                if len(cover_path) > 100:
                    print(f"WARN: Saltando {slug} (Ruta muy larga: {len(cover_path)} caracteres)")
                    continue
                book = Book.objects.filter(slug=slug).first()
                if book:
                    # Only save if it has changed
                    if book.cover_image != cover_path:
                        book.cover_image = cover_path
                        book.save(update_fields=['cover_image'])
                        print(f"Vinculado {slug} -> {cover_path}")
                        updated_count += 1

    print(f"Portadas vinculadas en base de datos: {updated_count}")

if __name__ == "__main__":
    main()
