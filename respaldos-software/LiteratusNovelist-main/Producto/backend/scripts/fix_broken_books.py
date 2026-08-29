import os
import sys
import django
import zipfile
import re
from pathlib import Path
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup
from django.db.models import Max, Count
from django.db.models.functions import Length

# Configurar entorno Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from catalog.models import Book, Chapter, Edition

def clean_content(html_soup, book_slug):
    spam_patterns = [
        r'¡Gracias por leer este libro.*',
        r'Descargado de.*',
        r'www\.elejandria\.com',
        r'Lectulandia',
        r'www\.lectulandia\.com',
        r'Descubre nuestra colecci.*',
        r'Si quieres mas libros.*',
        r'Libro descargado en.*'
    ]
    
    # Eliminar bloques de spam
    for tag in html_soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'div']):
        text = tag.get_text().strip()
        for pat in spam_patterns:
            if re.search(pat, text, re.IGNORECASE):
                tag.decompose()
                break

    # Arreglar imagenes
    for img in html_soup.find_all('img'):
        src = img.get('src', '')
        if 'elejandria' in src.lower() or 'logo' in src.lower():
            img.decompose()
            continue
            
        filename = os.path.basename(src.split('#')[0].split('?')[0])
        img['src'] = f"/media/books/{book_slug}/images/{filename}"
        img['style'] = "max-width: 100%; height: auto; display: block; margin: 1em auto; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);"

    return html_soup

def extract_chapters_from_spine(epub_path, book_slug):
    try:
        book_epub = epub.read_epub(epub_path)
    except Exception as e:
        print(f"Error abriendo EPUB: {e}")
        return []

    chapters_data = []
    order = 1
    
    for item_id, linear in book_epub.spine:
        item = book_epub.get_item_with_id(item_id)
        if not item or not isinstance(item, ebooklib.epub.EpubHtml):
            continue
            
        name = item.get_name().lower()
        if 'cover' in name or 'titlepage' in name:
            continue

        raw_html = item.get_content().decode('utf-8', errors='ignore')
        soup = BeautifulSoup(raw_html, 'html.parser')
        
        # Check text length to avoid empty/dummy chapters
        text_only = soup.get_text(separator=' ', strip=True)
        if len(text_only) > 100 or soup.find('img'):
            clean_soup = clean_content(soup, book_slug)
            
            title = f"Capítulo {order}"
            for h_tag in ['h1', 'h2', 'h3']:
                heading = clean_soup.find(h_tag)
                if heading and heading.text.strip():
                    title = heading.text.strip()[:200]
                    break
                    
            chapters_data.append({
                'title': title,
                'content_html': str(clean_soup),
                'order': order
            })
            order += 1
            
    return chapters_data


def fix_broken_books():
    print("Identificando libros rotos...")
    
    books_with_max_len = Book.objects.annotate(
        max_chapter_len=Max(Length('chapters__content_html')),
        chapter_count=Count('chapters')
    )

    broken_books = books_with_max_len.filter(max_chapter_len__lt=600) | books_with_max_len.filter(chapter_count=0)
    broken_list = list(broken_books.distinct())
    
    print(f"Total libros a reparar: {len(broken_list)}")
    
    fixed_count = 0
    error_count = 0
    
    for i, book in enumerate(broken_list):
        edition = book.editions.filter(format='epub').first()
        if not edition or not edition.file:
            print(f"[{i+1}/{len(broken_list)}] {book.title} - NO TIENE EPUB ASOCIADO")
            error_count += 1
            continue
            
        epub_path = edition.file.path
        if not os.path.exists(epub_path):
            print(f"[{i+1}/{len(broken_list)}] {book.title} - ARCHIVO EPUB NO EXISTE ({epub_path})")
            error_count += 1
            continue
            
        chapters_data = extract_chapters_from_spine(epub_path, book.slug)
        
        if chapters_data:
            # Borrar capitulos antiguos
            book.chapters.all().delete()
            
            # Crear nuevos
            Chapter.objects.bulk_create([
                Chapter(book=book, title=c['title'], content_html=c['content_html'], order=c['order'])
                for c in chapters_data
            ])
            
            print(f"[{i+1}/{len(broken_list)}] OK {book.title} reparado ({len(chapters_data)} capitulos).")
            fixed_count += 1
        else:
            print(f"[{i+1}/{len(broken_list)}] ERR {book.title} - EPUB sin contenido legible en el spine.")
            error_count += 1

    print("\n--- RESUMEN ---")
    print(f"Reparados: {fixed_count}")
    print(f"Fallidos: {error_count}")


if __name__ == '__main__':
    fix_broken_books()
