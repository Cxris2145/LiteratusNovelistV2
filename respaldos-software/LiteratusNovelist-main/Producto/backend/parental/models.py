"""
parental/models.py — Control parental: un tutor a cargo de las cuentas de sus hijos.

Las filas se borran de verdad (QuerySet.delete) al desvincular: un vínculo que ya no rige no
tiene valor de auditoría y, si quedara marcado como borrado, nadie más podría vincular a ese
hijo. La restricción única igual ignora los borrados lógicos por si el admin borra una fila
desde su formulario.
"""
from django.conf import settings
from django.db import models
from django.db.models import F, Q

from core.models import TimeStampedModel


class ParentalLink(TimeStampedModel):
    """Un hijo tiene como mucho un tutor; un tutor puede tener varios hijos."""

    class Origin(models.TextChoices):
        CREATED = 'created', 'Cuenta creada por el tutor'
        LINKED = 'linked', 'Cuenta existente vinculada'

    parent = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='parental_links'
    )
    child = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='guardian_links'
    )
    origin = models.CharField(max_length=10, choices=Origin.choices, default=Origin.CREATED)
    # Cuándo el tutor marcó «Este perfil es para mi hijo o hija y yo tengo el control».
    consent_at = models.DateTimeField()

    class Meta:
        verbose_name = 'Parental Link'
        verbose_name_plural = 'Parental Links'
        ordering = ['created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['child'], condition=Q(deleted_at__isnull=True), name='unique_active_guardian'
            ),
            models.CheckConstraint(condition=~Q(parent=F('child')), name='parental_link_not_self'),
        ]
        indexes = [models.Index(fields=['parent', 'created_at'])]

    def __str__(self):
        return f'{self.parent} → {self.child}'
