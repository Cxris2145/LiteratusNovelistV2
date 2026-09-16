"""
library/signals.py — Señales de la app Library.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import UserInventory, ReadingProgress, ReadingSession


@receiver(post_save, sender=UserInventory)
def create_reading_progress(sender, instance, created, **kwargs):
    """
    Automatización de Progreso:
    Cada vez que un usuario adquiere una obra (UserInventory),
    se le inicializa su registro de progreso en 0%.
    """
    if created:
        ReadingProgress.objects.get_or_create(inventory=instance)


@receiver(post_save, sender=ReadingSession)
def evaluate_session_achievements(sender, instance, created, **kwargs):
    """
    Trigger para logros basados en sesión de lectura:
    - Rachas diarias (streak_3, streak_7, streak_30)
    - Horario de lectura (night_owl, early_bird)
    Solo se evalúa al CREAR una sesión (no al patchear ended_at).
    """
    if created:
        from .achievement_engine import evaluate_for_user
        evaluate_for_user(instance.user, trigger='session', session=instance)


@receiver(post_save, sender=ReadingProgress)
def evaluate_progress_achievements(sender, instance, **kwargs):
    """
    Trigger para logros basados en progreso de lectura:
    - Primer capítulo / primer libro
    - 5 y 10 libros completados
    - Explorador de clásicos por género
    Se evalúa en cada guardado de progreso (PATCH desde el lector).
    """
    from .achievement_engine import evaluate_for_user
    user = instance.inventory.user
    evaluate_for_user(user, trigger='progress', progress=instance)
