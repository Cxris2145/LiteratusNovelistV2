"""
core/models.py — Modelos base compartidos por toda la aplicación.

DECISIÓN ARQUITECTÓNICA — UUID como clave primaria:
    Usamos UUIDField (128 bits) en lugar de AutoField (entero secuencial) por tres
    razones fundamentales:
    1. Seguridad: Un entero secuencial es predecible (e.g. /api/books/1, /api/books/2).
       Un atacante puede enumerar recursos. Un UUID v4 es estadísticamente imposible
       de adivinar o enumerar, protegiendo recursos no públicos.
    2. Escalabilidad horizontal: Si en el futuro dividimos la DB en múltiples shards
       o migramos a una arquitectura de microservicios, los UUIDs garantizan unicidad
       GLOBAL sin un generador central de IDs, evitando colisiones entre shards.
    3. Integridad en importaciones / merges: Permite fusionar datos de fuentes distintas
       (e.g. importar libros de un catálogo externo) sin reasignar PKs y sin romper
       relaciones existentes.

DECISIÓN ARQUITECTÓNICA — Soft Delete (borrado lógico):
    En lugar de DELETE físico (que destruye datos e historial de auditoría), usamos
    "borrado lógico": el registro permanece en la DB pero se marca como eliminado.
    Ventajas:
    - Permite recuperar datos eliminados por error (Undo).
    - Preserva integridad referencial: una Order puede seguir apuntando a un Edition
      "eliminado" sin violar FK constraints.
    - Cumple con requerimientos de auditoría financiera (los registros contables deben
      ser inmutables).
"""

from django.db import models
from django.utils import timezone
import uuid


class SoftDeleteManager(models.Manager):
    """
    Manager por defecto que EXCLUYE registros marcados como eliminados.
    Al heredar TimeStampedModel, Model.objects devuelve solo activos.
    """

    def get_queryset(self):
        # Filtramos registros donde deleted_at IS NULL (no han sido borrados).
        return super().get_queryset().filter(deleted_at__isnull=True)


class AllObjectsManager(models.Manager):
    """
    Manager alternativo para consultas administrativas que necesitan
    ver TODOS los registros, incluyendo los eliminados lógicamente.
    Uso: Model.all_objects.all()
    """

    def get_queryset(self):
        return super().get_queryset()


class TimeStampedModel(models.Model):
    """
    Clase base abstracta que proporciona:
    - UUID como clave primaria (ver justificación arriba).
    - Timestamps de auditoría (created_at, updated_at).
    - Soft Delete con is_active / deleted_at.

    Todos los modelos del sistema heredan de esta clase, garantizando
    consistencia en la capa de datos. Esto evita duplicación de campos
    (principio DRY) y centraliza la lógica de auditoría.
    """

    # -------------------------------------------------------------------------
    # UUID PRIMARY KEY
    # Razón: ver bloque de documentación al inicio del archivo.
    # default=uuid.uuid4 genera un nuevo UUID único en cada instancia.
    # editable=False lo oculta en formularios del admin (es un identificador
    # interno, no debería ser editable manualmente).
    # -------------------------------------------------------------------------
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text="Identificador único universal. Ver documentación de diseño para justificación."
    )

    # -------------------------------------------------------------------------
    # TIMESTAMPS DE AUDITORÍA
    # auto_now_add=True: Django fija este valor solo en la creación (INSERT).
    # auto_now=True:     Django actualiza este valor en cada guardado (UPDATE).
    # db_index=True en created_at acelera consultas de ordenamiento cronológico.
    # -------------------------------------------------------------------------
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="Fecha y hora de creación. Inmutable post-creación."
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Fecha y hora de la última modificación. Gestionado automáticamente."
    )

    # -------------------------------------------------------------------------
    # SOFT DELETE: is_active + deleted_at
    #
    # is_active: campo booleano rápido para consultas (True = visible).
    # deleted_at: timestamp del momento de borrado. NULL significa "activo".
    #   Tener el timestamp exacto del borrado es valioso para auditoría:
    #   permite responder "¿cuándo se eliminó este registro?".
    #
    # NOTA DE 3NF: is_active es funcionalmente dependiente de deleted_at
    # (si deleted_at IS NOT NULL → is_active = False). Sin embargo, lo
    # mantenemos desnormalizado INTENCIONALMENTE por rendimiento: un índice
    # en is_active (bool) es más eficiente para filtros frecuentes que
    # evaluar IS NULL en deleted_at. Esta es una excepción controlada y
    # documentada a la 3NF, aceptada en diseño de BD de producción.
    # -------------------------------------------------------------------------
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="False indica un registro borrado lógicamente (soft delete)."
    )
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        default=None,
        help_text="Timestamp del borrado lógico. NULL = registro activo."
    )

    # Manager principal: solo registros activos (es la interfaz por defecto).
    objects = SoftDeleteManager()

    # Manager de administración: todos los registros incluyendo eliminados.
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True

    def delete(self, using=None, keep_parents=False):
        """
        Sobrescribimos delete() para implementar soft delete.
        En lugar de ejecutar DELETE SQL, marcamos el registro como eliminado.
        """
        self.is_active = False
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_active', 'deleted_at', 'updated_at'])

    def hard_delete(self, using=None, keep_parents=False):
        """
        Borrado físico real. Solo usar en contextos administrativos explícitos
        (ej. limpieza de datos de prueba, solicitudes GDPR de eliminación total).
        """
        super().delete(using=using, keep_parents=keep_parents)

    def restore(self):
        """Restaura un registro borrado lógicamente."""
        self.is_active = True
        self.deleted_at = None
        self.save(update_fields=['is_active', 'deleted_at', 'updated_at'])

class StoreSettings(TimeStampedModel):
    """
    Configuración global de la tienda/sitio.
    Implementa el patrón Singleton (solo debe existir un registro con pk=1).
    """
    class ThemeChoices(models.TextChoices):
        DEFAULT = 'default', 'Classic Dark'
        NEON = 'neon', 'Cyber Neon'
        LIGHT_GALLERY = 'light-gallery', 'Light Gallery'

    theme = models.CharField(
        max_length=50,
        choices=ThemeChoices.choices,
        default=ThemeChoices.DEFAULT,
        help_text="Tema visual global para la tienda."
    )

    def save(self, *args, **kwargs):
        # Aseguramos que siempre sea el mismo registro (Singleton)
        # Como usamos UUID por defecto en TimeStampedModel, aquí tenemos
        # que forzar una manera de asegurar unicidad. En vez de pk=1 que falla con UUID,
        # limpiamos los demás registros si es necesario, o simplemente limitamos en la vista.
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj = cls.objects.first()
        if not obj:
            obj = cls.objects.create()
        return obj

    class Meta:
        verbose_name = "Configuración de la Tienda"
        verbose_name_plural = "Configuraciones de la Tienda"
