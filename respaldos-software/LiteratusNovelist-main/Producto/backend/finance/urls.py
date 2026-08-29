"""
finance/urls.py — Rutas de la app de pagos.
"""
from django.urls import path
from .views import initiate_payment, confirm_payment

urlpatterns = [
    path('pay/', initiate_payment, name='finance-pay'),
    path('confirm/', confirm_payment, name='finance-confirm'),
]
