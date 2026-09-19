"""
learning/urls.py — Enrutador DRF para Senda de Aprendizaje, Comprensión Lectora y Bazar.
"""

from django.urls import path
from .views import (
    LearningPathView,
    LevelSessionView,
    LevelSubmitView,
    StreakStatusView,
    StreakRepairView,
    HeartsStatusView,
    HeartsRefillView,
    ShopListView,
    ShopBuyView,
    ShopEquipView,
    LearningStatsView
)

urlpatterns = [
    # Ruta de aprendizaje y niveles
    path('path/', LearningPathView.as_view(), name='learning-path'),
    path('levels/<uuid:pk>/session/', LevelSessionView.as_view(), name='level-session'),
    path('levels/<uuid:pk>/submit/', LevelSubmitView.as_view(), name='level-submit'),

    # Racha y calendario
    path('streak/', StreakStatusView.as_view(), name='learning-streak'),
    path('streak/repair/', StreakRepairView.as_view(), name='learning-streak-repair'),

    # Corazones / Vidas
    path('hearts/', HeartsStatusView.as_view(), name='learning-hearts'),
    path('hearts/refill/', HeartsRefillView.as_view(), name='learning-hearts-refill'),

    # El Bazar Literario (Tienda de Tinta)
    path('shop/', ShopListView.as_view(), name='learning-shop'),
    path('shop/buy/', ShopBuyView.as_view(), name='learning-shop-buy'),
    path('shop/equip/', ShopEquipView.as_view(), name='learning-shop-equip'),

    # Estadísticas de comprensión
    path('stats/', LearningStatsView.as_view(), name='learning-stats'),
]
