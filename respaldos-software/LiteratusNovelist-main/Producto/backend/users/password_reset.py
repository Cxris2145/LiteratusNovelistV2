"""Recuperación por código y permiso temporal, de un solo uso, para cambiar la clave."""
import logging
import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from rest_framework.exceptions import ValidationError

from .models import PasswordResetChallenge
from .utils import email_is_configured, send_password_reset_code_email, send_password_changed_email

logger = logging.getLogger(__name__)
CODE_LIFETIME_SECONDS = 600
RESET_LIFETIME_SECONDS = 600
RESEND_COOLDOWN_SECONDS = 60
MAX_CODE_ATTEMPTS = 5
MAX_REQUESTS_PER_HOUR = 5


def _digest(purpose, value):
    # HMAC con SECRET_KEY: un volcado de la base no permite probar los seis dígitos.
    return salted_hmac(f'users.password-reset.{purpose}', value, algorithm='sha256').hexdigest()


def _account_matches(challenge, user):
    return (user.is_active and user.has_usable_password() and challenge.consumed_at is None
            and challenge.email == user.email.lower()
            and constant_time_compare(challenge.password_fingerprint, _digest('password', user.password)))


def request_recovery_code(email):
    now = timezone.now()
    with transaction.atomic():
        # Bloquear la cuenta serializa reenvíos, verificaciones y cambios entre workers.
        user = get_user_model().objects.select_for_update().filter(email__iexact=email, is_active=True).first()
        if user is None or not user.has_usable_password():
            return
        challenge = PasswordResetChallenge.objects.filter(user=user).first()
        if challenge and (now - challenge.sent_at).total_seconds() < RESEND_COOLDOWN_SECONDS:
            return
        window_start, request_count = now, 1
        if challenge and now < challenge.request_window_start + timedelta(hours=1):
            if challenge.request_count >= MAX_REQUESTS_PER_HOUR:
                return
            window_start, request_count = challenge.request_window_start, challenge.request_count + 1
        code = f'{secrets.randbelow(1_000_000):06d}'
        nonce = secrets.token_urlsafe(32)
        PasswordResetChallenge.objects.update_or_create(user=user, defaults={
            'email': user.email.lower(), 'nonce': nonce,
            'code_digest': _digest('code', f'{nonce}:{code}'),
            'password_fingerprint': _digest('password', user.password),
            'sent_at': now, 'expires_at': now + timedelta(seconds=CODE_LIFETIME_SECONDS),
            'attempts': 0, 'request_window_start': window_start, 'request_count': request_count,
            'reset_token_digest': '', 'verified_expires_at': None, 'consumed_at': None,
        })
    try:
        if not email_is_configured():
            raise RuntimeError('Servicio de correo sin configurar.')
        send_password_reset_code_email(user, code, CODE_LIFETIME_SECONDS // 60)
    except Exception:
        logger.exception('No se pudo enviar el código de recuperación.')
        # Solo invalidar esta generación: un envío anterior no debe borrar otro reenvío.
        PasswordResetChallenge.objects.filter(user=user, nonce=nonce).update(
            code_digest='', expires_at=now,
            sent_at=now - timedelta(seconds=RESEND_COOLDOWN_SECONDS))


def verify_recovery_code(email, code):
    with transaction.atomic():
        user = get_user_model().objects.select_for_update().filter(email__iexact=email).first()
        challenge = PasswordResetChallenge.objects.filter(user=user).first() if user else None
        if (not challenge or not _account_matches(challenge, user) or not challenge.code_digest
                or challenge.expires_at <= timezone.now() or challenge.attempts >= MAX_CODE_ATTEMPTS):
            return None
        if not constant_time_compare(challenge.code_digest, _digest('code', f'{challenge.nonce}:{code}')):
            challenge.attempts += 1
            challenge.save(update_fields=['attempts'])
            # Retornar dentro de atomic confirma el intento fallido; una excepción lo desharía.
            return None
        token = secrets.token_urlsafe(32)
        challenge.code_digest = ''
        challenge.reset_token_digest = _digest('token', f'{challenge.nonce}:{token}')
        challenge.verified_expires_at = timezone.now() + timedelta(seconds=RESET_LIFETIME_SECONDS)
        challenge.save(update_fields=['code_digest', 'reset_token_digest', 'verified_expires_at'])
        return token


def confirm_recovery_password(email, token, new_password):
    with transaction.atomic():
        user = get_user_model().objects.select_for_update().filter(email__iexact=email).first()
        challenge = PasswordResetChallenge.objects.filter(user=user).first() if user else None
        if (not challenge or not _account_matches(challenge, user) or not challenge.reset_token_digest
                or not challenge.verified_expires_at or challenge.verified_expires_at <= timezone.now()
                or not constant_time_compare(challenge.reset_token_digest,
                                             _digest('token', f'{challenge.nonce}:{token}'))):
            raise ValidationError({'error': 'La verificación ha caducado. Solicita un código nuevo.',
                                   'code': 'RESET_INVALID'})
        if check_password(new_password, user.password):
            raise ValidationError({'error': 'La nueva contraseña debe ser distinta de la anterior.',
                                   'code': 'PASSWORD_REUSED'})
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as error:
            raise ValidationError({'error': 'Elige una contraseña más segura.',
                                   'code': 'PASSWORD_WEAK', 'details': error.messages}) from error
        user.set_password(new_password)
        user.save(update_fields=['password'])
        challenge.code_digest = challenge.reset_token_digest = ''
        challenge.consumed_at = timezone.now()
        challenge.save(update_fields=['code_digest', 'reset_token_digest', 'consumed_at'])
    try:
        send_password_changed_email(user)
    except Exception:
        logger.exception('La contraseña se cambió, pero no se pudo enviar la confirmación por correo.')
