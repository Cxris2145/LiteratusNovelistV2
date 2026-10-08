"""Mantiene +18 al importar o asignar géneros eróticos a nuevas obras."""
import uuid
from django.core.cache import cache
from django.db import transaction
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver
from .models import Book
from .age_classification import adult_rating_reason


def invalidate_age_catalog():
    cache.set('catalog:age:revision', uuid.uuid4().hex, None)


@receiver(post_save, sender=Book)
def book_changed(sender, instance, **kwargs):
    transaction.on_commit(invalidate_age_catalog)


@receiver(m2m_changed, sender=Book.genres.through)
def classify_erotic_genres(sender, instance, action, reverse, pk_set, using, **kwargs):
    if action != 'post_add' or not pk_set:
        return
    books = Book.objects.using(using).filter(pk__in=pk_set) if reverse else [instance]
    for book in books:
        genres = [g.slug for g in book.genres.all()] + [g.name for g in book.genres.all()]
        if adult_rating_reason(book.slug, book.title, genres) and book.min_age < 18:
            Book.objects.using(using).filter(pk=book.pk, min_age__lt=18).update(min_age=18)
            book.min_age = 18
    transaction.on_commit(invalidate_age_catalog, using=using)
