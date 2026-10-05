"""
community/models.py — Amistades y brindis de La Taberna de Tinta.

Las filas se borran de verdad (QuerySet.delete / hard_delete): una solicitud cancelada o
una amistad terminada no tiene valor de auditoría, y así la tabla no se llena de filas
muertas. Las restricciones únicas igual ignoran los borrados lógicos por si el admin
borra una fila desde su formulario.
"""
from django.conf import settings
from django.db import models
from django.db.models import F, Q

from core.models import TimeStampedModel


def pair_key_for(a_id, b_id) -> str:
    """Clave de la pareja sin importar quién inició: '<uuid menor>:<uuid mayor>'."""
    low, high = sorted([str(a_id), str(b_id)])
    return f'{low}:{high}'


class Friendship(TimeStampedModel):
    """
    Una fila por pareja de lectores. Mientras está pendiente, `requester` es quien invitó;
    al aceptarse queda como amistad simétrica.
    """
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pendiente'
        ACCEPTED = 'accepted', 'Aceptada'
        DECLINED = 'declined', 'Rechazada'

    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='friend_requests_sent'
    )
    addressee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='friend_requests_received'
    )
    pair_key = models.CharField(max_length=80, editable=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Friendship'
        verbose_name_plural = 'Friendships'
        constraints = [
            models.UniqueConstraint(
                fields=['pair_key'], condition=Q(deleted_at__isnull=True), name='unique_active_friendship_pair'
            ),
            models.CheckConstraint(condition=~Q(requester=F('addressee')), name='friendship_not_self'),
        ]
        indexes = [
            models.Index(fields=['requester', 'status']),
            models.Index(fields=['addressee', 'status']),
        ]

    def save(self, *args, **kwargs):
        self.pair_key = pair_key_for(self.requester_id, self.addressee_id)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.requester} → {self.addressee} ({self.get_status_display()})'


class Brindis(TimeStampedModel):
    """El "me gusta" de La Taberna: un amigo levanta su jarra por otro. Uno activo por pareja."""
    giver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='brindis_dados')
    receiver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='brindis_recibidos')

    class Meta:
        verbose_name = 'Brindis'
        verbose_name_plural = 'Brindis'
        constraints = [
            models.UniqueConstraint(
                fields=['giver', 'receiver'], condition=Q(deleted_at__isnull=True), name='unique_active_brindis'
            ),
            models.CheckConstraint(condition=~Q(giver=F('receiver')), name='brindis_not_self'),
        ]

    def __str__(self):
        return f'{self.giver} 🍺 {self.receiver}'


class TavernMessage(TimeStampedModel):
    """
    Mensaje compartido en La Taberna de Tinta.
    Visible para el autor y sus amigos sentados a la mesa.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tavern_messages'
    )
    content = models.CharField(max_length=280)

    class Meta:
        verbose_name = 'Tavern Message'
        verbose_name_plural = 'Tavern Messages'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        return f'{self.user.username}: {self.content[:30]}'


class TavernReaction(TimeStampedModel):
    """Reacción rápida en La Taberna (🍺, ❤️, 👏, 📖, ✨)."""
    ALLOWED_REACTIONS = ('beer', 'heart', 'clap', 'book', 'sparkle')

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tavern_reactions'
    )
    message = models.ForeignKey(
        TavernMessage, on_delete=models.CASCADE, null=True, blank=True, related_name='reactions'
    )
    reaction = models.CharField(max_length=20)

    class Meta:
        verbose_name = 'Tavern Reaction'
        verbose_name_plural = 'Tavern Reactions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        return f'{self.user.username} {self.reaction}'
