import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book
book = Book.objects.filter(title__icontains='dracula').first()
if not book:
    book = Book.objects.filter(title__icontains='frankenstein').first()

if book:
    book.min_age = 18
    book.save(update_fields=['min_age'])
    print(f"Mejor opción modificada: {book.title} (slug: {book.slug}) - min_age={book.min_age}")
else:
    print("No se encontró otra opción temática.")
