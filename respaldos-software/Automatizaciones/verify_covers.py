"""
verify_covers.py — Verificación y auditoría de todas las portadas en BD, disco y API.
"""
import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

sys.path.insert(0, r"c:\Users\guerr\Downloads\LiteratusNovelist\respaldos-software\LiteratusNovelist-main\Producto\backend")
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.conf import settings
if 'testserver' not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS.append('testserver')

from catalog.models import Book
from PIL import Image
from rest_framework.test import APIRequestFactory
from catalog.serializers import BookListSerializer

total_books = Book.objects.count()
missing_covers = 0
invalid_dims = 0
invalid_formats = 0
missing_files = 0

print("=" * 80)
print("AUDITORIA COMPLETA DE PORTADAS — LITERATUS NOVELIST")
print("=" * 80)
print(f"Total de libros en BD: {total_books}\n")

for book in Book.objects.all().order_by('slug'):
    authors = ', '.join([a.full_name for a in book.authors.all()])
    if not book.cover_image:
        print(f"[ERROR] Sin portada en BD: {book.title} ({book.slug})")
        missing_covers += 1
        continue
    
    file_path = book.cover_image.path
    if not os.path.exists(file_path):
        print(f"[ERROR] Archivo no existe en disco: {file_path} para {book.title}")
        missing_files += 1
        continue
        
    with Image.open(file_path) as img:
        w, h = img.size
        fmt = img.format
        if (w, h) != (600, 900):
            print(f"[ERROR] Dimensiones incorrectas ({w}x{h}): {book.title}")
            invalid_dims += 1
        if fmt != "WEBP":
            print(f"[ERROR] Formato incorrecto ({fmt}): {book.title}")
            invalid_formats += 1
        size_kb = os.path.getsize(file_path) / 1024
        print(f"  [OK] {book.title:<42} | {authors:<30} | {w}x{h} {fmt} | {size_kb:.1f} KB")

print("\n" + "=" * 80)
print("RESULTADOS DE LA AUDITORIA")
print("=" * 80)
print(f"✓ Libros sin portada en BD       : {missing_covers}")
print(f"✓ Archivos faltantes en disco    : {missing_files}")
print(f"✓ Dimensiones invalidas          : {invalid_dims}")
print(f"✓ Formatos invalidos             : {invalid_formats}")
print("=" * 80)

# Verificación de endpoints API
factory = APIRequestFactory()
request = factory.get("/api/catalog/books/")
serializer = BookListSerializer(Book.objects.all(), many=True, context={"request": request})
print(f"\n[API TEST] Serializados correctamente {len(serializer.data)} libros para el catalogo.")
for item in serializer.data[:3]:
    print(f"  • {item['title']}: {item.get('cover_image')}")
