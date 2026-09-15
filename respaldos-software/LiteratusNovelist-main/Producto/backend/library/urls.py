"""
library/urls.py — Enrutador DRF para Biblioteca Personal
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserFavoriteViewSet, UserInventoryViewSet, ReadingProgressViewSet, UserBookmarkViewSet

router = DefaultRouter()
# /api/v1/library/inventory/
router.register(r'inventory', UserInventoryViewSet, basename='inventory')
# /api/v1/library/progress/
router.register(r'progress', ReadingProgressViewSet, basename='progress')
# /api/v1/library/bookmarks/
router.register(r'bookmarks', UserBookmarkViewSet, basename='bookmark')
# /api/v1/library/favorites/
router.register(r'favorites', UserFavoriteViewSet, basename='favorite')

urlpatterns = [
    path('', include(router.urls)),
]
