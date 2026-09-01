"""
users/models.py — Modelos de Identidad y Autenticación (IAM).

DISEÑO UUID:
    User extiende AbstractUser Y TimeStampedModel.
    AbstractUser ya tiene su propio id (AutoField). Al heredar TimeStampedModel
    DESPUÉS de AbstractUser, el id de TimeStampedModel (UUID) toma precedencia
    como campo PK, sobrescribiendo el AutoField. Esto está cubierto por la
    declaración en Meta: la app 'users' usa AUTH_USER_MODEL = 'users.User'.

DISEÑO SEPARACIÓN User ↔ Profile (3NF):
    Los datos de autenticación (email, password, role) residen en User.
    Los datos personales (bio, avatar, country) residen en Profile.
    Fundamento 3NF: si guardáramos 'bio' en User, 'bio' dependería del usuario
    (cumple), pero crearíamos un modelo hinchado que mezcla responsabilidades.
    Más importante: permite que la tabla 'users_user' sea compacta y rápida
    de consultar en cada request autenticado (Django carga el User en cada
    petición). Profile solo se carga cuando se necesita (lazy loading).
"""

from django.db import models
from django.contrib.auth.models import AbstractUser
from core.models import TimeStampedModel


class User(AbstractUser, TimeStampedModel):
    """
    Modelo de Identidad y Autenticación.
    UUID PK garantiza unicidad global y previene enumeración de IDs.
    El campo 'role' implementa RBAC básico (Role-Based Access Control).
    """
    class RoleChoices(models.TextChoices):
        READER = 'reader', 'Lectura'
        AUTHOR = 'author', 'Autor'
        ADMIN = 'admin', 'Administrador'

    # Email como campo de login (único + indexado).
    # db_index=True en EmailField es redundante con unique=True (Django crea
    # el índice automáticamente), pero lo declaramos explícitamente en Meta
    # para evidencia en migraciones y documentación.
    email = models.EmailField(unique=True, db_index=True) # Correo electrónico único. Se usa como identificador principal para iniciar sesión.
    role = models.CharField(
        max_length=20,
        choices=RoleChoices.choices,
        default=RoleChoices.READER
    ) # Rol del usuario en el sistema (Lector, Autor, Administrador). Define los permisos de acceso y acciones permitidas.

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['username']),
        ]

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"


class Profile(TimeStampedModel):
    """
    Información personal y preferencias de usuario.

    RELACIÓN 1:1 estricta con User (OneToOneField).
    Razón de separación (3NF): 'bio', 'avatar', 'country' dependen del
    usuario (la PK), cumpliendo 3NF. Sin embargo, al separarlos en Profile
    logramos una optimización de rendimiento: la tabla User es más estrecha,
    mejorando el cache hit rate en selects frecuentes de autenticación.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile'
    ) # Relación 1:1 con el modelo User. Vincula los datos extendidos del perfil a la cuenta principal.
    avatar_color = models.CharField(max_length=20, default='#3b82f6') # Color de fondo para el avatar de iniciales
    bio = models.TextField(blank=True, default='') # Biografía o descripción corta escrita por el usuario.
    country = models.CharField(max_length=100, blank=True, default='') # País de origen o residencia del usuario. Útil para métricas.
    preferred_language = models.CharField(max_length=10, default='es') # Idioma preferido del usuario en la plataforma (ej. 'es' para español).
    # SISTEMA DE TINTA: Recurso de energía para limitar el uso del chat con IA.
    # Cada mensaje enviado consume 1 tinta. Los administradores pueden recargar.
    ink_balance = models.PositiveIntegerField(
        default=50,
        help_text="Tokens de energía (Tinta) disponibles para chatear con personajes de IA."
    ) # Saldo actual de "Tinta" del usuario. Funciona como moneda virtual para interactuar con la IA o adquirir contenido.
    theme = models.CharField(max_length=50, default='default', help_text="Tema visual preferido del usuario.")

    class Meta:
        verbose_name = 'Profile'
        verbose_name_plural = 'Profiles'

    def __str__(self):
        return f"Profile de {self.user.username}"
