"""
library/urls.py — Enrutador DRF para Biblioteca Personal
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserFavoriteViewSet,
    UserInventoryViewSet,
    ReadingProgressViewSet,
    UserBookmarkViewSet,
    AchievementCatalogViewSet,
    UserAchievementViewSet,
    ReadingSessionViewSet,
)

router = DefaultRouter()
# /api/v1/library/inventory/
router.register(r'inventory', UserInventoryViewSet, basename='inventory')
# /api/v1/library/progress/
router.register(r'progress', ReadingProgressViewSet, basename='progress')
# /api/v1/library/bookmarks/
router.register(r'bookmarks', UserBookmarkViewSet, basename='bookmark')
# /api/v1/library/favorites/
router.register(r'favorites', UserFavoriteViewSet, basename='favorite')
# /api/v1/library/achievements/catalog/
router.register(r'achievements/catalog', AchievementCatalogViewSet, basename='achievement-catalog')
# /api/v1/library/achievements/me/ + /api/v1/library/achievements/me/unnotified/
router.register(r'achievements/me', UserAchievementViewSet, basename='user-achievement')
# /api/v1/library/sessions/
router.register(r'sessions', ReadingSessionViewSet, basename='reading-session')

urlpatterns = [
    path('', include(router.urls)),
]
