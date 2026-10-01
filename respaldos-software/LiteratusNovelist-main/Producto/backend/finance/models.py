"""
finance/models.py — Modelos de Transacciones para LiteratusNovelist.
"""

from django.db import models
from core.models import TimeStampedModel
from users.models import User
import uuid
from django.utils import timezone

class Transaction(TimeStampedModel):
    """
    Log inmutable de intentos de pago con la pasarela (Webpay Plus).
    Centraliza compras de libros y recargas de Tinta en un único modelo.
    """
    class StatusChoices(models.TextChoices):
        INICIADA = 'iniciada', 'Iniciada'
        EXITOSA = 'exitosa', 'Exitosa'
        FALLIDA = 'fallida', 'Fallida'
        REVERSADA = 'reversada', 'Reversada'

    class ItemTypeChoices(models.TextChoices):
        BOOK = 'book', 'Libro'
        INK = 'ink', 'Tinta'
        PLAN = 'plan', 'Suscripción'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transactions')
    buy_order = models.CharField(max_length=50, unique=True, help_text="ID único de orden para Webpay.")
    session_id = models.CharField(max_length=100, blank=True, help_text="ID de sesión interno.")
    token = models.CharField(max_length=255, unique=True, null=True, blank=True, help_text="Token WS devuelto por Transbank.")
    amount = models.DecimalField(max_digits=10, decimal_places=2, help_text="Monto total cobrado.")
    currency = models.CharField(max_length=3, default='CLP')
    provider = models.CharField(max_length=20, default='webpay')
    external_payment_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.INICIADA
    )
    response_code = models.CharField(max_length=10, null=True, blank=True, help_text="Código de respuesta de Transbank.")
    
    # Datos de qué se está comprando
    item_type = models.CharField(max_length=10, choices=ItemTypeChoices.choices)
    item_reference = models.CharField(max_length=255, help_text="Slug del libro o cantidad de tinta.")
    
    # Log crudo para auditoría
    metadata = models.JSONField(blank=True, default=dict)

    class Meta:
        verbose_name = 'Transaction'
        verbose_name_plural = 'Transactions'
        indexes = [
            models.Index(fields=['buy_order']),
            models.Index(fields=['token']),
        ]

    def __str__(self):
        return f"Txn {self.buy_order} - {self.user.username} [{self.get_status_display()}]"


class SubscriptionPlan(models.Model):
    code = models.SlugField(primary_key=True)
    name = models.CharField(max_length=80)
    price = models.DecimalField(max_digits=8, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')
    daily_token_limit = models.PositiveIntegerField()
    daily_time_limit = models.PositiveIntegerField(null=True, blank=True, help_text='Segundos; NULL = sin límite horario')
    monthly_ink_bonus = models.PositiveIntegerField(default=0)
    benefits = models.JSONField(default=list)
    provider_plan_id = models.CharField(max_length=100, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['price']


class UserSubscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='subscription')
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT)
    status = models.CharField(max_length=30, default='APPROVAL_PENDING')
    started_at = models.DateTimeField(null=True, blank=True)
    paid_until = models.DateTimeField(null=True, blank=True)
    renews_at = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    provider_subscription_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    pending_plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    previous_frame = models.CharField(max_length=100, blank=True)
    creation_request_id = models.UUIDField(default=uuid.uuid4)
    updated_at = models.DateTimeField(auto_now=True)


class PayPalSubscriptionBinding(models.Model):
    provider_subscription_id = models.CharField(max_length=100, primary_key=True)
    subscription = models.ForeignKey(UserSubscription, on_delete=models.PROTECT)
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT)
    created_at = models.DateTimeField(default=timezone.now, editable=False)


class PayPalWebhook(models.Model):
    event_id = models.CharField(max_length=100, primary_key=True)
    event_type = models.CharField(max_length=100)
    processed_at = models.DateTimeField(auto_now_add=True)
