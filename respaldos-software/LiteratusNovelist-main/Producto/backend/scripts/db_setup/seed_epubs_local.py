import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book, Chapter
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup
from django.conf import settings

def process_epub(epub_path, book_slug):
    if not os.path.exists(epub_path):
        print(f"Error: No se encontró el archivo {epub_path}")
        return

    book = Book.objects.filter(slug=book_slug).first()
    if not book:
        print(f"Error: Libro con slug '{book_slug}' no encontrado.")
        return

    print(f"\nProcesando {epub_path} para el libro '{book.title}'...")
    
    # Limpiar capítulos anteriores (los dummy)
    book.chapters.all().delete()

    try:
        book_epub = epub.read_epub(epub_path)
        
        # 1. Extraer imágenes
        book_media_dir = os.path.join(settings.MEDIA_ROOT, "book_images", book.slug)
        os.makedirs(book_media_dir, exist_ok=True)
        
        # Mapeo de href interno del epub -> URL pública
        image_map = {}
        for item in book_epub.get_items_of_type(ebooklib.ITEM_IMAGE):
            # item.file_name es la ruta interna (ej. "Images/image1.png" o "OEBPS/images/foto.jpg")
            file_name = item.file_name
            base_name = os.path.basename(file_name)
            
            # Guardar en disco
            dest_path = os.path.join(book_media_dir, base_name)
            with open(dest_path, "wb") as f:
                f.write(item.get_content())
                
            # La URL pública que Angular podrá leer
            public_url = f"{settings.MEDIA_URL}book_images/{book.slug}/{base_name}"
            
            # Mapear tanto la ruta completa como el base_name para mayor seguridad
            image_map[file_name] = public_url
            image_map[f"../{file_name}"] = public_url
            image_map[base_name] = public_url
            
        print(f"  - {len(image_map)//3} imágenes extraídas.")

        # 2. Extraer capítulos
        order = 0
        for item in book_epub.get_items_of_type(ebooklib.ITEM_DOCUMENT):
            name = item.get_name().lower()
            if 'cover' in name or 'titlepage' in name or 'nav' in name or 'toc' in name:
                continue
                
            content = item.get_body_content().decode('utf-8')
            soup = BeautifulSoup(content, 'html.parser')
            text_only = soup.get_text(separator=' ', strip=True)
            
            if len(text_only) > 100 or soup.find('img'):  # Ignorar secciones minúsculas sin imágenes
                title = f"Capítulo {order + 1}"
                # Intentar encontrar el título real
                for h_tag in ['h1', 'h2', 'h3']:
                    heading = soup.find(h_tag)
                    if heading and heading.text.strip():
                        title = heading.text.strip()
                        break
                
                # Reescribir las rutas de las imágenes
                for img in soup.find_all('img'):
                    src = img.get('src')
                    if src:
                        # Limpiar el src de posibles anclas o rutas complejas
                        clean_src = src.split('#')[0]
                        base_src = os.path.basename(clean_src)
                        
                        # Buscar en nuestro mapa de imágenes extraídas
                        if clean_src in image_map:
                            img['src'] = image_map[clean_src]
                        elif base_src in image_map:
                            img['src'] = image_map[base_src]
                        
                Chapter.objects.create(
                    book=book,
                    title=title[:200],
                    order=order,
                    content_html=str(soup) # Guardar el HTML modificado
                )
                print(f"  - Extraído {title} (orden {order})")
                order += 1
                
        print(f"Total capítulos extraídos: {order}")
    except Exception as e:
        print(f"Error parseando EPUB: {e}")

if __name__ == "__main__":
    base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "assets_to_import"))
    
    principito_path = os.path.join(base_path, "El_principito-Antoine_de_Saint-Exupery.epub")
    process_epub(principito_path, "el-principito")
    
    # El slug puede ser el-principe-feliz o el-principe-feliz-y-otros-cuentos
    principe_feliz_book = Book.objects.filter(title__icontains="Príncipe Feliz").first()
    if principe_feliz_book:
        principe_path = os.path.join(base_path, "El_principe_feliz_y_otros_cuentos-Wilde_Oscar.epub")
        process_epub(principe_path, principe_feliz_book.slug)
    else:
        print("No se encontró el libro El Príncipe Feliz en la BD.")
