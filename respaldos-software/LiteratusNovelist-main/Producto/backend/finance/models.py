"""
finance/models.py — Modelos de Transacciones para LiteratusNovelist.
"""

from django.db import models
from core.models import TimeStampedModel
from users.models import User

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

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transactions')
    buy_order = models.CharField(max_length=50, unique=True, help_text="ID único de orden para Webpay.")
    session_id = models.CharField(max_length=100, blank=True, help_text="ID de sesión interno.")
    token = models.CharField(max_length=255, unique=True, null=True, blank=True, help_text="Token WS devuelto por Transbank.")
    amount = models.DecimalField(max_digits=10, decimal_places=2, help_text="Monto total cobrado.")
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
