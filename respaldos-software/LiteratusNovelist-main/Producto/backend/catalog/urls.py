"""
catalog/urls.py — Enrutador DRF
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BookViewSet, AuthorViewSet, GenreViewSet

router = DefaultRouter()
# /api/v1/catalog/authors/
router.register(r'authors', AuthorViewSet, basename='author')
# /api/v1/catalog/books/
router.register(r'books', BookViewSet, basename='book')
# /api/v1/catalog/genres/
router.register(r'genres', GenreViewSet, basename='genre')

urlpatterns = [
    path('', include(router.urls)),
]
