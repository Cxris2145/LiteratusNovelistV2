"""
learning/services.py — Lógica de Negocio para Senda de Aprendizaje, Racha y Corazones.
"""

from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from users.models import Profile
from library.models import InkTransaction
from library.achievement_engine import reward_activity
from .models import (
    LearningLevel,
    LearningExercise,
    UserLevelProgress,
    UserExerciseAttempt,
    DailyActivityLog,
    ShopItem,
    UserInventoryItem
)


# ---------------------------------------------------------------------------
# GESTIÓN DE VIDAS / CORAZONES
# ---------------------------------------------------------------------------

def calculate_and_sync_hearts(profile: Profile) -> int:
    """
    Calcula la regeneración pasiva de corazones (1 corazón cada 30 min = 1800 seg)
    y persiste el estado actualizado en el perfil.
    """
    if profile.hearts >= 5:
        return 5

    now = timezone.now()
    elapsed = (now - profile.hearts_last_updated).total_seconds()
    regen = int(elapsed // 1800)

    if regen > 0:
        profile.hearts = min(5, profile.hearts + regen)
        # Avanzar el timestamp solo por los bloques de 30 min consumidos
        profile.hearts_last_updated = profile.hearts_last_updated + timedelta(seconds=regen * 1800)
        profile.save(update_fields=['hearts', 'hearts_last_updated'])

    return profile.hearts


def consume_heart(profile: Profile) -> int:
    """
    Descuenta 1 vida al cometer un fallo en un ejercicio.
    Retorna la cantidad de vidas restantes.
    """
    calculate_and_sync_hearts(profile)
    if profile.hearts > 0:
        profile.hearts -= 1
        # Si venía de 5 vidas, reiniciamos el reloj de regeneración desde ahora
        if profile.hearts == 4:
            profile.hearts_last_updated = timezone.now()
        profile.save(update_fields=['hearts', 'hearts_last_updated'])
    return profile.hearts


def refill_hearts(user) -> int:
    """
    Restaura las vidas del usuario a 5.
    """
    profile = user.profile
    profile.hearts = 5
    profile.hearts_last_updated = timezone.now()
    profile.save(update_fields=['hearts', 'hearts_last_updated'])
    return 5


# ---------------------------------------------------------------------------
# GESTIÓN AVANZADA DE RACHA (STREAK ENGINE)
# ---------------------------------------------------------------------------

@transaction.atomic
def ensure_streak(user, activity_type: str = 'quiz_passed') -> dict:
    """
    Valida y asegura la racha diaria del usuario.
    Se ejecuta al completar un nivel de la senda o al leer en el lector.
    Maneja escudos protectores y récord histórico de racha.
    """
    profile = Profile.objects.select_for_update().get(user=user)
    today = timezone.localdate()
    yesterday = today - timedelta(days=1)
    two_days_ago = today - timedelta(days=2)

    streak_before = profile.streak_current
    shield_consumed = False
    streak_extended = False

    # Actualizar o crear log diario
    log, _ = DailyActivityLog.objects.get_or_create(
        user=user,
        date=today,
        defaults={'chapters_read': 0, 'levels_completed': 0, 'xp_earned': 0, 'ink_earned': 0}
    )
    if activity_type == 'quiz_passed':
        log.levels_completed += 1
    elif activity_type == 'chapter_read':
        log.chapters_read += 1
    log.save()

    # Caso 1: Ya validada hoy
    if profile.streak_last_date == today:
        return {
            'streak_current': profile.streak_current,
            'streak_max': profile.streak_max,
            'shield_used': False,
            'is_new_day': False,
        }

    # Caso 2: Última racha fue ayer -> Continuidad perfecta
    if profile.streak_last_date == yesterday:
        profile.streak_current += 1
        streak_extended = True
        reward_activity(user, 'streak_bonus_day')

    # Caso 3: No leyó ayer (última racha fue hace 2 días) -> ¿Tiene escudo?
    elif profile.streak_last_date == two_days_ago and profile.streak_shields > 0:
        profile.streak_shields -= 1
        profile.streak_current += 1
        shield_consumed = True
        streak_extended = True
        reward_activity(user, 'streak_bonus_day')

    # Caso 4: Racha rota o primera vez
    else:
        profile.streak_current = 1
        streak_extended = True

    # Actualizar récord histórico
    if profile.streak_current > profile.streak_max:
        profile.streak_max = profile.streak_current

    profile.streak_last_date = today
    profile.save(update_fields=['streak_current', 'streak_max', 'streak_shields', 'streak_last_date'])

    # Hitos especiales de racha
    milestones = {
        7: {'ink': 30, 'xp': 50, 'name': 'Semana Completa'},
        30: {'ink': 150, 'xp': 200, 'name': 'Maratón de 30 Días'},
        50: {'ink': 300, 'xp': 500, 'name': '50 Días de Letras'},
        100: {'ink': 700, 'xp': 1000, 'name': 'Centurión Literario'}
    }
    if profile.streak_current in milestones:
        m = milestones[profile.streak_current]
        reward_activity(user, 'streak_milestone', custom_ink=m['ink'], custom_xp=m['xp'])

    return {
        'streak_current': profile.streak_current,
        'streak_max': profile.streak_max,
        'shield_used': shield_consumed,
        'is_new_day': True,
        'streak_before': streak_before,
    }


def get_streak_details(user) -> dict:
    """
    Retorna el estado completo de racha para el frontend y widget del header.
    """
    profile = user.profile
    today = timezone.localdate()
    yesterday = today - timedelta(days=1)

    is_secured_today = (profile.streak_last_date == today)
    
    # Racha en peligro: si tiene racha activa, aún no asegura hoy y es tarde o la racha es frágil
    is_in_danger = (not is_secured_today and profile.streak_current > 0 and profile.streak_last_date == yesterday)
    
    # Racha recuperable: si perdió la racha ayer y hoy tiene 0 o 1
    can_repair = (profile.streak_last_date and profile.streak_last_date < yesterday and profile.streak_current <= 1)

    # Últimos 30 días para el heatmap/calendario
    thirty_days_ago = today - timedelta(days=29)
    logs = {
        log.date.isoformat(): {
            'chapters_read': log.chapters_read,
            'levels_completed': log.levels_completed,
            'xp_earned': log.xp_earned,
            'ink_earned': log.ink_earned,
            'active': (log.chapters_read > 0 or log.levels_completed > 0)
        }
        for log in DailyActivityLog.objects.filter(user=user, date__gte=thirty_days_ago)
    }

    calendar = []
    curr = thirty_days_ago
    while curr <= today:
        key = curr.isoformat()
        calendar.append({
            'date': key,
            'day': curr.day,
            'day_name': curr.strftime('%a'),
            'active': logs.get(key, {}).get('active', False),
            'is_today': (curr == today),
        })
        curr += timedelta(days=1)

    return {
        'streak_current': profile.streak_current,
        'streak_max': profile.streak_max,
        'streak_shields': profile.streak_shields,
        'streak_last_date': profile.streak_last_date,
        'is_secured_today': is_secured_today,
        'is_in_danger': is_in_danger,
        'can_repair': can_repair,
        'calendar': calendar,
    }


# ---------------------------------------------------------------------------
# EVALUACIÓN DE EJERCICIOS Y PROGRESIÓN DE NIVEL
# ---------------------------------------------------------------------------

@transaction.atomic
def evaluate_and_record_attempt(user, level_id: str, answers_payload: dict, duration_seconds: int = 0) -> dict:
    """
    Evalúa las respuestas de un ejercicio, calcula la nota, descuenta vidas si falló,
    otorga XP y Tinta si aprobó, y actualiza el UserLevelProgress.
    """
    profile = Profile.objects.select_for_update().get(user=user)
    calculate_and_sync_hearts(profile)

    if profile.hearts <= 0:
        return {
            'error': 'NO_HEARTS',
            'message': 'No tienes corazones disponibles. Espera su recarga o adquiere una en El Bazar.',
            'hearts': 0,
            'passed': False
        }

    level = LearningLevel.objects.select_related('unit').get(pk=level_id)
    exercise = getattr(level, 'exercise', None)

    if not exercise:
        return {
            'error': 'NO_EXERCISE',
            'message': 'Este nivel no tiene un ejercicio configurado aún.',
            'passed': False
        }

    questions = exercise.questions_data
    total_questions = len(questions)

    if total_questions == 0:
        return {'passed': True, 'score': 100, 'stars': 3}

    correct_count = 0
    feedback_list = []

    for q in questions:
        q_id = str(q.get('id'))
        q_type = q.get('type', 'single_choice')
        user_answer = answers_payload.get(q_id)
        is_correct = False

        if q_type in ['single_choice', 'context_vocabulary', 'synonym_replacement', 'true_false', 'fill_blank', 'character_role']:
            # Buscar cuál opción es la correcta
            correct_opt = next((opt for opt in q.get('options', []) if opt.get('is_correct')), None)
            correct_opt_id = correct_opt.get('id') if correct_opt else None
            is_correct = (str(user_answer) == str(correct_opt_id))

        elif q_type == 'order_events':
            # user_answer debe ser una lista de strings con el orden correcto
            expected_order = q.get('order_items', [])
            is_correct = (list(user_answer or []) == expected_order)

        if is_correct:
            correct_count += 1

        feedback_list.append({
            'question_id': q_id,
            'prompt': q.get('prompt'),
            'type': q_type,
            'user_answer': user_answer,
            'is_correct': is_correct,
            'explanation': q.get('explanation', '')
        })

    score = int((correct_count / total_questions) * 100)
    passed = score >= level.required_score

    hearts_lost = 0
    xp_earned = 0
    ink_earned = 0
    stars = 0

    if not passed:
        hearts_lost = 1
        consume_heart(profile)
    else:
        # Calcular estrellas
        if score == 100:
            stars = 3
        elif score >= 85:
            stars = 2
        else:
            stars = 1

        # Recompensas base del nivel
        xp_earned = level.xp_reward
        ink_earned = level.ink_reward

        # Bonus por 3 estrellas
        if stars == 3:
            xp_earned += 15
            ink_earned += 5

        # Otorgar recompensas en el sistema central
        reward_activity(user, 'quiz_passed', reference_id=str(level.id), custom_ink=ink_earned, custom_xp=xp_earned)

        # Actualizar racha diaria
        ensure_streak(user, 'quiz_passed')

        # Actualizar progreso del usuario en este nivel
        prog, _ = UserLevelProgress.objects.get_or_create(
            user=user,
            level=level,
            defaults={'stars': stars, 'best_score': score, 'is_completed': True, 'completed_at': timezone.now()}
        )
        prog.attempts_count += 1
        if score > prog.best_score:
            prog.best_score = score
        if stars > prog.stars:
            prog.stars = stars
        prog.is_completed = True
        prog.completed_at = timezone.now()
        prog.save()

    # Guardar auditoría del intento
    UserExerciseAttempt.objects.create(
        user=user,
        level=level,
        score=score,
        passed=passed,
        answers_log=feedback_list,
        xp_earned=xp_earned,
        ink_earned=ink_earned,
        duration_seconds=duration_seconds,
        hearts_lost=hearts_lost
    )

    # Refrescar perfil para retornar saldo actualizado
    profile.refresh_from_db()

    return {
        'passed': passed,
        'score': score,
        'correct_count': correct_count,
        'total_questions': total_questions,
        'stars': stars,
        'xp_earned': xp_earned,
        'ink_earned': ink_earned,
        'hearts_remaining': profile.hearts,
        'ink_balance': profile.ink_balance,
        'streak_current': profile.streak_current,
        'feedback': feedback_list
    }


# ---------------------------------------------------------------------------
# EL BAZAR LITERARIO (TIENDA DE GAMIFICACIÓN)
# ---------------------------------------------------------------------------

@transaction.atomic
def purchase_shop_item(user, item_code: str) -> dict:
    """
    Compra un artículo del Bazar usando Tinta de forma atómica.
    Aplica el efecto inmediatamente si es consumible (escudo, poción, vidas)
    o lo añade al inventario si es cosmético (marcos, títulos, temas).
    """
    profile = Profile.objects.select_for_update().get(user=user)

    try:
        item = ShopItem.objects.get(code=item_code, is_active=True)
    except ShopItem.DoesNotExist:
        return {'success': False, 'error': 'ITEM_NOT_FOUND', 'message': 'Artículo no disponible en El Bazar.'}

    if profile.ink_balance < item.cost_ink:
        return {
            'success': False,
            'error': 'INSUFFICIENT_INK',
            'message': f'Tinta insuficiente. Tienes {profile.ink_balance} 🖋️ y requieres {item.cost_ink} 🖋️.'
        }

    # Descontar Tinta
    profile.ink_balance -= item.cost_ink
    profile.save(update_fields=['ink_balance'])

    # Registrar en el ledger inmutable de Tinta
    InkTransaction.objects.create(
        user=user,
        amount=-item.cost_ink,
        concept=f"shop_purchase_{item.item_type}",
        reference_id=str(item.id),
        balance_after=profile.ink_balance
    )

    # Aplicar efecto según el tipo de artículo
    if item.item_type == ShopItem.ItemType.STREAK_SHIELD:
        if profile.streak_shields >= 2:
            return {'success': False, 'error': 'MAX_SHIELDS', 'message': 'Ya tienes el máximo de 2 escudos protectores.'}
        profile.streak_shields += 1
        profile.save(update_fields=['streak_shields'])

    elif item.item_type == ShopItem.ItemType.HEARTS_REFILL:
        profile.hearts = 5
        profile.hearts_last_updated = timezone.now()
        profile.save(update_fields=['hearts', 'hearts_last_updated'])

    elif item.item_type == ShopItem.ItemType.STREAK_REPAIR:
        # Si la racha se rompió, restaurar a mejor racha reciente o +1
        if profile.streak_current <= 1 and profile.streak_max > 1:
            profile.streak_current = profile.streak_max
            profile.streak_last_date = timezone.localdate()
            profile.save(update_fields=['streak_current', 'streak_last_date'])

    # Guardar en inventario de usuario
    inv, created = UserInventoryItem.objects.get_or_create(
        user=user,
        item=item,
        defaults={'quantity': 1}
    )
    if not created:
        inv.quantity += 1
        inv.save(update_fields=['quantity'])

    return {
        'success': True,
        'item_name': item.name,
        'item_type': item.item_type,
        'ink_balance': profile.ink_balance,
        'streak_shields': profile.streak_shields,
        'hearts': profile.hearts,
        'message': f'¡Has adquirido "{item.name}" con éxito!'
    }


def equip_cosmetic_item(user, item_code: str) -> dict:
    """
    Equipa un marco, tema o título cosmético previamente adquirido.
    """
    profile = user.profile
    try:
        inv = UserInventoryItem.objects.select_related('item').get(user=user, item__code=item_code)
    except UserInventoryItem.DoesNotExist:
        return {'success': False, 'error': 'NOT_OWNED', 'message': 'Debes adquirir este artículo primero en El Bazar.'}

    item = inv.item
    if item.item_type == ShopItem.ItemType.PROFILE_FRAME:
        profile.equipped_frame = item.value or item.code
        profile.save(update_fields=['equipped_frame'])

    elif item.item_type == ShopItem.ItemType.TITLE:
        profile.equipped_title = item.name
        profile.save(update_fields=['equipped_title'])

    elif item.item_type == ShopItem.ItemType.THEME:
        profile.theme = item.value or item.code
        profile.save(update_fields=['theme'])

    return {
        'success': True,
        'message': f'Has equipado "{item.name}" correctamente.',
        'equipped_frame': profile.equipped_frame,
        'equipped_title': profile.equipped_title,
        'theme': profile.theme
    }
