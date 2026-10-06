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

import secrets

from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from core.models import TimeStampedModel

# Sin 0/O, 1/I/L: el código se dicta y se copia a mano sin confusiones.
FRIEND_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
FRIEND_CODE_LENGTH = 6


def generate_unique_friend_code():
    """Código público de La Taberna (ej. K7Q2XM). 31^6 ≈ 887 millones de combinaciones."""
    for _ in range(10):
        code = ''.join(secrets.choice(FRIEND_CODE_ALPHABET) for _ in range(FRIEND_CODE_LENGTH))
        # all_objects: un perfil borrado lógicamente sigue reservando su código.
        if not Profile.all_objects.filter(friend_code=code).exists():
            return code
    raise RuntimeError('No se pudo generar un código de amigo único.')


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
    avatar = models.TextField(blank=True, default='', help_text="Foto de perfil del usuario (URL o imagen codificada).")
    avatar_color = models.CharField(max_length=20, default='#3b82f6') # Color de fondo para el avatar de iniciales
    bio = models.TextField(blank=True, default='') # Biografía o descripción corta escrita por el usuario.
    country = models.CharField(max_length=100, blank=True, default='') # País de origen o residencia del usuario. Útil para métricas.
    preferred_language = models.CharField(max_length=10, default='es')
    birth_date = models.DateField(null=True, blank=True, help_text='Fecha de nacimiento del usuario. Requerido para acceder a contenido restringido por edad.') # Idioma preferido del usuario en la plataforma (ej. 'es' para español).
    # SISTEMA DE GAMIFICACIÓN: Tinta, XP, Nivel y Racha
    ink_balance = models.PositiveIntegerField(
        default=50,
        help_text="Tokens de energía (Tinta) disponibles para chatear con personajes de IA o adquirir contenido."
    ) # Saldo actual de "Tinta" del usuario. Funciona como moneda virtual para interactuar con la IA o adquirir contenido.
    
    xp = models.PositiveIntegerField(
        default=0,
        help_text="Puntos de experiencia acumulados."
    )
    level = models.PositiveIntegerField(
        default=1,
        help_text="Nivel actual del lector."
    )
    streak_current = models.PositiveIntegerField(
        default=0,
        help_text="Racha actual de días consecutivos leyendo o practicando."
    )
    streak_max = models.PositiveIntegerField(
        default=0,
        help_text="Mejor racha histórica de días consecutivos."
    )
    streak_shields = models.PositiveSmallIntegerField(
        default=0,
        help_text="Escudos protectores de racha activos (máximo 2 almacenables)."
    )
    streak_last_date = models.DateField(
        null=True, blank=True,
        help_text="Último día en el que se validó la racha."
    )
    hearts = models.PositiveSmallIntegerField(
        default=5,
        help_text="Vidas actuales para ejercicios de comprensión (0 a 5)."
    )
    hearts_last_updated = models.DateTimeField(
        default=timezone.now,
        help_text="Último timestamp en el que se sincronizaron las vidas."
    )
    equipped_frame = models.CharField(
        max_length=100, blank=True, default='',
        help_text="Identificador del marco de perfil equipado."
    )
    equipped_title = models.CharField(
        max_length=100, blank=True, default='',
        help_text="Título literario honorífico equipado."
    )
    
    theme = models.CharField(max_length=50, default='default', help_text="Tema visual preferido del usuario.")

    # Flujo de Onboarding & Preferencias de Lectura
    has_completed_onboarding = models.BooleanField(
        default=False,
        help_text="Indica si el usuario completó la configuración inicial de rol y gustos literarios."
    )
    favorite_genres = models.ManyToManyField(
        'catalog.Genre',
        blank=True,
        related_name='favorited_by_profiles',
        help_text="Géneros literarios seleccionados durante el onboarding o en perfil."
    )
    followed_authors = models.ManyToManyField(
        'catalog.Author',
        blank=True,
        related_name='followed_by_profiles',
        help_text="Autores literarios que el usuario sigue para recibir novedades."
    )

    # La Taberna de Tinta (comunidad)
    friend_code = models.CharField(
        max_length=FRIEND_CODE_LENGTH, unique=True, null=True, blank=True, editable=False,
        help_text="Código público e inmutable para encontrar al lector en La Taberna (ej. K7Q2XM)."
    )
    tagline = models.CharField(
        max_length=80, blank=True, default='',
        help_text="Frase corta que ven los amigos en La Taberna."
    )
    outfit = models.JSONField(
        default=dict, blank=True,
        help_text="Accesorios de Maguito por espacio: {'head': 'crown', ...}. Solo cambia desde El Bazar."
    )
    last_seen_in_tavern = models.DateTimeField(
        null=True, blank=True,
        help_text="Último latido de presencia en La Taberna."
    )

    class Meta:
        verbose_name = 'Profile'
        verbose_name_plural = 'Profiles'

    def __str__(self):
        return f"Profile de {self.user.username}"

    def save(self, *args, **kwargs):
        if not self.friend_code:
            self.friend_code = generate_unique_friend_code()
            update_fields = kwargs.get('update_fields')
            if update_fields is not None:
                kwargs['update_fields'] = {*update_fields, 'friend_code'}
        super().save(*args, **kwargs)
