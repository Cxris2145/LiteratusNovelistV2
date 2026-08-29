"""
Script de Limpieza de Títulos de Libros (clean_book_titles.py)
--------------------------------------------------------------
Propósito:
    Este script se utiliza para corregir (limpiar) los títulos de los libros ya existentes 
    en la base de datos de LiteratusNovelist. Se creó de manera puntual para solucionar 
    un problema en el que los títulos de los libros incluían incorrectamente el nombre 
    del autor al final.

Modo de Acción (Mayo 2026):
    El script itera sobre todos los objetos `Book` en la base de datos. Para cada uno, 
    busca su archivo `.epub` correspondiente, extrae el título correcto directamente 
    del archivo de metadatos interno (`.opf`), y actualiza el registro en la base 
    de datos sin alterar otros campos. Es idempotente (se puede ejecutar varias veces 
    sin dañar los datos ya corregidos).
"""
import os
import sys
from pathlib import Path
import re
import zipfile
import django

# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Configurar el entorno de Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book

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

def run():
    print("Iniciando la limpieza de títulos de libros en la base de datos...")
    books = Book.objects.all()
    updated_count = 0
    skipped_count = 0
    
    # Ruta relativa al directorio backend
    books_dir = Path("media/books")
    
    for book in books:
        slug = book.slug
        folder = books_dir / slug
        if not folder.exists():
            # Si es el libro de prueba o similar, podría no existir
            skipped_count += 1
            continue
            
        epub_files = list(folder.glob("*.epub"))
        if not epub_files:
            skipped_count += 1
            continue
            
        epub_path = epub_files[0]
        title, _ = get_metadata_from_opf(epub_path)
        
        if title:
            cleaned_title = title[:100]
            if book.title != cleaned_title:
                print(f"Actualizando: '{book.title}' -> '{cleaned_title}' (slug: {slug})")
                book.title = cleaned_title
                book.save(update_fields=['title'])
                updated_count += 1
        else:
            skipped_count += 1
            
    print(f"Limpieza finalizada. Actualizados: {updated_count}, Omitidos/Sin cambios: {skipped_count}")

if __name__ == '__main__':
    run()
