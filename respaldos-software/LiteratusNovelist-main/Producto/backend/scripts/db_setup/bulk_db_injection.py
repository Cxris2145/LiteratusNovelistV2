"""
Script de Inyección Masiva de Base de Datos (bulk_db_injection.py)
------------------------------------------------------------------
Propósito:
    Este script se utiliza para poblar la base de datos de LiteratusNovelist escaneando 
    un directorio que contiene archivos EPUB (libros). Se encarga de crear Autores, 
    Libros y Capítulos, extrayendo el contenido y los metadatos desde los EPUBs.

Modificación (Mayo 2026):
    Se actualizó la lógica de extracción de títulos y autores. Anteriormente, el script 
    extraía el nombre del libro y el autor basándose únicamente en el nombre de la 
    carpeta del EPUB (lo cual unía "Título Autor" en el título). Ahora, el script intenta 
    leer el archivo de metadatos interno del EPUB (`.opf`) para extraer limpiamente el 
    Título y el Autor por separado. Si no encuentra el OPF, utiliza expresiones regulares 
    de respaldo para separar nombres.
"""
import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import sys
import json
import traceback
import zipfile
import re
import shutil
from pathlib import Path
from decimal import Decimal
from bs4 import BeautifulSoup

# Configurar entorno Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book, Author, BookAuthor, Edition, Genre, Chapter
from ebooklib import epub
import ebooklib

LOG_FILE = "errores_inyeccion.txt"

def log_error(slug, message, detail=None):
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"--- ERROR EN: {slug} ---\n")
        f.write(f"MENSAJE: {message}\n")
        if detail: f.write(f"DETALLE: {detail}\n")
        f.write("-" * 30 + "\n\n")

def slugify_fallback(text):
    text = str(text).lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')[:100]

def clean_content(html_soup, book_slug):
    spam_patterns = [
        r"¡Gracias por leer este libro de www\.elejandria\.com!",
        r"Descargado de www\.elejandria\.com",
        r"www\.elejandria\.com",
        r"Lectulandia",
        r"www\.lectulandia\.com"
    ]
    for img in html_soup.find_all('img'):
        src = img.get('src', '')
        if 'elejandria' in src.lower() or 'logo' in src.lower():
            img.decompose()
            continue
        filename = os.path.basename(src)
        img['src'] = f"/media/books/{book_slug}/images/{filename}"
        img['style'] = "max-width: 100%; height: auto; display: block; margin: 1em auto; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);"

    html_str = str(html_soup)
    for pattern in spam_patterns:
        html_str = re.sub(pattern, "", html_str, flags=re.IGNORECASE)
    return html_str

def extract_images(epub_path, dest_folder):
    img_folder = Path(dest_folder) / "images"
    img_folder.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(epub_path, 'r') as z:
            for f in z.infolist():
                if f.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                    if 'elejandria' not in f.filename.lower():
                        dest = img_folder / os.path.basename(f.filename)
                        with z.open(f) as s, open(dest, "wb") as t: shutil.copyfileobj(s, t)
    except: pass

def get_structural_chapters(book_epub, book_slug):
    chapters_data = []
    def walk_toc(items):
        for item in items:
            if isinstance(item, tuple): walk_toc(item)
            elif isinstance(item, epub.Link):
                import urllib.parse
                href_parts = item.href.split('#')
                file_name = urllib.parse.unquote(href_parts[0])
                anchor = href_parts[1] if len(href_parts) > 1 else None
                doc = book_epub.get_item_with_href(file_name)
                if not doc: continue
                soup = BeautifulSoup(doc.get_content(), 'html.parser')
                content_html = ""
                if anchor:
                    start_node = soup.find(id=anchor) or soup.find(attrs={"name": anchor})
                    if start_node:
                        payload = []
                        curr = start_node
                        while curr:
                            payload.append(str(curr))
                            curr = curr.next_sibling
                            if curr and hasattr(curr, 'get') and (curr.get('id') or curr.get('name')): break
                        content_html = "".join(payload)
                if not content_html: content_html = str(soup.body) if soup.body else str(soup)
                chapters_data.append({
                    'title': item.title[:200],
                    'content': clean_content(BeautifulSoup(content_html, 'html.parser'), book_slug),
                    'order': len(chapters_data) + 1
                })
            elif hasattr(item, 'links'): walk_toc(item.links)
    walk_toc(book_epub.toc)
    return chapters_data

def manual_extract_chapters(epub_path, slug):
    chapters = []
    try:
        with zipfile.ZipFile(epub_path, 'r') as z:
            container = z.read('META-INF/container.xml').decode('utf-8')
            opf_path = re.search(r'full-path="([^"]+)"', container).group(1)
            opf_content = z.read(opf_path).decode('utf-8', errors='ignore')
            base_dir = os.path.dirname(opf_path)
            manifest = {re.search(r'id="([^"]+)"', line).group(1): re.search(r'href="([^"]+)"', line).group(1) 
                        for line in opf_content.split('<item ') if 'id="' in line and 'href="' in line}
            spine_ids = [re.search(r'idref="([^"]+)"', line).group(1) 
                         for line in opf_content.split('<itemref ') if 'idref="' in line]
            order = 1
            for item_id in spine_ids:
                if item_id in manifest:
                    file_path = os.path.join(base_dir, manifest[item_id]).replace("\\", "/")
                    try:
                        raw_html = z.read(file_path).decode('utf-8', errors='ignore')
                        soup = BeautifulSoup(raw_html, 'html.parser')
                        if len(soup.get_text().strip()) > 100:
                            chapters.append({
                                'title': (soup.find(['h1', 'h2']) or soup).text.strip()[:100],
                                'content': clean_content(soup, slug),
                                'order': order
                            }); order += 1
                    except: continue
    except Exception as e: raise Exception(f"Manual falló: {e}")
    return chapters

def get_metadata_from_opf(epub_path):
    try:
        with zipfile.ZipFile(epub_path, 'r') as z:
            container = z.read('META-INF/container.xml').decode('utf-8')
            opf_path = re.search(r'full-path="([^"]+)"', container).group(1)
            opf_content = z.read(opf_path).decode('utf-8', errors='ignore')
            
            title_match = re.search(r'<dc:title[^>]*>(.*?)</dc:title>', opf_content, re.DOTALL | re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else None
            
            creator_match = re.search(r'<dc:creator[^>]*>(.*?)</dc:creator>', opf_content, re.DOTALL | re.IGNORECASE)
            creator = creator_match.group(1).strip() if creator_match else None
            
            if title:
                title = re.sub(r'<[^>]+>', '', title).strip()
            if creator:
                creator = re.sub(r'<[^>]+>', '', creator).strip()
                
            return title, creator
    except:
        return None, None

def main():
    books_dir = Path("media/books")
    if os.path.exists(LOG_FILE): os.remove(LOG_FILE)
    print(f"--- 📚 INYECCION MAESTRA (SIN PORTADAS EXTERNAS) ---")
    folders = [f for f in books_dir.iterdir() if f.is_dir()]
    for i, folder in enumerate(folders):
        slug = folder.name
        epub_files = list(folder.glob("*.epub"))
        if not epub_files: continue
        epub_path = epub_files[0]
        try:
            extract_images(epub_path, folder)
            book_title, author_name = get_metadata_from_opf(epub_path)
            
            try:
                book_epub = epub.read_epub(epub_path)
                if not author_name:
                    creators = book_epub.get_metadata('DC', 'creator')
                    author_name = str(creators[0][0]) if creators and isinstance(creators[0], tuple) else None
                if not book_title:
                    titles = book_epub.get_metadata('DC', 'title')
                    book_title = str(titles[0][0]) if titles and isinstance(titles[0], tuple) else None
                chapters_data = get_structural_chapters(book_epub, slug)
            except Exception:
                chapters_data = manual_extract_chapters(epub_path, slug)

            if not author_name:
                author_name = "Autor Desconocido"
            if not book_title:
                book_title = slug.replace("-", " ").title()

            if not chapters_data: continue

            author_obj, _ = Author.objects.get_or_create(slug=slugify_fallback(author_name), defaults={'full_name': author_name[:100]})
            book_obj, _ = Book.objects.get_or_create(slug=slug[:100], defaults={'title': book_title[:100], 'status':'published', 'is_published':True})
            
            BookAuthor.objects.get_or_create(book=book_obj, author=author_obj)
            Edition.objects.get_or_create(book=book_obj, format='epub', defaults={'file': f"books/{slug}/{epub_path.name}", 'price': Decimal('0.00')})

            book_obj.chapters.all().delete()
            for chap in chapters_data:
                if chap['order'] == 1 and chap['content'].count('<img') == 1 and len(chap['content']) < 500: continue
                Chapter.objects.create(book=book_obj, title=chap['title'], content_html=chap['content'], order=chap['order'])

            if i % 20 == 0: print(f"[{i}/{len(folders)}] OK: {slug}")
        except Exception as e:
            log_error(slug, "Error fatal", traceback.format_exc())

    sync_categories()
    print(f"\n✅ TERMINADO. Contenido inyectado sin portadas de terceros.")

def sync_categories():
    json_path = Path("json_data/elejandria_master.json")
    if not json_path.exists(): return
    with open(json_path, 'r', encoding='utf-8') as f:
        master_map = json.load(f)
    for cat_name, slugs in master_map.items():
        genre, _ = Genre.objects.get_or_create(name=cat_name.strip())
        for s in slugs:
            b = Book.objects.filter(slug=s[:100]).first()
            if b: b.genres.add(genre)

if __name__ == "__main__":
    main()
