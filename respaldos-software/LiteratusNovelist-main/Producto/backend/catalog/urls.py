"""
catalog/urls.py — Enrutador DRF
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BookViewSet, AuthorViewSet, GenreViewSet, CatalogStatsView,
    AuthorSubmitBookView, AuthorMySubmissionsView, AuthorSubmissionRequirementsView, AutocompleteView
)

router = DefaultRouter()
# /api/v1/catalog/authors/
router.register(r'authors', AuthorViewSet, basename='author')
# /api/v1/catalog/books/
router.register(r'books', BookViewSet, basename='book')
# /api/v1/catalog/genres/
router.register(r'genres', GenreViewSet, basename='genre')

urlpatterns = [
    # ─── Portal de Autores / Envío de Obras ───
    path('author/submit-book/', AuthorSubmitBookView.as_view(), name='author-submit-book'),
    path('author/my-submissions/', AuthorMySubmissionsView.as_view(), name='author-my-submissions'),
    path('author/requirements/', AuthorSubmissionRequirementsView.as_view(), name='author-requirements'),

    # /api/v1/catalog/stats/  → conteos en vivo del catálogo
    path('autocomplete/', AutocompleteView.as_view(), name='catalog-autocomplete'),
    path('stats/', CatalogStatsView.as_view(), name='catalog-stats'),
    path('', include(router.urls)),
]
