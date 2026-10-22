"""
Cuentas de prueba ("Probar sin cuenta" en el login).

Cada clic crea un usuario invitado nuevo: lector adulto, sin permisos de administración y con el
onboarding hecho, para que pruebe la plataforma completa sin compartir una cuenta con nadie. Se
borra solo cuando deja de dar señales de vida (cerró la página) o cuando cumple una hora.

No usa campos nuevos (la base es compartida y las migraciones se corren a mano):
- un invitado se reconoce por su correo, en un dominio reservado que nadie más puede registrar;
- su última señal de vida se guarda en `last_login`, que la página renueva con un latido.

Tampoco hay tareas programadas en el despliegue: el barrido lo lanza cualquier petición, como
mucho una vez por minuto, en un hilo aparte (ver GuestSweepMiddleware). Gunicorn corre con un
solo worker, así que un candado en memoria basta. También existe `manage.py limpiar_invitados`.
"""
import datetime
import logging
import secrets
import threading
import time

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

GUEST_EMAIL_DOMAIN = 'invitado.literatus'
GUEST_USERNAME_PREFIX = 'invitado_'
#: Sin latido por más de esto, la página se cerró: el invitado se borra.
INACTIVE_AFTER = datetime.timedelta(minutes=3)
#: Una cuenta de prueba dura como mucho esto, aunque la página siga abierta.
MAX_AGE = datetime.timedelta(hours=1)
#: Al ocultarse la página queda este margen: si solo se recargó, el primer latido la revive.
LEAVE_GRACE = datetime.timedelta(seconds=45)
#: El latido escribe en la base como mucho cada tanto.
TOUCH_EVERY = datetime.timedelta(seconds=20)
#: Invitados vivos a la vez, para no saturar la base durante una presentación.
MAX_ALIVE = 150
#: El barrido corre como mucho una vez por minuto.
SWEEP_EVERY_SECONDS = 60
#: Lector adulto: ve el catálogo completo (pedido para las presentaciones).
GUEST_BIRTH_DATE = datetime.date(2000, 1, 1)

User = get_user_model()


def is_guest(user) -> bool:
    email = (getattr(user, 'email', '') or '').lower()
    return bool(getattr(user, 'is_authenticated', False)) and email.endswith('@' + GUEST_EMAIL_DOMAIN)


def is_guest_email(email: str) -> bool:
    return (email or '').strip().lower().endswith('@' + GUEST_EMAIL_DOMAIN)


def guests():
    """Todos los invitados (también los que el borrado lógico hubiera marcado)."""
    return User.objects.filter(email__iendswith='@' + GUEST_EMAIL_DOMAIN)


def expired_guests(now=None):
    now = now or timezone.now()
    return guests().filter(_expired_q(now))


def alive_count(now=None) -> int:
    now = now or timezone.now()
    return guests().exclude(_expired_q(now)).count()


def _expired_q(now):
    from django.db.models import Q
    return (Q(last_login__isnull=True) | Q(last_login__lt=now - INACTIVE_AFTER)
            | Q(date_joined__lt=now - MAX_AGE))


def create_guest():
    """Crea un invitado nuevo, listo para usar (activo, adulto y con el onboarding hecho)."""
    from .models import Profile

    for _ in range(5):
        tag = secrets.token_hex(3)
        username = GUEST_USERNAME_PREFIX + tag
        try:
            with transaction.atomic():
                user = User(username=username, email=f'{username}@{GUEST_EMAIL_DOMAIN}',
                            first_name='Invitado', is_active=True, is_staff=False, is_superuser=False)
                user.set_unusable_password()
                user.last_login = timezone.now()
                user.save()
                # La señal post_save ya creó el perfil.
                Profile.objects.filter(user=user).update(
                    has_completed_onboarding=True,
                    birth_date=GUEST_BIRTH_DATE,
                    # Fuera de las sugerencias de amigos de las cuentas reales.
                    is_public=False,
                )
                user.refresh_from_db()
                return user
        except IntegrityError:
            continue  # nombre repetido: otro intento con otra etiqueta
    raise RuntimeError('No se pudo crear la cuenta de prueba.')


def touch(user) -> None:
    """Latido: la página sigue abierta."""
    now = timezone.now()
    if user.last_login and now - user.last_login < TOUCH_EVERY:
        return
    User.objects.filter(pk=user.pk).update(last_login=now)


def mark_leaving(user) -> None:
    """La página se ocultó: si no vuelve dentro del margen, el próximo barrido la borra."""
    User.objects.filter(pk=user.pk).update(last_login=timezone.now() - (INACTIVE_AFTER - LEAVE_GRACE))


def delete_guest(user) -> None:
    """Borra al invitado con todo lo suyo, también los libros que envió y nadie publicó."""
    from catalog.models import Book

    from .account_deletion import delete_account

    for book in Book.all_objects.filter(submitted_by=user).exclude(status=Book.StatusChoices.PUBLISHED):
        _delete_files(book)
        for edition in book.editions.all():
            _delete_files(edition)
        book.hard_delete()
    delete_account(user)


def _delete_files(instance) -> None:
    for field in instance._meta.get_fields():
        if getattr(field, 'get_internal_type', lambda: '')() in ('FileField', 'ImageField'):
            stored = getattr(instance, field.name, None)
            if stored:
                try:
                    stored.delete(save=False)
                except Exception:  # un archivo que ya no está no debe frenar el borrado
                    logger.warning('No se pudo borrar %s de %s', field.name, instance.pk)


def sweep(now=None) -> int:
    """Borra los invitados que cerraron la página o cumplieron una hora. Devuelve cuántos borró."""
    deleted = 0
    for user in expired_guests(now):
        try:
            delete_guest(user)
            deleted += 1
        except Exception:
            logger.exception('No se pudo borrar el invitado %s', user.pk)
    return deleted


_sweep_lock = threading.Lock()
_last_sweep = 0.0


def maybe_sweep_in_background() -> None:
    """Lanza un barrido en un hilo aparte si pasó al menos un minuto desde el último."""
    global _last_sweep
    now = time.monotonic()
    if now - _last_sweep < SWEEP_EVERY_SECONDS or not _sweep_lock.acquire(blocking=False):
        return
    _last_sweep = now

    def run():
        try:
            sweep()
        except Exception:
            logger.exception('Falló el barrido de invitados')
        finally:
            from django.db import connection
            connection.close()  # el hilo abrió su propia conexión
            _sweep_lock.release()

    threading.Thread(target=run, name='barrido-invitados', daemon=True).start()
