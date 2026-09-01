import os
import sys
import django
from pathlib import Path

# Fix python path to allow importing django config correctly
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book, Author
from ai_engine.models import AIAvatar

def main():
    print("--- ANALIZANDO IMAGENES EN BASE DE DATOS LOCAL ---")
    
    # Check Book covers
    books_with_covers = Book.objects.exclude(cover_image='')
    print(f"Libros con portada registrada en la BD: {books_with_covers.count()}")
    for book in books_with_covers[:5]:
        print(f" - Book: {book.title} | Cover: {book.cover_image}")
        
    # Check Author photos
    authors_with_photos = Author.objects.exclude(photo='')
    print(f"Autores con foto registrada en la BD: {authors_with_photos.count()}")
    for author in authors_with_photos[:5]:
        print(f" - Author: {author.full_name} | Photo: {author.photo}")
        
    # Check AI Avatars images and videos
    avatars = AIAvatar.objects.all()
    print(f"Avatares de IA en la BD: {avatars.count()}")
    for avatar in avatars:
        print(f" - Avatar: {avatar.name} | Image: {avatar.avatar_image} | Video: {avatar.video_avatar}")

if __name__ == "__main__":
    main()
