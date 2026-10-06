import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book
book = Book.objects.filter(slug='los-persas-esquilo').first()
if book:
    book.min_age = 0
    book.save(update_fields=['min_age'])
