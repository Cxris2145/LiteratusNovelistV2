"""
learning/models.py — Modelos de Senda de Aprendizaje, Comprensión Lectora y Gamificación.
"""

from django.db import models
from django.conf import settings
from django.utils import timezone
from core.models import TimeStampedModel


class LearningUnit(TimeStampedModel):
    """
    Unidad temática de aprendizaje en La Senda del Lector.
    Ej: Unidad 1 — Comprensión básica, Unidad 2 — Vocabulario.
    """
    unit_number = models.PositiveIntegerField(unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(default=1)
    icon = models.CharField(max_length=50, default='menu_book')
    banner_color = models.CharField(max_length=30, default='#3b82f6')
    min_user_level = models.PositiveIntegerField(default=1)

    class Meta:
        verbose_name = 'Learning Unit'
        verbose_name_plural = 'Learning Units'
        ordering = ['unit_number']

    def __str__(self):
        return f"Unidad {self.unit_number}: {self.title}"


class LearningLevel(TimeStampedModel):
    """
    Nivel individual dentro de una unidad pedagógica.
    Puede ser un nivel estándar, un cofre de recompensa o una prueba de maestría.
    """
    class Difficulty(models.TextChoices):
        FACIL = 'facil', 'Fácil'
        INTERMEDIO = 'intermedio', 'Intermedio'
        DIFICIL = 'dificil', 'Difícil'

    unit = models.ForeignKey(LearningUnit, on_delete=models.CASCADE, related_name='levels')
    level_number = models.PositiveIntegerField()
    order = models.PositiveIntegerField(default=1)
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, default='')
    difficulty = models.CharField(
        max_length=20,
        choices=Difficulty.choices,
        default=Difficulty.FACIL
    )
    required_score = models.PositiveIntegerField(
        default=70,
        help_text="Porcentaje de aciertos necesario para aprobar (ej. 70%)."
    )
    xp_reward = models.PositiveIntegerField(default=30)
    ink_reward = models.PositiveIntegerField(default=10)
    is_exam = models.BooleanField(default=False, help_text="Prueba final de la unidad.")
    is_chest = models.BooleanField(default=False, help_text="Nodo de cofre con recompensa extra.")
    icon = models.CharField(max_length=50, default='auto_stories')

    class Meta:
        verbose_name = 'Learning Level'
        verbose_name_plural = 'Learning Levels'
        ordering = ['unit__unit_number', 'order']
        constraints = [
            models.UniqueConstraint(
                fields=['unit', 'level_number'],
                name='unique_unit_level_number'
            )
        ]

    def __str__(self):
        return f"U{self.unit.unit_number} - Nivel {self.level_number}: {self.title}"


class LearningExercise(TimeStampedModel):
    """
    Contenido didáctico asociado a un nivel: texto paginado y preguntas estructuradas.
    """
    class SourceType(models.TextChoices):
        CLASSIC_BOOK = 'classic_book', 'Obra Clásica del Catálogo'
        PEDAGOGIC_ORIGINAL = 'pedagogic_original', 'Ficción Pedagógica Original'

    level = models.OneToOneField(LearningLevel, on_delete=models.CASCADE, related_name='exercise')
    book = models.ForeignKey(
        'catalog.Book',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='learning_exercises'
    )
    title = models.CharField(max_length=200)
    author_name = models.CharField(max_length=150, blank=True, default='')
    source_type = models.CharField(
        max_length=30,
        choices=SourceType.choices,
        default=SourceType.CLASSIC_BOOK
    )
    # Lista de páginas de lectura (strings de texto limpio o formateado)
    content_pages = models.JSONField(
        default=list,
        help_text="Lista de páginas de texto del pasaje a leer."
    )
    # Batería de preguntas estructuradas
    questions_data = models.JSONField(
        default=list,
        help_text="Lista de preguntas estructuradas con opciones, explicaciones y tipo."
    )

    class Meta:
        verbose_name = 'Learning Exercise'
        verbose_name_plural = 'Learning Exercises'

    def __str__(self):
        return f"Ejercicio para {self.level}"


class UserLevelProgress(TimeStampedModel):
    """
    Progreso y calificación de un usuario en un nivel específico.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='learning_progress'
    )
    level = models.ForeignKey(
        LearningLevel,
        on_delete=models.CASCADE,
        related_name='user_progress'
    )
    stars = models.PositiveSmallIntegerField(
        default=0,
        help_text="Estrellas obtenidas (0 a 3)."
    )
    best_score = models.PositiveSmallIntegerField(
        default=0,
        help_text="Mejor porcentaje de acierto registrado (0 a 100)."
    )
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    attempts_count = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'User Level Progress'
        verbose_name_plural = 'User Level Progresses'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'level'],
                name='unique_user_level_progress'
            )
        ]

    def __str__(self):
        status = "★" * self.stars if self.is_completed else "Pendiente"
        return f"{self.user.username} — {self.level} [{status}]"


class UserExerciseAttempt(TimeStampedModel):
    """
    Auditoría inmutable de cada intento de resolución de un nivel.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='exercise_attempts'
    )
    level = models.ForeignKey(
        LearningLevel,
        on_delete=models.CASCADE,
        related_name='attempts'
    )
    score = models.PositiveSmallIntegerField(default=0, help_text="Porcentaje de acierto obtenido.")
    passed = models.BooleanField(default=False)
    answers_log = models.JSONField(default=list, help_text="Detalle de respuestas seleccionadas.")
    xp_earned = models.PositiveIntegerField(default=0)
    ink_earned = models.PositiveIntegerField(default=0)
    duration_seconds = models.PositiveIntegerField(default=0)
    hearts_lost = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Exercise Attempt'
        verbose_name_plural = 'Exercise Attempts'
        ordering = ['-created_at']

    def __str__(self):
        result = "Aprobado" if self.passed else "No Aprobado"
        return f"{self.user.username} - {self.level.title}: {self.score}% ({result})"


class DailyActivityLog(TimeStampedModel):
    """
    Registro diario consolidado de actividad para el cálculo de racha y el calendario/heatmap.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='daily_activities'
    )
    date = models.DateField(db_index=True)
    chapters_read = models.PositiveIntegerField(default=0)
    levels_completed = models.PositiveIntegerField(default=0)
    xp_earned = models.PositiveIntegerField(default=0)
    ink_earned = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Daily Activity Log'
        verbose_name_plural = 'Daily Activity Logs'
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'date'],
                name='unique_user_daily_activity'
            )
        ]

    def __str__(self):
        return f"{self.user.username} @ {self.date}: {self.levels_completed} niveles, {self.chapters_read} caps"


class ShopItem(TimeStampedModel):
    """
    Catálogo de artículos consumibles y cosméticos canjeables por Tinta en El Bazar.
    """
    class ItemType(models.TextChoices):
        STREAK_SHIELD = 'streak_shield', 'Protector de Racha'
        STREAK_REPAIR = 'streak_repair', 'Poción de Recuperación de Racha'
        HEARTS_REFILL = 'hearts_refill', 'Recarga de Corazones'
        PROFILE_FRAME = 'profile_frame', 'Marco de Perfil'
        THEME = 'theme', 'Tema Visual'
        TITLE = 'title', 'Título Honorífico'

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=150)
    description = models.TextField()
    item_type = models.CharField(max_length=30, choices=ItemType.choices)
    cost_ink = models.PositiveIntegerField(default=50)
    icon = models.CharField(max_length=50, default='shopping_bag')
    asset_url = models.CharField(max_length=255, blank=True, default='')
    value = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="Identificador técnico aplicado al equipar (ej. 'frame-gold', 'title-erudite')."
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Shop Item'
        verbose_name_plural = 'Shop Items'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return f"[{self.get_item_type_display()}] {self.name} ({self.cost_ink} Tinta)"


class UserInventoryItem(TimeStampedModel):
    """
    Inventario de artículos y cosméticos adquiridos por el usuario en El Bazar.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='inventory_items'
    )
    item = models.ForeignKey(ShopItem, on_delete=models.CASCADE, related_name='purchases')
    quantity = models.PositiveIntegerField(default=1)
    is_equipped = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'User Inventory Item'
        verbose_name_plural = 'User Inventory Items'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'item'],
                name='unique_user_shop_item'
            )
        ]

    def __str__(self):
        return f"{self.user.username} — {self.item.name} (x{self.quantity})"
