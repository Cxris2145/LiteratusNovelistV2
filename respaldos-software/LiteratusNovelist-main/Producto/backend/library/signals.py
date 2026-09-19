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
    Además, recompensa Tinta y XP si se leyeron capítulos en la actualización.
    """
    if created:
        from .achievement_engine import evaluate_for_user
        evaluate_for_user(instance.user, trigger='session', session=instance)
        
    # Recompensas de gamificación y aseguramiento de racha por lectura
    if not created and instance.ended_at:
        try:
            from learning.services import ensure_streak
            ensure_streak(instance.user, 'chapter_read')
        except Exception:
            pass

        if getattr(instance, 'chapters_read', 0) > 0:
            from .achievement_engine import reward_activity
            reward_activity(instance.user, 'chapter_read', str(instance.id))


@receiver(post_save, sender=ReadingProgress)
def evaluate_progress_achievements(sender, instance, **kwargs):
    """
    Trigger para logros basados en progreso de lectura:
    - Primer capítulo / primer libro
    - 5 y 10 libros completados
    - Explorador de clásicos por género
    Se evalúa en cada guardado de progreso (PATCH desde el lector).
    """
    from .achievement_engine import evaluate_for_user, reward_activity
    user = instance.inventory.user
    evaluate_for_user(user, trigger='progress', progress=instance)
    
    # Recompensa por libro terminado (100%)
    if float(instance.completion_percentage) >= 100:
        # Prevent duplicate rewards? The logic in reward_activity needs a unique check or we just rely on the fact that progress only hits 100% once (or we check if a transaction exists).
        # Para MVP: damos recompensa por book_completed si no se ha dado antes.
        from .models import InkTransaction
        if not InkTransaction.objects.filter(user=user, concept='book_completed', reference_id=str(instance.inventory.edition.book.id)).exists():
            reward_activity(user, 'book_completed', str(instance.inventory.edition.book.id))
