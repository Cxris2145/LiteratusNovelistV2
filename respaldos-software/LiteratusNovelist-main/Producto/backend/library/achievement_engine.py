"""
library/achievement_engine.py — Motor de evaluación de logros.

ARQUITECTURA:
    - Evaluación signal-driven: se dispara en Django signals (post_save)
      sobre ReadingSession y ReadingProgress.
    - Cada evaluador es una función pura y testeable que recibe el user
      y contexto, evalúa la condición y llama a _unlock_or_update().
    - _unlock_or_update() es el único punto de escritura en UserAchievement,
      evitando race conditions con get_or_create + update atómico.

EVALUADORES IMPLEMENTADOS:
    Trigger 'session' (ReadingSession creada):
        - streak_3, streak_7, streak_30: racha de días consecutivos
        - night_owl, night_owl_10: lectura entre 00:00 y 04:59
        - early_bird: lectura entre 05:00 y 07:59

    Trigger 'progress' (ReadingProgress actualizado):
        - first_chapter: primer avance de página registrado
        - first_book: primer libro completado al 100%
        - books_5, books_10: 5 y 10 libros completados
        - classic_explorer_3, classic_explorer_10: libros de un mismo género
"""

from django.utils import timezone
from django.db import transaction
from django.db.models import Count, F


def evaluate_for_user(user, trigger: str, session=None, progress=None):
    """
    Punto de entrada principal del motor.
    Despacha a los evaluadores relevantes según el trigger.

    Args:
        user: instancia de User
        trigger: 'session' | 'progress'
        session: instancia de ReadingSession (trigger='session')
        progress: instancia de ReadingProgress (trigger='progress')
    """
    try:
        if trigger == 'session' and session:
            _evaluate_streak(user, session)
            _evaluate_time_based(user, session)
        elif trigger == 'progress' and progress:
            _evaluate_reading_milestones(user, progress)
            _evaluate_genre_exploration(user, progress)
    except Exception:
        # El motor de logros NO debe bloquear el flujo principal.
        # Errores se ignoran silenciosamente para no romper la sesión
        # o el guardado de progreso del usuario.
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("Achievement engine error for user %s (trigger=%s)", user.pk, trigger)


# ---------------------------------------------------------------------------
# EVALUADORES DE RACHA (streak)
# ---------------------------------------------------------------------------

def _evaluate_streak(user, session):
    """
    Calcula la racha actual de días consecutivos de lectura y actualiza
    los logros streak_3, streak_7 y streak_30.

    ALGORITMO:
        1. Obtener las fechas únicas de sesión del usuario (solo la fecha, sin hora).
        2. Ordenar desc y calcular cuántos días consecutivos hay desde hoy hacia atrás.
        3. Comparar contra los thresholds.
    """
    from .models import ReadingSession

    # Fechas únicas de sesión (en timezone local del servidor)
    session_dates = (
        ReadingSession.objects
        .filter(user=user, is_active=True)
        .values_list('started_at', flat=True)
        .order_by('-started_at')
    )

    # Convertir a set de fechas locales únicas
    unique_dates = sorted(
        set(dt.astimezone(timezone.get_current_timezone()).date() for dt in session_dates),
        reverse=True
    )

    if not unique_dates:
        return

    # Calcular racha desde hoy (o ayer, si no leyó hoy todavía)
    today = timezone.localdate()
    streak = 0

    # Aceptamos que la racha empiece hoy o ayer
    if unique_dates[0] not in (today, today - __import__('datetime').timedelta(days=1)):
        streak = 0
    else:
        for i, date in enumerate(unique_dates):
            expected = unique_dates[0] - __import__('datetime').timedelta(days=i)
            if date == expected:
                streak += 1
            else:
                break

    # Actualizar logros de racha
    for code, days in [('streak_3', 3), ('streak_7', 7), ('streak_30', 30)]:
        _unlock_or_update(user, code, current=streak, threshold=days)


# ---------------------------------------------------------------------------
# EVALUADORES HORARIOS (time-based)
# ---------------------------------------------------------------------------

def _evaluate_time_based(user, session):
    """
    Evalúa logros basados en la hora de inicio de sesión.
    - night_owl: sesión iniciada entre 00:00 y 04:59 (1 vez)
    - night_owl_10: sesión nocturna, 10 veces
    - early_bird: sesión iniciada entre 05:00 y 07:59 (1 vez)
    """
    from .models import ReadingSession

    local_hour = session.started_at.astimezone(
        timezone.get_current_timezone()
    ).hour

    # Sesiones nocturnas (00:00 - 04:59)
    if 0 <= local_hour < 5:
        night_count = ReadingSession.objects.filter(
            user=user,
            is_active=True,
            started_at__hour__lt=5,
        ).count()
        _unlock_or_update(user, 'night_owl', current=min(night_count, 1), threshold=1)
        _unlock_or_update(user, 'night_owl_10', current=night_count, threshold=10)

    # Sesiones madrugadoras (05:00 - 07:59)
    elif 5 <= local_hour < 8:
        early_count = ReadingSession.objects.filter(
            user=user,
            is_active=True,
            started_at__hour__gte=5,
            started_at__hour__lt=8,
        ).count()
        _unlock_or_update(user, 'early_bird', current=min(early_count, 1), threshold=1)


# ---------------------------------------------------------------------------
# EVALUADORES DE PROGRESO DE LECTURA (reading milestones)
# ---------------------------------------------------------------------------

def _evaluate_reading_milestones(user, progress):
    """
    Evalúa logros de hitos de lectura:
    - first_chapter: primer avance de página registrado
    - first_book: primer libro completado al 100%
    - books_5: 5 libros completados
    - books_10: 10 libros completados
    """
    from .models import ReadingProgress

    # Logro: primer capítulo (cualquier progreso > 0%)
    if float(progress.completion_percentage) > 0:
        _unlock_or_update(user, 'first_chapter', current=1, threshold=1)

    # Logros de libro completo
    if float(progress.completion_percentage) >= 100:
        # Contar total de libros completados al 100%
        completed_count = ReadingProgress.objects.filter(
            inventory__user=user,
            completion_percentage__gte=100,
            is_active=True,
        ).count()

        for code, threshold in [
            ('first_book', 1),
            ('books_5', 5),
            ('books_10', 10),
        ]:
            _unlock_or_update(user, code, current=completed_count, threshold=threshold)


def _evaluate_genre_exploration(user, progress):
    """
    Evalúa el logro 'classic_explorer_3' y 'classic_explorer_10':
    Completar libros de un mismo género (el género más leído).
    """
    from .models import ReadingProgress

    if float(progress.completion_percentage) < 100:
        return

    # Géneros de los libros completados por el usuario, agrupados por cantidad
    genre_counts = (
        ReadingProgress.objects
        .filter(
            inventory__user=user,
            completion_percentage__gte=100,
            is_active=True,
        )
        .values('inventory__edition__book__genres__name')
        .annotate(total=Count('inventory__edition__book__genres'))
        .order_by('-total')
    )

    if not genre_counts:
        return

    max_in_genre = genre_counts[0]['total'] if genre_counts[0]['inventory__edition__book__genres__name'] else 0

    for code, threshold in [
        ('classic_explorer_3', 3),
        ('classic_explorer_10', 10),
    ]:
        _unlock_or_update(user, code, current=max_in_genre, threshold=threshold)


# ---------------------------------------------------------------------------
# HELPER CENTRAL DE ESCRITURA
# ---------------------------------------------------------------------------

@transaction.atomic
def _unlock_or_update(user, achievement_code: str, current: int, threshold: int):
    """
    Crea o actualiza el registro UserAchievement para el usuario.
    Si current >= threshold y aún no estaba desbloqueado, lo desbloquea
    y otorga la Tinta correspondiente.

    Usa select_for_update() para evitar race conditions si dos signals
    se disparan simultáneamente para el mismo usuario/logro.
    """
    from .models import Achievement, UserAchievement
    from users.models import Profile

    try:
        achievement = Achievement.objects.get(code=achievement_code)
    except Achievement.DoesNotExist:
        # El logro no está en el catálogo aún (seed pendiente), ignorar
        return

    ua, created = UserAchievement.objects.select_for_update().get_or_create(
        user=user,
        achievement=achievement,
        defaults={'current_progress': current},
    )

    if not created:
        # Actualizar progreso solo si mejoró
        if current > ua.current_progress:
            ua.current_progress = current
            ua.save(update_fields=['current_progress', 'updated_at'])

    # Desbloquear si alcanzó el threshold y aún no estaba desbloqueado
    if ua.current_progress >= threshold and ua.unlocked_at is None:
        ua.unlocked_at = timezone.now()
        ua.save(update_fields=['unlocked_at', 'updated_at'])

        # Otorgar Tinta como recompensa si aplica
        if achievement.ink_reward > 0:
            Profile.objects.filter(user=user).update(
                ink_balance=F('ink_balance') + achievement.ink_reward
            )
