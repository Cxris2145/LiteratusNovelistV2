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


# Las reacciones (🍺, ❤️, 👏, 📖, ✨) no tienen modelo: son efímeras y viven unos segundos en la
# caché (community/live.py). Antes se guardaban en TavernReaction; la migración 0005 la borró.


class FriendMessage(TimeStampedModel):
    """Mensaje de una charla privada entre dos amigos. Solo lo ven ellos dos mientras sean amigos."""
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='friend_messages_sent'
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='friend_messages_received'
    )
    pair_key = models.CharField(max_length=80, editable=False)
    content = models.CharField(max_length=500)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Friend Message'
        verbose_name_plural = 'Friend Messages'
        ordering = ['created_at']
        constraints = [
            models.CheckConstraint(condition=~Q(sender=F('recipient')), name='friend_message_not_self'),
        ]
        indexes = [
            models.Index(fields=['pair_key', 'created_at']),
            models.Index(fields=['recipient', 'read_at']),
        ]

    def save(self, *args, **kwargs):
        self.pair_key = pair_key_for(self.sender_id, self.recipient_id)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.sender} → {self.recipient}: {self.content[:30]}'


class TavernInvitation(TimeStampedModel):
    """Invitación breve entre amigos para reunirse en la taberna compartida."""
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tavern_invites_sent')
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tavern_invites_received')
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['sender', 'recipient'], condition=Q(deleted_at__isnull=True), name='unique_active_tavern_invite'),
            models.CheckConstraint(condition=~Q(sender=F('recipient')), name='tavern_invite_not_self'),
        ]


class ReadingClub(TimeStampedModel):
    """
    Círculo de lectura grupal en La Taberna: un libro compartido entre amigos con espacios de
    conversación separados por capítulo y reglas configurables por el anfitrión.
    """
    class Mode(models.TextChoices):
        SPOILER_SAFE = 'spoiler_safe', 'Protección anti-spoilers (según tu avance)'
        HOST_PACED = 'host_paced', 'Avance guiado por el anfitrión'
        FREE = 'free', 'Acceso libre a todos los capítulos'

    name = models.CharField(max_length=120)
    book = models.ForeignKey('catalog.Book', on_delete=models.CASCADE, related_name='reading_clubs')
    host = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='hosted_reading_clubs')
    mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.SPOILER_SAFE)
    unlocked_until_chapter = models.PositiveIntegerField(
        default=1,
        help_text='En modo guiado por el anfitrión, hasta qué número de capítulo está habilitado para conversar.'
    )
    allow_member_invites = models.BooleanField(
        default=True,
        help_text='Si está activo, cualquier miembro puede invitar a sus amigos al círculo.'
    )

    class Meta:
        verbose_name = 'Reading Club'
        verbose_name_plural = 'Reading Clubs'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['host', '-created_at']),
            models.Index(fields=['book', '-created_at']),
        ]

    def __str__(self):
        return f'{self.name} ({self.book.title})'


class ReadingClubMember(TimeStampedModel):
    """Miembro de un círculo de lectura y su capítulo actual en la lectura compartida."""
    club = models.ForeignKey(ReadingClub, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reading_club_memberships')
    current_chapter = models.PositiveIntegerField(default=1)

    class Meta:
        verbose_name = 'Reading Club Member'
        verbose_name_plural = 'Reading Club Members'
        constraints = [
            models.UniqueConstraint(
                fields=['club', 'user'],
                condition=Q(deleted_at__isnull=True),
                name='unique_active_reading_club_member',
            ),
        ]
        indexes = [
            models.Index(fields=['user', 'club']),
        ]

    def __str__(self):
        return f'{self.user.username} en {self.club.name} (Cap. {self.current_chapter})'


class ReadingClubMessage(TimeStampedModel):
    """Mensaje dentro del espacio de conversación de un capítulo específico en un círculo de lectura."""
    club = models.ForeignKey(ReadingClub, on_delete=models.CASCADE, related_name='messages')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reading_club_messages')
    chapter_order = models.PositiveIntegerField(default=1, db_index=True)
    content = models.CharField(max_length=500)
    is_spoiler = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Reading Club Message'
        verbose_name_plural = 'Reading Club Messages'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['club', 'chapter_order', 'created_at']),
        ]

    def __str__(self):
        return f'[{self.club.name} · Cap. {self.chapter_order}] {self.user.username}: {self.content[:30]}'

