from datetime import datetime, time, timedelta, timezone as dt_timezone
from decimal import Decimal
from hashlib import sha256
from zoneinfo import ZoneInfo
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied
from finance.subscriptions import subscription_for, has_paid_access
from library.models import UserInventory, ReadingProgress, InkTransaction
from users.models import Profile
from .models import DailyAIUsage, AIActivityLease, AIUsageEvent, InkChatQuote, ChatMessage


class UsageDenied(APIException):
    status_code = 402
    def __init__(self, code, message):
        super().__init__({'error': code, 'message': message})


def digest(message):
    return sha256(message.encode('utf-8')).hexdigest()


def day_bounds(now=None):
    now = now or timezone.now()
    zone = ZoneInfo(settings.AI_USAGE_TIME_ZONE)
    date = now.astimezone(zone).date()
    start, end = bounds_for_date(date)
    return date, start, end


def bounds_for_date(date):
    zone = ZoneInfo(settings.AI_USAGE_TIME_ZONE)
    return (datetime.combine(date, time.min, zone).astimezone(dt_timezone.utc),
        datetime.combine(date + timedelta(days=1), time.min, zone).astimezone(dt_timezone.utc))


def check_avatar(user, avatar):
    from catalog.age import ensure_book_access
    ensure_book_access(user, avatar.edition.book)
    owned = UserInventory.objects.filter(user=user, edition=avatar.edition).first()
    if not owned and not (avatar.is_major_character or avatar.is_author):
        raise PermissionDenied('Añade esta obra a tu biblioteca para conversar con sus personajes.')
    page = ReadingProgress.objects.filter(inventory=owned).values_list('current_page', flat=True).first() if owned else 0
    if not avatar.is_author and (page or 0) < avatar.unlock_at_chapter:
        raise PermissionDenied('Continúa leyendo para desbloquear este personaje.')


def settle_activity(user, usage, now):
    start, end = bounds_for_date(usage.date)
    now = min(now, end)
    accounted = max(usage.accounted_at or now, start)
    expiry = AIActivityLease.objects.filter(user=user, expires_at__gt=accounted).order_by('-expires_at').values_list('expires_at', flat=True).first()
    if expiry:
        elapsed = max(0, int((min(now, expiry) - accounted).total_seconds()))
        usage.active_seconds += elapsed
        # Carry subsecond intervals forward; frequent requests cannot erase time.
        usage.accounted_at = accounted + timedelta(seconds=elapsed) if now <= expiry else now
    else:
        usage.accounted_at = now
    usage.save(update_fields=['active_seconds', 'accounted_at'])


def release_event(event, profile, attempts=None):
    usage = DailyAIUsage.objects.select_for_update().get(pk=event.usage_id)
    if event.mode == 'plan':
        usage.tokens_reserved = max(0, usage.tokens_reserved - event.reserved_tokens)
        usage.save(update_fields=['tokens_reserved'])
    elif event.ink_cost:
        profile.ink_balance += event.ink_cost
        profile.save(update_fields=['ink_balance'])
    event.status = 'failed'
    event.attempts = attempts or event.attempts
    event.estimated_cost = sum((Decimal(a.get('estimated_cost', '0')) for a in event.attempts), Decimal(0))
    event.save()


def cleanup(user, profile, now):
    for event in AIUsageEvent.objects.select_for_update().filter(user=user, status='reserved', expires_at__lte=now):
        release_event(event, profile)


def locked_usage(user, now):
    date, start, _ = day_bounds(now)
    previous = DailyAIUsage.objects.select_for_update().filter(user=user, date__lt=date).order_by('-date').first()
    if previous:
        settle_activity(user, previous, now)
    usage, _ = DailyAIUsage.objects.get_or_create(user=user, date=date, defaults={'accounted_at': start})
    return DailyAIUsage.objects.select_for_update().get(pk=usage.pk)


def snapshot(user):
    now = timezone.now()
    with transaction.atomic():
        profile = Profile.objects.select_for_update().get(user=user)
        cleanup(user, profile, now)
        usage = locked_usage(user, now)
        settle_activity(user, usage, now)
        sub = subscription_for(user)
        active = has_paid_access(sub, now)
        tokens_limit = sub.plan.daily_token_limit if active else 0
        time_limit = sub.plan.daily_time_limit if active else None
        remaining = max(0, tokens_limit - usage.tokens_used - usage.tokens_reserved)
        available = active and remaining > 0 and (time_limit is None or usage.active_seconds < time_limit)
        return {'date': str(usage.date), 'server_now': now, 'resets_at': day_bounds(now)[2],
            'tokens_used': usage.tokens_used, 'tokens_reserved': usage.tokens_reserved,
            'token_limit': tokens_limit, 'tokens_remaining': remaining,
            'active_seconds': usage.active_seconds, 'time_limit': time_limit,
            'plan_available': available, 'has_plan': active, 'ink_balance': profile.ink_balance}


def heartbeat(user, session, client_id, active):
    check_avatar(user, session.avatar)
    now = timezone.now()
    with transaction.atomic():
        Profile.objects.select_for_update().get(user=user)
        usage = locked_usage(user, now)
        settle_activity(user, usage, now)
        if active and has_paid_access(subscription_for(user), now):
            AIActivityLease.objects.update_or_create(user=user, client_id=client_id,
                defaults={'session': session, 'expires_at': now + timedelta(seconds=35)})
        else:
            AIActivityLease.objects.filter(user=user, client_id=client_id).delete()
        AIActivityLease.objects.filter(user=user, expires_at__lt=now - timedelta(days=1)).delete()
    return snapshot(user)


def quote(user, session, message):
    check_avatar(user, session.avatar)
    # The accepted price is binding even if a cheaper backup answers.
    ink_cost = 2 if settings.GOOGLE_API_KEY or settings.GOOGLE_API_KEY_2 else 1
    if not (settings.GOOGLE_API_KEY or settings.GOOGLE_API_KEY_2 or settings.DEEPSEEK_API_KEY):
        raise UsageDenied('AI_UNAVAILABLE', 'El motor de IA no está disponible en este momento.')
    return InkChatQuote.objects.create(user=user, session=session, message_hash=digest(message),
        ink_cost=ink_cost, expires_at=timezone.now() + timedelta(minutes=2))


def reserve(user, session, message, request_id, mode, quote_id, token_ceiling):
    now = timezone.now()
    with transaction.atomic():
        profile = Profile.objects.select_for_update().get(user=user)
        cleanup(user, profile, now)
        existing = AIUsageEvent.objects.filter(pk=request_id).first()
        if existing:
            if existing.user_id != user.pk or existing.session_id != session.pk or existing.message_hash != digest(message) or existing.mode != mode:
                raise UsageDenied('REQUEST_CONFLICT', 'Este identificador corresponde a otra solicitud.')
            if existing.status == 'succeeded':
                return existing, True
            raise UsageDenied('REQUEST_PENDING' if existing.status == 'reserved' else 'REQUEST_FAILED',
                'La solicitud está en curso.' if existing.status == 'reserved' else 'La solicitud anterior falló sin cargo. Envía una nueva solicitud.')
        if AIUsageEvent.objects.filter(session=session, status='reserved').exists():
            raise UsageDenied('REQUEST_PENDING', 'Espera la respuesta anterior de este personaje.')
        usage = locked_usage(user, now)
        settle_activity(user, usage, now)
        ink_cost = 0
        sub = subscription_for(user)
        if mode == 'plan':
            if not has_paid_access(sub, now):
                raise UsageDenied('NO_ACTIVE_PLAN', 'Elige un plan o acepta continuar usando Tinta.')
            if sub.plan.daily_time_limit is not None and usage.active_seconds >= sub.plan.daily_time_limit:
                raise UsageDenied('AI_TIME_LIMIT', 'Tu magia necesita descansar. Has utilizado las horas incluidas de hoy.')
            if usage.tokens_used + usage.tokens_reserved + token_ceiling > sub.plan.daily_token_limit:
                raise UsageDenied('AI_TOKEN_LIMIT', 'Tu magia necesita descansar. El cupo restante no alcanza para esta respuesta y su contexto.')
            usage.tokens_reserved += token_ceiling
            usage.save(update_fields=['tokens_reserved'])
        else:
            accepted = InkChatQuote.objects.select_for_update().filter(pk=quote_id, user=user, session=session,
                message_hash=digest(message), used=False, expires_at__gt=now).first()
            if not accepted:
                raise UsageDenied('QUOTE_REQUIRED', 'Acepta una cotización vigente antes de usar Tinta.')
            ink_cost = accepted.ink_cost
            if profile.ink_balance < ink_cost:
                raise UsageDenied('INSUFFICIENT_INK', 'No tienes Tinta suficiente para esta respuesta.')
            accepted.used = True
            accepted.save(update_fields=['used'])
            profile.ink_balance -= ink_cost
            profile.save(update_fields=['ink_balance'])
        return AIUsageEvent.objects.create(request_id=request_id, user=user, session=session, usage=usage,
            message_hash=digest(message), mode=mode, reserved_tokens=token_ceiling if mode == 'plan' else 0,
            subscription_plan=sub.plan if has_paid_access(sub, now) else None,
            ink_cost=ink_cost, expires_at=now + timedelta(minutes=3)), False


def finish(event, message, result):
    with transaction.atomic():
        profile = Profile.objects.select_for_update().get(user_id=event.user_id)
        event = AIUsageEvent.objects.select_for_update().get(pk=event.pk)
        if event.status != 'reserved' or event.expires_at <= timezone.now():
            if event.status == 'reserved':
                release_event(event, profile, result.get('attempts'))
            raise UsageDenied('REQUEST_EXPIRED', 'La respuesta llegó tarde. No se descontó cuota ni Tinta.')
        usage = DailyAIUsage.objects.select_for_update().get(pk=event.usage_id)
        if event.mode == 'plan' and result['total_tokens'] > event.reserved_tokens:
            release_event(event, profile, result.get('attempts'))
            raise UsageDenied('INVALID_USAGE', 'No fue posible validar el consumo. No se realizó ningún cargo.')
        if event.mode == 'plan':
            usage.tokens_reserved -= event.reserved_tokens
            usage.tokens_used += result['total_tokens']
            usage.save(update_fields=['tokens_reserved', 'tokens_used'])
        else:
            InkTransaction.objects.create(user=event.user, amount=-event.ink_cost, concept='ai_chat',
                reference_id=str(event.pk), balance_after=profile.ink_balance)
        ChatMessage.objects.create(session=event.session, role='user', content=message)
        reply = ChatMessage.objects.create(session=event.session, role='assistant', content=result['text'])
        # Preserve XP, missions and achievements without minting spendable currency
        # for each paid response (the previous +5 reward exceeded the chat price).
        from library.achievement_engine import reward_activity, evaluate_for_user
        reward_activity(event.user, 'ai_interaction', reference_id=str(event.pk), custom_ink=0)
        evaluate_for_user(event.user, trigger='chat', chat_session_id=event.session_id)
        event.status = 'succeeded'
        for field in ('provider', 'model', 'input_tokens', 'output_tokens', 'reasoning_tokens', 'total_tokens', 'attempts'):
            setattr(event, field, result[field])
        event.estimated_cost = sum((Decimal(a.get('estimated_cost', '0')) for a in result['attempts']), Decimal(0))
        event.result = {'reply': reply.content, 'timestamp': reply.created_at.isoformat(),
            'ai_provider': result['provider'], 'ai_status': 'ok', 'cost': event.ink_cost,
            'request_id': str(event.pk)}
        event.save()
    return event.result


def fail(event, attempts):
    with transaction.atomic():
        profile = Profile.objects.select_for_update().get(user_id=event.user_id)
        locked = AIUsageEvent.objects.select_for_update().get(pk=event.pk)
        if locked.status == 'reserved':
            release_event(locked, profile, attempts)
