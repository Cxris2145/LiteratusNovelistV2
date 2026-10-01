"""
finance/urls.py — Rutas de la app de pagos.
"""
from django.urls import path
from .views import initiate_payment, confirm_payment
from . import subscription_views
from .views import ink_packages

urlpatterns = [
    path('plans/', subscription_views.plans),
    path('subscription/', subscription_views.subscription),
    path('subscription/subscribe/', subscription_views.subscribe),
    path('subscription/frame/', subscription_views.equip_frame),
    path('subscription/<str:action>/', subscription_views.manage),
    path('paypal/webhook/', subscription_views.webhook),
    path('history/', subscription_views.payment_history),
    path('ink-packages/', ink_packages),
    path('pay/', initiate_payment, name='finance-pay'),
    path('confirm/', confirm_payment, name='finance-confirm'),
]
