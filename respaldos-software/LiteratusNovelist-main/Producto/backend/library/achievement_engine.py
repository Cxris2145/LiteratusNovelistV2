"""
library/achievement_engine.py â€” Motor de evaluaciÃ³n de logros.

ARQUITECTURA:
    - EvaluaciÃ³n signal-driven: se dispara en Django signals (post_save)
      sobre ReadingSession y ReadingProgress.
    - Cada evaluador es una funciÃ³n pura y testeable que recibe el user
      y contexto, evalÃºa la condiciÃ³n y llama a _unlock_or_update().
    - _unlock_or_update() es el Ãºnico punto de escritura en UserAchievement,
      evitando race conditions con get_or_create + update atÃ³mico.

EVALUADORES IMPLEMENTADOS:
    Trigger 'session' (ReadingSession creada):
        - streak_3, streak_7, streak_30: racha de dÃ­as consecutivos
        - night_owl, night_owl_10: lectura entre 00:00 y 04:59
        - early_bird: lectura entre 05:00 y 07:59

    Trigger 'progress' (ReadingProgress actualizado):
        - first_chapter: primer avance de pÃ¡gina registrado
        - first_book: primer libro completado al 100%
        - books_5, books_10: 5 y 10 libros completados
        - classic_explorer_3, classic_explorer_10: libros de un mismo gÃ©nero
"""

import threading

from django.utils import timezone
from django.db import transaction
from django.db.models import Count, F

# Disparadores por actividad de reward_activity (Senda, juegos, reseñas).
ACTIVITY_TRIGGERS = {
    'quiz_passed': 'learning',
    'daily_enigma': 'games',
    'interrogation_win': 'games',
    'review_written': 'reader',
}

# Un logro da XP y la XP puede subir de nivel, que a su vez evalúa logros de colección:
# las evaluaciones anidadas se posponen hasta que termine la que está en curso.
_evaluating = threading.local()


def evaluate_for_user(user, trigger: str, session=None, progress=None, chat_session_id=None):
    """
    Punto de entrada principal del motor.
    Despacha a los evaluadores relevantes segÃºn el trigger.

    Args:
        user: instancia de User
        trigger: 'session' | 'progress' | 'chat' | 'friends' | 'learning' | 'games' | 'reader' | 'collection'
        session: instancia de ReadingSession (trigger='session')
        progress: instancia de ReadingProgress (trigger='progress')
        chat_session_id: ID de la sesiÃ³n de chat (trigger='chat')
    """
    if getattr(_evaluating, 'active', False):
        # Llamada anidada (p. ej. un logro dio XP y eso subió de nivel): se evalúa al terminar.
        if trigger in _DEFERRABLE:
            _evaluating.pending.add(trigger)
        return
    _evaluating.active = True
    _evaluating.pending = set()
    try:
        _run_evaluators(user, trigger, session, progress, chat_session_id)
        while _evaluating.pending:
            _run_evaluators(user, _evaluating.pending.pop())
    finally:
        _evaluating.active = False


# Disparadores que no necesitan contexto: se pueden posponer si llegan anidados.
_DEFERRABLE = {'friends', 'learning', 'games', 'reader', 'collection'}


def _run_evaluators(user, trigger, session=None, progress=None, chat_session_id=None):
    try:
        # Punto de guardado propio: si un evaluador falla, no rompe la transacción de quien llamó.
        with transaction.atomic():
            if trigger == 'session' and session:
                _evaluate_streak(user, session)
                _evaluate_time_based(user, session)
            elif trigger == 'progress' and progress:
                _evaluate_reading_milestones(user, progress)
                _evaluate_genre_exploration(user, progress)
            elif trigger == 'chat':
                _evaluate_social_milestones(user, chat_session_id)
            elif trigger == 'friends':
                _evaluate_tavern_milestones(user)
            elif trigger == 'learning':
                _evaluate_learning(user)
            elif trigger == 'games':
                _evaluate_games(user)
            elif trigger == 'reader':
                _evaluate_reader_activity(user)
            elif trigger == 'collection':
                _evaluate_collection(user)
    except Exception:
        # El motor de logros NO debe bloquear el flujo principal.
        # Errores se ignoran silenciosamente para no romper la sesiÃ³n
        # o el guardado de progreso del usuario.
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("Achievement engine error for user %s (trigger=%s)", user.pk, trigger)


# ---------------------------------------------------------------------------
# EVALUADORES DE RACHA (streak)
# ---------------------------------------------------------------------------

def _evaluate_streak(user, session):
    """
    Calcula la racha actual de dÃ­as consecutivos de lectura y actualiza
    los logros streak_3, streak_7 y streak_30.

    ALGORITMO:
        1. Obtener las fechas Ãºnicas de sesiÃ³n del usuario (solo la fecha, sin hora).
        2. Ordenar desc y calcular cuÃ¡ntos dÃ­as consecutivos hay desde hoy hacia atrÃ¡s.
        3. Comparar contra los thresholds.
    """
    from .models import ReadingSession

    # Fechas Ãºnicas de sesiÃ³n (en timezone local del servidor)
    session_dates = (
        ReadingSession.objects
        .filter(user=user, is_active=True)
        .values_list('started_at', flat=True)
        .order_by('-started_at')
    )

    # Convertir a set de fechas locales Ãºnicas
    unique_dates = sorted(
        set(dt.astimezone(timezone.get_current_timezone()).date() for dt in session_dates),
        reverse=True
    )

    if not unique_dates:
        return

    # Calcular racha desde hoy (o ayer, si no leyÃ³ hoy todavÃ­a)
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
    for code, days in [('streak_3', 3), ('streak_7', 7), ('streak_14', 14), ('streak_30', 30), ('streak_100', 100)]:
        _unlock_or_update(user, code, current=streak, threshold=days)


# ---------------------------------------------------------------------------
# EVALUADORES HORARIOS (time-based)
# ---------------------------------------------------------------------------

def _evaluate_time_based(user, session):
    """
    EvalÃºa logros basados en la hora de inicio de sesiÃ³n.
    - night_owl: sesiÃ³n iniciada entre 00:00 y 04:59 (1 vez)
    - night_owl_10: sesiÃ³n nocturna, 10 veces
    - early_bird: sesiÃ³n iniciada entre 05:00 y 07:59 (1 vez)
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
        _unlock_or_update(user, 'night_owl', current=night_count, threshold=1)
        _unlock_or_update(user, 'night_owl_10', current=night_count, threshold=10)
        _unlock_or_update(user, 'night_owl_25', current=night_count, threshold=25)

    # Sesiones madrugadoras (05:00 - 07:59)
    elif 5 <= local_hour < 8:
        early_count = ReadingSession.objects.filter(
            user=user,
            is_active=True,
            started_at__hour__gte=5,
            started_at__hour__lt=8,
        ).count()
        _unlock_or_update(user, 'early_bird', current=early_count, threshold=1)
        _unlock_or_update(user, 'early_bird_10', current=early_count, threshold=10)


# ---------------------------------------------------------------------------
# EVALUADORES DE PROGRESO DE LECTURA (reading milestones)
# ---------------------------------------------------------------------------

def _evaluate_reading_milestones(user, progress):
    """
    EvalÃºa logros de hitos de lectura:
    - first_chapter: primer avance de pÃ¡gina registrado
    - first_book: primer libro completado al 100%
    - books_5: 5 libros completados
    - books_10: 10 libros completados
    """
    from .models import ReadingProgress

    # Logro: primer capÃ­tulo (cualquier progreso > 0%)
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
            ('books_25', 25),
        ]:
            _unlock_or_update(user, code, current=completed_count, threshold=threshold)


def _evaluate_genre_exploration(user, progress):
    """
    EvalÃºa el logro 'classic_explorer_3' y 'classic_explorer_10':
    Completar libros de un mismo gÃ©nero (el gÃ©nero mÃ¡s leÃ­do).
    """
    from .models import ReadingProgress

    if float(progress.completion_percentage) < 100:
        return

    # GÃ©neros de los libros completados por el usuario, agrupados por cantidad
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

    distinct_genres = len([g for g in genre_counts if g['inventory__edition__book__genres__name']])
    _unlock_or_update(user, 'genres_5', current=distinct_genres, threshold=5)


# ---------------------------------------------------------------------------
# LA SENDA, JUEGOS, LECTURA ACTIVA Y COLECCIÓN
# Cuentan sobre las tablas reales, así no dependen de cuándo se disparó cada evento.
# ---------------------------------------------------------------------------

def _evaluate_learning(user):
    """Niveles aprobados, niveles con 3 estrellas y la última unidad (La Cumbre)."""
    from learning.models import LearningLevel, LearningUnit, UserLevelProgress

    done = UserLevelProgress.objects.filter(user=user, is_completed=True)
    passed = done.count()
    _unlock_or_update(user, 'senda_first', current=passed, threshold=1)
    _unlock_or_update(user, 'senda_10', current=passed, threshold=10)
    _unlock_or_update(user, 'senda_50', current=passed, threshold=50)
    _unlock_or_update(user, 'senda_stars_10', current=done.filter(stars__gte=3).count(), threshold=10)

    last_unit = LearningUnit.objects.order_by('-unit_number').first()
    if last_unit:
        total = LearningLevel.objects.filter(unit=last_unit).count()
        mine = done.filter(level__unit=last_unit).count()
        _unlock_or_update(user, 'senda_summit', current=int(total > 0 and mine >= total), threshold=1)


def _evaluate_games(user):
    """Enigmas descifrados (cada uno paga Tinta una vez al día) e interrogatorios ganados."""
    from ai_engine.models import BlindInterrogationSession
    from .models import InkTransaction

    enigmas = InkTransaction.objects.filter(user=user, concept='daily_enigma').count()
    _unlock_or_update(user, 'enigma_first', current=enigmas, threshold=1)
    _unlock_or_update(user, 'enigma_10', current=enigmas, threshold=10)

    wins = BlindInterrogationSession.objects.filter(user=user, status='won').count()
    _unlock_or_update(user, 'interrogation_first', current=wins, threshold=1)
    _unlock_or_update(user, 'interrogation_10', current=wins, threshold=10)


def _evaluate_reader_activity(user):
    """Subrayados, post-its, marcadores, reseñas y favoritos."""
    from catalog.models import Review
    from .models import UserBookmark, UserFavorite, UserHighlight, UserPostIt

    highlights = UserHighlight.objects.filter(inventory__user=user).count()
    _unlock_or_update(user, 'highlight_first', current=highlights, threshold=1)
    _unlock_or_update(user, 'highlights_50', current=highlights, threshold=50)
    _unlock_or_update(user, 'postits_10', current=UserPostIt.objects.filter(inventory__user=user).count(), threshold=10)
    _unlock_or_update(user, 'bookmarks_10', current=UserBookmark.objects.filter(inventory__user=user).count(), threshold=10)

    reviews = Review.objects.filter(user=user).count()
    _unlock_or_update(user, 'review_first', current=reviews, threshold=1)
    _unlock_or_update(user, 'reviews_10', current=reviews, threshold=10)
    _unlock_or_update(user, 'favorites_10', current=UserFavorite.objects.filter(user=user).count(), threshold=10)


def _evaluate_collection(user):
    """Nivel de lector, cosméticos reunidos (comprados o ganados) y Maguito vestido entero."""
    from learning.models import ShopItem, UserInventoryItem
    from learning.wearables import WEAR_SLOTS
    from users.models import Profile

    profile = Profile.objects.filter(user=user).only('level', 'outfit').first()
    if profile is None:
        return
    _unlock_or_update(user, 'level_5', current=profile.level, threshold=5)

    cosmetic_types = [ShopItem.ItemType.PROFILE_FRAME, ShopItem.ItemType.TITLE, ShopItem.ItemType.MAGUITO_WEAR]
    owned = UserInventoryItem.objects.filter(user=user, quantity__gt=0, item__item_type__in=cosmetic_types).count()
    _unlock_or_update(user, 'bazar_5', current=owned, threshold=5)

    dressed = sum(1 for slot in WEAR_SLOTS if (profile.outfit or {}).get(slot))
    _unlock_or_update(user, 'maguito_full', current=dressed, threshold=len(WEAR_SLOTS))


# ---------------------------------------------------------------------------
# HELPER CENTRAL DE ESCRITURA
# ---------------------------------------------------------------------------

@transaction.atomic
def _unlock_or_update(user, achievement_code: str, current: int, threshold: int):
    """
    Crea o actualiza el registro UserAchievement para el usuario.
    Si current >= threshold y aÃºn no estaba desbloqueado, lo desbloquea
    y otorga la Tinta correspondiente.

    Usa select_for_update() para evitar race conditions si dos signals
    se disparan simultÃ¡neamente para el mismo usuario/logro.
    """
    from .models import Achievement, UserAchievement
    from users.models import Profile

    try:
        achievement = Achievement.objects.select_related('reward_item').get(code=achievement_code)
    except Achievement.DoesNotExist:
        # El logro no estÃ¡ en el catÃ¡logo aÃºn (seed pendiente), ignorar
        return

    ua, created = UserAchievement.objects.select_for_update().get_or_create(
        user=user,
        achievement=achievement,
        defaults={'current_progress': current},
    )

    if not created:
        # Actualizar progreso solo si mejorÃ³
        if current > ua.current_progress:
            ua.current_progress = current
            ua.save(update_fields=['current_progress', 'updated_at'])

    # Desbloquear si alcanzÃ³ el threshold y aÃºn no estaba desbloqueado
    # Manda el umbral del catálogo (editable en el admin): así coincide con lo que muestra la página.
    threshold = achievement.threshold
    if ua.current_progress >= threshold and ua.unlocked_at is None:
        ua.unlocked_at = timezone.now()
        ua.save(update_fields=['unlocked_at', 'updated_at'])

        # Premio cosmético (marco, título o accesorio), gratis y de una vez.
        if achievement.reward_item_id:
            from learning.models import UserInventoryItem
            UserInventoryItem.objects.get_or_create(
                user=user, item_id=achievement.reward_item_id, defaults={'quantity': 1})
            evaluate_for_user(user, 'collection')  # cuenta para "Coleccionista"

        # También entrega la XP configurada cuando el logro no da Tinta.
        reward_activity(user, 'achievement_unlocked', str(ua.id), custom_ink=achievement.ink_reward)


# ---------------------------------------------------------------------------
# MOTOR DE GAMIFICACIÃ“N (Tinta, XP y Niveles)
# ---------------------------------------------------------------------------

@transaction.atomic
def reward_activity(user, activity_type: str, reference_id: str = '', custom_ink: int = None, custom_xp: int = None):
    """
    Otorga Tinta y XP a un usuario por una actividad, y registra la transacciÃ³n.
    Actualiza el nivel si es necesario.
    """
    from django.conf import settings
    from users.models import Profile
    from .models import InkTransaction

    rewards = getattr(settings, 'GAMIFICATION_REWARDS', {})
    
    ink_reward = custom_ink if custom_ink is not None else rewards.get(activity_type, {}).get('ink', 0)
    xp_reward = custom_xp if custom_xp is not None else rewards.get(activity_type, {}).get('xp', 0)

    if ink_reward == 0 and xp_reward == 0:
        trigger = ACTIVITY_TRIGGERS.get(activity_type)
        if trigger:
            evaluate_for_user(user, trigger)
        return

    # Usamos select_for_update para evitar condiciones de carrera en el perfil
    profile = Profile.objects.select_for_update().get(user=user)
    
    profile.ink_balance += ink_reward
    profile.xp += xp_reward
    profile.save(update_fields=['ink_balance', 'xp'])
    _log_daily_activity(user, xp_reward, ink_reward)

    if ink_reward != 0:
        InkTransaction.objects.create(
            user=user,
            amount=ink_reward,
            concept=activity_type,
            reference_id=reference_id,
            balance_after=profile.ink_balance
        )
        
    leveled_up = _check_level_up(profile) if xp_reward > 0 else False

    _update_missions(user, activity_type)

    # Logros que dependen de esta actividad (Senda, juegos, reseñas) y del nivel de lector.
    trigger = ACTIVITY_TRIGGERS.get(activity_type)
    if trigger:
        evaluate_for_user(user, trigger)
    if leveled_up:
        evaluate_for_user(user, 'collection')


def _log_daily_activity(user, xp: int, ink: int):
    """
    Suma lo ganado hoy al registro diario: es el historial que usa el ranking semanal
    y mensual de La Taberna. Todo el XP del sistema pasa por reward_activity.
    """
    from learning.models import DailyActivityLog

    xp, ink = max(xp, 0), max(ink, 0)
    if not xp and not ink:
        return
    log, _ = DailyActivityLog.objects.get_or_create(user=user, date=timezone.localdate())
    DailyActivityLog.objects.filter(pk=log.pk).update(
        xp_earned=F('xp_earned') + xp, ink_earned=F('ink_earned') + ink)


def _update_missions(user, activity_type: str, increment: int = 1):
    """
    Actualiza el progreso de las misiones activas correspondientes al activity_type.
    """
    from .models import Mission, UserMission
    from datetime import timedelta
    
    today = timezone.localdate()
    # Calcular inicio de semana (lunes = 0)
    start_of_week = today - timedelta(days=today.weekday())
    # Calcular inicio de mes
    start_of_month = today.replace(day=1)
    
    active_missions = Mission.objects.filter(is_active_mission=True, is_active=True, activity_type=activity_type)
    
    for mission in active_missions:
        period_start = start_of_week if mission.reset_type == 'weekly' else start_of_month
        
        um, created = UserMission.objects.select_for_update().get_or_create(
            user=user,
            mission=mission,
            period_start=period_start
        )
        
        if um.completed_at is None:
            um.current_count += increment
            if um.current_count >= mission.target_count:
                um.completed_at = timezone.now()
                # Otorga la recompensa extra de la misiÃ³n llamando a reward_activity
                # con un concepto genÃ©rico para evitar loop infinito de activity_type
                # pero indicando la misiÃ³n
                if mission.ink_reward > 0 or mission.xp_reward > 0:
                    reward_activity(
                        user, 
                        'mission_completed', 
                        str(um.id), 
                        custom_ink=mission.ink_reward, 
                        custom_xp=mission.xp_reward
                    )
            um.save(update_fields=['current_count', 'completed_at', 'updated_at'])


def _check_level_up(profile):
    """
    Verifica si el XP actual del perfil amerita una subida de nivel.
    """
    from django.conf import settings
    
    levels = getattr(settings, 'READER_LEVELS', [])
    if not levels:
        return False
        
    # Encontrar el nivel mÃ¡s alto que el usuario puede tener
    new_level = profile.level
    for lvl in sorted(levels, key=lambda x: x['level']):
        if profile.xp >= lvl['xp_required']:
            new_level = lvl['level']
            
    if new_level > profile.level:
        profile.level = new_level
        profile.save(update_fields=['level'])
        return True
    return False


def update_streak(user):
    """
    Actualiza la racha de lectura del usuario (se llama cada vez que lee).
    Se considera una racha si lee al menos una vez al dÃ­a.
    """
    from users.models import Profile
    
    today = timezone.localdate()
    
    try:
        profile = Profile.objects.select_for_update().get(user=user)
        
        # Si ya actualizÃ³ hoy, no hacer nada
        if profile.streak_last_date == today:
            return
            
        # Si ayer leyÃ³, aumentar la racha. Si no, reiniciar a 1.
        yesterday = today - __import__('datetime').timedelta(days=1)
        
        if profile.streak_last_date == yesterday:
            profile.streak_current += 1
            # Dar recompensa por mantener racha
            reward_activity(user, 'streak_bonus_day')
        else:
            profile.streak_current = 1
            
        profile.streak_last_date = today
        profile.save(update_fields=['streak_current', 'streak_last_date'])
        
    except Profile.DoesNotExist:
        pass


def get_user_discount(user):
    """
    Retorna el porcentaje de descuento aplicable segÃºn el nivel del usuario.
    """
    from django.conf import settings
    if not user or not user.is_authenticated:
        return 0
    
    try:
        user_level = user.profile.level
    except Exception:
        return 0

    levels = getattr(settings, 'READER_LEVELS', [])
    for lvl in sorted(levels, key=lambda x: x['level'], reverse=True):
        if user_level >= lvl['level']:
            return lvl.get('discount_percent', 0)
    return 0

# ---------------------------------------------------------------------------
# EVALUADORES SOCIALES (Chat con IA)
# ---------------------------------------------------------------------------

def _evaluate_tavern_milestones(user):
    """La Taberna de Tinta: amigos sentados a tu mesa y brindis recibidos."""
    from community.models import Brindis
    from community.services import friend_ids

    friends = len(friend_ids(user))
    _unlock_or_update(user, 'tavern_first_friend', current=friends, threshold=1)
    _unlock_or_update(user, 'tavern_full_table', current=friends, threshold=5)
    toasts = Brindis.objects.filter(receiver=user).count()
    _unlock_or_update(user, 'tavern_toasted', current=toasts, threshold=10)


def _evaluate_social_milestones(user, chat_session_id=None):
    from ai_engine.models import ChatSession, ChatMessage
    
    has_message = ChatMessage.objects.filter(session__user=user, role='user').exists()
    if has_message:
        _unlock_or_update(user, 'social_first_chat', current=1, threshold=1)
        
    distinct_chars = ChatSession.objects.filter(user=user, messages__role='user').values('avatar').distinct().count()
    _unlock_or_update(user, 'social_5_chars', current=distinct_chars, threshold=6)
    
    distinct_books = ChatSession.objects.filter(user=user, messages__role='user').values('avatar__edition__book').distinct().count()
    _unlock_or_update(user, 'social_10_books', current=distinct_books, threshold=10)
    
    from django.db import models
    user_sessions = ChatSession.objects.filter(user=user).prefetch_related(
        models.Prefetch('messages', queryset=ChatMessage.objects.filter(role='user'), to_attr='user_messages')
    )
    fluent_avatars = set()
    for session in user_sessions:
        if session.avatar_id in fluent_avatars:
            continue
        msgs = session.user_messages
        total = len(msgs)
        if total >= 5:
            fluent = sum(1 for m in msgs if 5 <= len(m.content.split()) <= 30)
            if (fluent / total) >= 0.65:
                fluent_avatars.add(session.avatar_id)
                
    if len(fluent_avatars) >= 1:
        _unlock_or_update(user, 'social_fluent', current=1, threshold=1)
    
    _unlock_or_update(user, 'social_fluent_5', current=len(fluent_avatars), threshold=5)



