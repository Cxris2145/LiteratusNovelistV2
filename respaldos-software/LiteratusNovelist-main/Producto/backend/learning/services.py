"""
learning/services.py — Lógica de Negocio para Senda de Aprendizaje, Racha y Corazones.
"""

import secrets

from django.core.cache import cache
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from users.models import Profile
from library.models import InkTransaction
from library.achievement_engine import reward_activity
from .models import (
    LearningUnit,
    LearningLevel,
    LearningExercise,
    UserLevelProgress,
    UserExerciseAttempt,
    DailyActivityLog,
    ShopItem,
    UserInventoryItem
)
from . import games
from .content.builder import build_skip_test
from .wearables import WEAR_SLOTS, parse_wear_value

# Cosméticos: se compran una sola vez (los consumibles se pueden recomprar).
ONE_TIME_ITEM_TYPES = {
    ShopItem.ItemType.PROFILE_FRAME,
    ShopItem.ItemType.TITLE,
    ShopItem.ItemType.THEME,
    ShopItem.ItemType.MAGUITO_WEAR,
}


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
    # Solo estos campos: xp_earned/ink_earned los suma reward_activity con F() y no deben pisarse.
    log.save(update_fields=['chapters_read', 'levels_completed', 'updated_at'])

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

    # Hitos especiales de racha (normalizados para una economía saludable)
    milestones = {
        7: {'ink': 25, 'xp': 40, 'name': 'Semana Completa'},
        30: {'ink': 75, 'xp': 150, 'name': 'Maratón de 30 Días'},
        50: {'ink': 120, 'xp': 250, 'name': '50 Días de Letras'},
        100: {'ink': 250, 'xp': 500, 'name': 'Centurión Literario'}
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

# Las respuestas que el lector comprueba durante una partida quedan fijadas: la
# primera es la que cuenta al calificar, así la corrección inmediata no sirve para
# probar opciones hasta acertar. Cada partida nueva (GET session) empieza limpia.
LOCKED_ANSWERS_TTL = 2 * 60 * 60


def _locked_key(user, scope) -> str:
    """scope: un LearningLevel o un texto (p. ej. 'skip:<unidad>' para la prueba de salto)."""
    return f'learning:locked:{user.pk}:{getattr(scope, "pk", scope)}'


def reset_locked_answers(user, scope) -> None:
    cache.delete(_locked_key(user, scope))


def lock_answer(user, scope, question_id: str, answer):
    """Guarda la primera respuesta a una actividad y devuelve la que quedó fijada."""
    key = _locked_key(user, scope)
    locked = cache.get(key) or {}
    if question_id not in locked:
        locked[question_id] = answer
        cache.set(key, locked, LOCKED_ANSWERS_TTL)
    return locked[question_id]


def _pop_locked_answers(user, scope) -> dict:
    key = _locked_key(user, scope)
    locked = cache.get(key) or {}
    cache.delete(key)
    return locked


def _check_question(user, scope, questions: list, question_id: str, answer) -> dict | None:
    question = next((q for q in questions if str(q.get('id')) == question_id), None)
    if question is None:
        return None
    recorded = lock_answer(user, scope, question_id, answer)
    fraction = games.grade(question, recorded)
    return {
        'question_id': question_id,
        'is_correct': fraction >= 1,
        'fraction': round(fraction, 2),
        'explanation': question.get('explanation', ''),
        'solution': games.solution(question),
        'recorded_answer': recorded,
    }


def _grade_all(questions: list, answers_payload: dict, locked_answers: dict) -> tuple[int, int, list]:
    """Nota (0-100), aciertos completos y revisión de cada actividad."""
    correct_count = 0
    points = 0.0
    feedback_list = []
    for q in questions:
        q_id = str(q.get('id'))
        # Lo comprobado durante la partida manda sobre lo que llegue al final.
        user_answer = locked_answers.get(q_id, answers_payload.get(q_id))
        # Los juegos con varias piezas dan crédito parcial (3 de 4 parejas = 0.75).
        fraction = games.grade(q, user_answer)
        points += fraction
        if fraction >= 1:
            correct_count += 1
        feedback_list.append({
            'question_id': q_id,
            'prompt': q.get('prompt'),
            'type': q.get('type', 'single_choice'),
            'user_answer': user_answer,
            'is_correct': fraction >= 1,
            'fraction': round(fraction, 2),
            'explanation': q.get('explanation', ''),
            'solution': games.solution(q),
        })
    score = int(round((points / len(questions)) * 100)) if questions else 100
    return score, correct_count, feedback_list


def playable_questions(exercise) -> list:
    """Actividades válidas del ejercicio: las mismas se muestran y se califican."""
    return [q for q in (exercise.questions_data or []) if games.validate(q)]


def check_answer(user, level, question_id: str, answer) -> dict | None:
    """Corrige una actividad al momento (sin gastar corazones) y fija la respuesta."""
    exercise = getattr(level, 'exercise', None)
    if not exercise:
        return None
    return _check_question(user, level, playable_questions(exercise), question_id, answer)

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

    questions = playable_questions(exercise)
    total_questions = len(questions)
    locked_answers = _pop_locked_answers(user, level)

    if total_questions == 0:
        return {'passed': True, 'score': 100, 'stars': 3}

    score, correct_count, feedback_list = _grade_all(questions, answers_payload, locked_answers)
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

        # Verificar si es la primera vez que completa este nivel para evitar farmeo infinito
        already_completed = UserLevelProgress.objects.filter(
            user=user, level=level, is_completed=True
        ).exists()

        if not already_completed:
            # Recompensas completas SOLO en la primera superación
            xp_earned = level.xp_reward
            ink_earned = min(level.ink_reward, 10)

            # Bonus por 3 estrellas
            if stars == 3:
                xp_earned += 10
                ink_earned += 3

            reward_activity(user, 'quiz_passed', reference_id=str(level.id), custom_ink=ink_earned, custom_xp=xp_earned)
        else:
            # Práctica de un nivel ya completado: no genera tinta adicional (previene abuso y exploits)
            xp_earned = 5
            ink_earned = 0
            reward_activity(user, 'quiz_practice', reference_id=str(level.id), custom_ink=0, custom_xp=xp_earned)

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

        # El nivel debe estar guardado antes de contar niveles y estrellas (también al practicar).
        from library.achievement_engine import evaluate_for_user
        evaluate_for_user(user, 'learning')

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
# DESBLOQUEO DE UNIDADES Y NIVELES
# ---------------------------------------------------------------------------

def is_completed_in(progress_map: dict, level) -> bool:
    progress = progress_map.get(level.id)
    return bool(progress and progress.is_completed)


def open_unit_ids(units, progress_map) -> set:
    """
    Unidades abiertas: la primera, las que siguen a una unidad con su prueba aprobada
    y las que el lector ya empezó (así nadie pierde acceso a lo que venía jugando).
    """
    open_ids = set()
    previous_exam_passed = True
    for unit in units:
        levels = list(unit.levels.all())
        started = any(is_completed_in(progress_map, lvl) for lvl in levels)
        if previous_exam_passed or started:
            open_ids.add(unit.id)
        exams = [lvl for lvl in levels if lvl.is_exam] or levels[-1:]
        previous_exam_passed = all(is_completed_in(progress_map, lvl) for lvl in exams)
    return open_ids


def _units_and_progress(user):
    units = list(LearningUnit.objects.prefetch_related('levels').order_by('order'))
    progress_map = {p.level_id: p for p in UserLevelProgress.objects.filter(user=user)}
    return units, progress_map


def is_level_unlocked(user, level) -> bool:
    """Misma regla que el mapa: unidad abierta y el nivel anterior completado."""
    units, progress_map = _units_and_progress(user)
    if is_completed_in(progress_map, level):
        return True
    if level.unit_id not in open_unit_ids(units, progress_map):
        return False
    unit_levels = next((list(u.levels.all()) for u in units if u.id == level.unit_id), [])
    position = next((i for i, lvl in enumerate(unit_levels) if lvl.id == level.id), 0)
    return position == 0 or is_completed_in(progress_map, unit_levels[position - 1])


# ---------------------------------------------------------------------------
# PRUEBA DE SALTO: saltarse unidades aprobando un examen muy difícil
# ---------------------------------------------------------------------------
# Cada intento arma un examen nuevo y al azar con el material de todas las unidades
# que se saltan (no se puede memorizar reintentando). Se exige 90 %, el Relámpago
# da 4 segundos por afirmación y fallar cuesta un corazón. Al aprobar, las unidades
# saltadas quedan completadas (sin estrellas: se pueden rejugar para ganarlas).

SKIP_REQUIRED_SCORE = 90
SKIP_SESSION_TTL = 2 * 60 * 60
SKIP_XP_PER_UNIT = 30
SKIP_INK_PER_UNIT = 8


def _skip_scope(unit) -> str:
    return f'skip:{unit.pk}'


def _skip_key(user, unit) -> str:
    return f'learning:skip:{user.pk}:{unit.pk}'


def skipped_units_for(user, target) -> list | None:
    """Unidades anteriores sin terminar que se saltan; None si la unidad ya está abierta."""
    units, progress_map = _units_and_progress(user)
    if target.id in open_unit_ids(units, progress_map):
        return None
    return [
        unit for unit in units
        if unit.order < target.order
        and not all(is_completed_in(progress_map, lvl) for lvl in unit.levels.all())
    ]


def start_skip_test(user, target) -> dict:
    profile = user.profile
    calculate_and_sync_hearts(profile)
    if profile.hearts <= 0:
        return {'error': 'NO_HEARTS', 'hearts': 0,
                'message': 'No tienes corazones disponibles. Espera su recarga o adquiere una en El Bazar.'}

    skipped = skipped_units_for(user, target)
    if skipped is None:
        return {'error': 'ALREADY_OPEN', 'message': 'Esta unidad ya está abierta: no hace falta saltar.'}

    exercise = build_skip_test(target.unit_number, [u.unit_number for u in skipped], seed=secrets.token_hex(8))
    cache.set(_skip_key(user, target), {
        'questions': exercise['questions_data'],
        'skipped_ids': [str(u.id) for u in skipped],
    }, SKIP_SESSION_TTL)
    reset_locked_answers(user, _skip_scope(target))

    return {
        'level_id': str(target.id),
        'level_title': f'Salta a la Unidad {target.unit_number}',
        'unit_title': target.title,
        'unit_number': target.unit_number,
        'difficulty': 'dificil',
        'required_score': SKIP_REQUIRED_SCORE,
        'book_title': exercise['title'],
        'author_name': '',
        'source_type': 'pedagogic_original',
        'pages': [],
        'questions_data': exercise['questions_data'],
        'skipped_units': [u.unit_number for u in skipped],
    }


def check_skip_answer(user, target, question_id: str, answer) -> dict | None:
    session = cache.get(_skip_key(user, target))
    if not session:
        return {'error': 'SESSION_EXPIRED'}
    return _check_question(user, _skip_scope(target), session['questions'], question_id, answer)


@transaction.atomic
def submit_skip_test(user, target, answers_payload: dict, duration_seconds: int = 0) -> dict:
    profile = Profile.objects.select_for_update().get(user=user)
    calculate_and_sync_hearts(profile)
    if profile.hearts <= 0:
        return {'error': 'NO_HEARTS', 'hearts': 0, 'passed': False,
                'message': 'No tienes corazones disponibles. Espera su recarga o adquiere una en El Bazar.'}

    key = _skip_key(user, target)
    session = cache.get(key)
    if not session:
        return {'error': 'SESSION_EXPIRED', 'passed': False,
                'message': 'La prueba expiró. Vuelve a empezarla desde La Senda.'}
    cache.delete(key)

    questions = session['questions']
    locked_answers = _pop_locked_answers(user, _skip_scope(target))
    score, correct_count, feedback_list = _grade_all(questions, answers_payload, locked_answers)
    passed = score >= SKIP_REQUIRED_SCORE

    skipped = list(LearningUnit.objects.filter(id__in=session['skipped_ids'])
                   .prefetch_related('levels').order_by('order'))
    hearts_lost = xp_earned = ink_earned = stars = 0

    if not passed:
        hearts_lost = 1
        consume_heart(profile)
    else:
        stars = 3 if score == 100 else 2 if score >= 95 else 1
        xp_earned = SKIP_XP_PER_UNIT * len(skipped)
        ink_earned = SKIP_INK_PER_UNIT * len(skipped)
        reward_activity(user, 'quiz_passed', reference_id=f'skip:{target.id}',
                        custom_ink=ink_earned, custom_xp=xp_earned)
        ensure_streak(user, 'quiz_passed')
        now = timezone.now()
        for unit in skipped:
            for level in unit.levels.all():
                progress, created = UserLevelProgress.objects.get_or_create(
                    user=user, level=level,
                    defaults={'is_completed': True, 'completed_at': now, 'stars': 0, 'best_score': 0})
                if not created and not progress.is_completed:
                    progress.is_completed = True
                    progress.completed_at = now
                    progress.save(update_fields=['is_completed', 'completed_at'])

        from library.achievement_engine import evaluate_for_user
        evaluate_for_user(user, 'learning')

    # El intento queda registrado en la prueba de la última unidad saltada.
    anchor_levels = list(skipped[-1].levels.all()) if skipped else list(target.levels.all())
    anchor = next((lvl for lvl in anchor_levels if lvl.is_exam), anchor_levels[-1] if anchor_levels else None)
    if anchor:
        UserExerciseAttempt.objects.create(
            user=user, level=anchor, score=score, passed=passed, answers_log=feedback_list,
            xp_earned=xp_earned, ink_earned=ink_earned, duration_seconds=duration_seconds,
            hearts_lost=hearts_lost,
        )

    profile.refresh_from_db()
    return {
        'passed': passed,
        'score': score,
        'correct_count': correct_count,
        'total_questions': len(questions),
        'stars': stars,
        'xp_earned': xp_earned,
        'ink_earned': ink_earned,
        'hearts_remaining': profile.hearts,
        'ink_balance': profile.ink_balance,
        'streak_current': profile.streak_current,
        'feedback': feedback_list,
        'skipped_units': [u.unit_number for u in skipped],
        'unlocked_unit': target.unit_number if passed else None,
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

    if not item.is_purchasable:
        return {'success': False, 'error': 'NOT_FOR_SALE',
                'message': 'Este artículo no se vende: se gana desbloqueando un logro.'}

    if profile.ink_balance < item.cost_ink:
        return {
            'success': False,
            'error': 'INSUFFICIENT_INK',
            'message': f'Tinta insuficiente. Tienes {profile.ink_balance} 🖋️ y requieres {item.cost_ink} 🖋️.'
        }

    if item.item_type == ShopItem.ItemType.STREAK_SHIELD and profile.streak_shields >= 2:
        return {'success': False, 'error': 'MAX_SHIELDS', 'message': 'Ya tienes el máximo de 2 escudos protectores.'}

    # Los cosméticos se compran una vez; volver a pagarlos no da nada nuevo.
    if (item.item_type in ONE_TIME_ITEM_TYPES
            and UserInventoryItem.objects.filter(user=user, item=item, quantity__gt=0).exists()):
        return {'success': False, 'error': 'ALREADY_OWNED', 'message': 'Ya tienes este artículo en tu inventario.'}

    wear = None
    if item.item_type == ShopItem.ItemType.MAGUITO_WEAR:
        wear = parse_wear_value(item.value)
        if wear is None:
            return {'success': False, 'error': 'ITEM_NOT_FOUND', 'message': 'Artículo no disponible en El Bazar.'}

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

    # La ropa de Maguito se pone al comprarla: el usuario ya se la probó en el probador.
    if wear is not None:
        slot, variant = wear
        profile.outfit = {**(profile.outfit or {}), slot: variant}
        profile.save(update_fields=['outfit'])

    if item.item_type in ONE_TIME_ITEM_TYPES:
        _evaluate_collection_achievements(user)
        # Un logro puede añadir Tinta: devolver el saldo después de esos premios.
        profile.refresh_from_db()

    return {
        'success': True,
        'item_name': item.name,
        'item_type': item.item_type,
        'ink_balance': profile.ink_balance,
        'streak_shields': profile.streak_shields,
        'hearts': profile.hearts,
        'outfit': profile.outfit or {},
        'message': f'¡Has adquirido "{item.name}" con éxito!' + (' Tu Maguito ya lo lleva puesto.' if wear else '')
    }


@transaction.atomic
def equip_cosmetic_item(user, item_code: str) -> dict:
    """
    Equipa un marco, tema o título cosmético previamente adquirido.
    """
    profile = Profile.objects.select_for_update().get(user=user)
    try:
        inv = UserInventoryItem.objects.select_related('item').get(user=user, item__code=item_code, quantity__gt=0)
    except UserInventoryItem.DoesNotExist:
        return {'success': False, 'error': 'NOT_OWNED', 'message': 'Debes adquirir este artículo primero en El Bazar.'}

    item = inv.item
    if item.item_type == ShopItem.ItemType.PROFILE_FRAME:
        profile.equipped_frame = item.value or item.code
        profile.save(update_fields=['equipped_frame'])

    elif item.item_type == ShopItem.ItemType.TITLE:
        profile.equipped_title = item.value or item.name
        profile.save(update_fields=['equipped_title'])

    elif item.item_type == ShopItem.ItemType.THEME:
        profile.theme = item.value or item.code
        profile.save(update_fields=['theme'])

    elif item.item_type == ShopItem.ItemType.MAGUITO_WEAR:
        wear = parse_wear_value(item.value)
        if wear is None:
            return {'success': False, 'error': 'ITEM_NOT_FOUND', 'message': 'Este accesorio ya no está disponible.'}
        slot, variant = wear
        profile.outfit = {**(profile.outfit or {}), slot: variant}
        profile.save(update_fields=['outfit'])
        _evaluate_collection_achievements(user)

    return {
        'success': True,
        'message': f'Has equipado "{item.name}" correctamente.',
        'equipped_frame': profile.equipped_frame,
        'equipped_title': profile.equipped_title,
        'theme': profile.theme,
        'outfit': profile.outfit or {},
    }


@transaction.atomic
def unequip_wearable(user, slot: str) -> dict:
    """
    Quita el accesorio de un espacio (Maguito vuelve a llevar lo de siempre ahí),
    o el marco ('frame') o el título ('title') del perfil.
    """
    if slot in ('frame', 'title'):
        profile = Profile.objects.select_for_update().get(user=user)
        field = 'equipped_frame' if slot == 'frame' else 'equipped_title'
        setattr(profile, field, '')
        profile.save(update_fields=[field])
        return {'success': True, 'message': 'Listo, lo guardaste en el baúl.',
                'equipped_frame': profile.equipped_frame, 'equipped_title': profile.equipped_title}
    if slot not in WEAR_SLOTS:
        return {'success': False, 'error': 'INVALID_SLOT', 'message': 'Ese espacio de vestuario no existe.'}
    profile = Profile.objects.select_for_update().get(user=user)
    outfit = dict(profile.outfit or {})
    outfit.pop(slot, None)
    profile.outfit = outfit
    profile.save(update_fields=['outfit'])
    return {'success': True, 'message': 'Accesorio guardado en el baúl.', 'outfit': outfit}


def _evaluate_collection_achievements(user):
    """Logros de colección (Coleccionista, Maguito de Gala). Nunca interrumpe la compra."""
    from library.achievement_engine import evaluate_for_user
    evaluate_for_user(user, 'collection')
