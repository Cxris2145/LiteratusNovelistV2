"""
Control parental: un tutor (padre, madre o tutor legal) a cargo de las cuentas de sus hijos.

El tutor crea la cuenta del hijo desde su panel (usuario, contraseña y fecha de nacimiento, sin
correo propio) o vincula una que el hijo ya tenga. Desde ahí ve su historial (parental/history.py),
le cambia la contraseña, lo desvincula o borra su cuenta. Mientras está vinculado, el hijo no puede
pagar ni borrar su propia cuenta.

Las cuentas creadas por el tutor llevan un correo interno en un dominio reservado: User.email es
único y obligatorio, y un niño no siempre tiene correo. Ese correo no recibe nada; si el hijo
olvida la contraseña, se la cambia el tutor.
"""
import logging
import re
import secrets

from django.contrib.auth import get_user_model
from django.db import DatabaseError, IntegrityError, transaction
from django.http import Http404
from django.utils import timezone

from .models import ParentalLink

logger = logging.getLogger(__name__)
User = get_user_model()

CHILD_EMAIL_DOMAIN = 'hijo.literatus'
ADULT_AGE = 18
MAX_CHILDREN = 6
CONSENT_TEXT = 'Este perfil es para mi hijo o hija y yo tengo el control.'


class ParentalError(Exception):
    """Regla del control parental que no se cumple; la vista la responde tal cual."""

    def __init__(self, message, code, status=400, field=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.field = field

    def as_response_data(self):
        data = {'error': self.message, 'code': self.code}
        if self.field:
            data['field'] = self.field
        return data


# ── Quién es quién ────────────────────────────────────────────────────

def is_child_email(email) -> bool:
    return (email or '').strip().lower().endswith('@' + CHILD_EMAIL_DOMAIN)


def link_of(child):
    if not getattr(child, 'is_authenticated', False):
        return None
    return ParentalLink.objects.filter(child=child).select_related('parent').first()


def is_child_account(user) -> bool:
    """
    Lo consultan el borrado de cuenta y los pagos. La base es compartida y las migraciones se
    corren a mano: si la tabla todavía no existe, nadie está a cargo (y el resto sigue andando).
    """
    if not getattr(user, 'is_authenticated', False):
        return False
    try:
        with transaction.atomic():
            return ParentalLink.objects.filter(child=user).exists()
    except DatabaseError:
        logger.warning('Falta la tabla del control parental (migración parental/0001 sin aplicar).')
        return False


def guardian_of(user):
    link = link_of(user)
    return link.parent if link else None


def children_links(parent):
    return (ParentalLink.objects.filter(parent=parent)
            .select_related('child', 'child__profile').order_by('created_at'))


def get_child_or_404(parent, child_id):
    """El hijo solo si está a cargo de este tutor; si no, 404 (no revela si la cuenta existe)."""
    link = (ParentalLink.objects.filter(parent=parent, child_id=child_id)
            .select_related('child', 'child__profile').first())
    if link is None:
        raise Http404('No tienes a cargo esa cuenta.')
    return link.child


def age_of(user):
    from catalog.age import age_on

    profile = getattr(user, 'profile', None)
    born = profile.birth_date if profile else None
    return age_on(born, timezone.localdate()) if born else None


def parent_eligibility(user):
    """(puede ser tutor, código del motivo, mensaje) para mostrar en el inicio del panel."""
    from users.guests import is_guest

    if is_guest(user):
        return False, 'guest', 'Las cuentas de prueba no pueden tener hijos a cargo. Crea tu propia cuenta para usar el control parental.'
    if is_child_account(user):
        return False, 'child_account', 'Tu cuenta está a cargo de un tutor, así que no puede tener otras cuentas a cargo.'
    age = age_of(user)
    if age is None:
        return False, 'no_birth_date', 'Registra tu fecha de nacimiento en tu perfil para usar el control parental.'
    if age < ADULT_AGE:
        return False, 'minor', 'El control parental es para personas adultas (18 años o más).'
    return True, None, None


def _require_parent(parent):
    ok, code, message = parent_eligibility(parent)
    if not ok:
        raise ParentalError(message, code.upper(), status=403)


def _require_minor(birth_date, field='birth_date'):
    from catalog.age import age_on

    if age_on(birth_date, timezone.localdate()) >= ADULT_AGE:
        raise ParentalError('El control parental es para menores de 18 años.', 'CHILD_NOT_MINOR', field=field)


def _require_room(parent):
    # Bloquear al tutor serializa dos altas simultáneas para que no pasen el tope.
    User.objects.select_for_update().filter(pk=parent.pk).first()
    if ParentalLink.objects.filter(parent=parent).count() >= MAX_CHILDREN:
        raise ParentalError(f'Puedes tener hasta {MAX_CHILDREN} perfiles a cargo.', 'TOO_MANY_CHILDREN')


def _require_consent(consent):
    if consent is not True:
        raise ParentalError('Marca la casilla: «' + CONSENT_TEXT + '»', 'CONSENT_REQUIRED', field='consent')


def check_password(user, password):
    if not isinstance(password, str) or not password or not user.check_password(password):
        raise ParentalError('La contraseña no es correcta.', 'PASSWORD_INVALID', field='parent_password')


# ── Altas ─────────────────────────────────────────────────────────────

def _child_email(username):
    local = re.sub(r'[^a-z0-9]', '', username.lower())[:30] or 'lector'
    return f'{local}.{secrets.token_hex(3)}@{CHILD_EMAIL_DOMAIN}'


def create_child(parent, *, username, password, birth_date, first_name='', consent=False):
    """Crea la cuenta del hijo (activa al tiro: el tutor ya verificó la suya) y la deja a su cargo."""
    from users.models import Profile

    _require_parent(parent)
    _require_consent(consent)
    _require_minor(birth_date)
    with transaction.atomic():
        _require_room(parent)
        try:
            with transaction.atomic():
                child = User.objects.create_user(
                    username=username, email=_child_email(username), password=password,
                    first_name=first_name, is_active=True, role=User.RoleChoices.READER,
                )
        except IntegrityError:
            raise ParentalError('Ese nombre de usuario ya está en uso.', 'USERNAME_TAKEN', field='username')
        # La señal post_save ya creó el perfil. Privado: no aparece en las sugerencias de la Taberna.
        Profile.objects.filter(user=child).update(birth_date=birth_date, is_public=False)
        ParentalLink.objects.create(parent=parent, child=child, origin=ParentalLink.Origin.CREATED,
                                    consent_at=timezone.now())
    child.refresh_from_db()
    return child


def link_existing(parent, *, identifier, password, consent=False, birth_date=None):
    """
    Deja a cargo del tutor una cuenta que el hijo ya tenía. Prueba que el tutor la controla
    pidiendo su contraseña (la vista limita los intentos).
    """
    from users.guests import is_guest
    from users.models import Profile
    from users.serializers import find_user_by_login

    _require_parent(parent)
    _require_consent(consent)
    child = find_user_by_login((identifier or '').strip())
    if child is None or not child.check_password(password or ''):
        raise ParentalError('El usuario o la contraseña de tu hijo no coinciden.', 'LINK_CREDENTIALS')
    if not child.is_active:
        raise ParentalError('Esa cuenta todavía no está verificada: abre primero el enlace que llegó a su correo.',
                            'LINK_INACTIVE')
    if child.pk == parent.pk:
        raise ParentalError('No puedes quedar a cargo de tu propia cuenta.', 'LINK_SELF')
    if is_guest(child) or child.is_staff or child.is_superuser:
        raise ParentalError('Esa cuenta no se puede poner a cargo de un tutor.', 'LINK_NOT_ALLOWED')
    existing = link_of(child)
    if existing is not None:
        message = ('Esa cuenta ya está a tu cargo.' if existing.parent_id == parent.pk
                   else 'Esa cuenta ya está a cargo de otro tutor.')
        raise ParentalError(message, 'ALREADY_LINKED', status=409)
    if ParentalLink.objects.filter(parent=child).exists():
        raise ParentalError('Esa cuenta tiene sus propios hijos a cargo.', 'LINK_IS_PARENT')

    profile = Profile.objects.get_or_create(user=child)[0]
    if profile.birth_date is None and birth_date is None:
        raise ParentalError('Esa cuenta no tiene fecha de nacimiento: indícala para continuar.',
                            'BIRTH_DATE_REQUIRED', field='birth_date')
    _require_minor(profile.birth_date or birth_date)
    with transaction.atomic():
        _require_room(parent)
        if profile.birth_date is None:
            Profile.objects.filter(pk=profile.pk, birth_date__isnull=True).update(birth_date=birth_date)
        try:
            with transaction.atomic():
                ParentalLink.objects.create(parent=parent, child=child, origin=ParentalLink.Origin.LINKED,
                                            consent_at=timezone.now())
        except IntegrityError:
            raise ParentalError('Esa cuenta ya está a cargo de otro tutor.', 'ALREADY_LINKED', status=409)
    child.refresh_from_db()
    return child


# ── Poderes del tutor ─────────────────────────────────────────────────

def set_child_password(parent, child, *, parent_password, new_password):
    """La contraseña nueva cierra las sesiones abiertas del hijo (CHECK_REVOKE_TOKEN)."""
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError

    check_password(parent, parent_password)
    try:
        validate_password(new_password or '', user=child)
    except ValidationError as exc:
        raise ParentalError(' '.join(exc.messages), 'PASSWORD_WEAK', field='new_password')
    child.set_password(new_password)
    child.save(update_fields=['password'])


def unlink(parent, child, *, parent_password):
    check_password(parent, parent_password)
    ParentalLink.objects.filter(parent=parent, child=child).delete()


def delete_child(parent, child, *, parent_password):
    """Borra para siempre la cuenta del hijo (igual que si la borrara él desde su perfil)."""
    from users.account_deletion import delete_account

    check_password(parent, parent_password)
    delete_account(child)


# ── Tarjetas ──────────────────────────────────────────────────────────

def guardian_card(user):
    return {'username': user.username, 'first_name': user.first_name}


def child_card(link, viewer=None):
    from community.services import presence_statuses
    from users.serializers import level_name_for

    from .history import last_activity

    child = link.child
    profile = child.profile
    presence = presence_statuses([profile], viewer)[child.pk]
    return {
        'id': str(child.pk),
        'username': child.username,
        'first_name': child.first_name,
        'age': age_of(child),
        'birth_date': profile.birth_date,
        'avatar_color': profile.avatar_color,
        'origin': link.origin,
        'linked_at': link.created_at,
        'has_own_email': not is_child_email(child.email),
        'has_completed_onboarding': profile.has_completed_onboarding,
        'level': profile.level,
        'level_name': level_name_for(profile.level),
        'xp': profile.xp,
        'ink_balance': profile.ink_balance,
        'streak_current': profile.streak_current,
        'last_activity': last_activity(child),
        'presence': presence,
    }


def status_for(user):
    """Lo que necesita el inicio del panel: si puede ser tutor, sus hijos o quién lo tiene a cargo."""
    can_be_parent, reason, message = parent_eligibility(user)
    guardian = guardian_of(user)
    return {
        'can_be_parent': can_be_parent,
        'reason': reason,
        'reason_message': message,
        'is_child': guardian is not None,
        'guardian': guardian_card(guardian) if guardian else None,
        'consent_text': CONSENT_TEXT,
        'max_children': MAX_CHILDREN,
        'children': [child_card(link, user) for link in children_links(user)],
    }
