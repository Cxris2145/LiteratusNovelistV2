"""catalog/age.py — Restricción de obras por edad mínima (Book.min_age)."""
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied


def age_on(born, today=None):
    today = today or timezone.localdate()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def allowed_age(user):
    """Sin sesión o fecha registrada solo se muestra contenido para todo público."""
    if not user or not user.is_authenticated:
        return 0
    profile = getattr(user, 'profile', None)
    born = getattr(profile, 'birth_date', None)
    return max(0, age_on(born)) if born else 0


def visible_books(queryset, user, book_path=''):
    """Filtra en SQL antes de paginar, contar o elegir recomendaciones."""
    return queryset.filter(**{f'{book_path}min_age__lte': allowed_age(user)})


def ensure_book_access(user, book):
    message = age_block_message(user, book)
    if message:
        raise PermissionDenied({'error': 'AGE_RESTRICTED', 'message': message})


def age_block_message(user, book):
    """Motivo por el que `user` no puede ver contenido de `book`, o None si puede."""
    if not book.min_age:
        return None
    if not user or not user.is_authenticated:
        return 'Debes iniciar sesión y registrar tu edad para ver este libro.'
    profile = getattr(user, 'profile', None)
    if not profile or not profile.birth_date:
        return 'Por favor, registra tu fecha de nacimiento en tu perfil para ver este libro.'
    if age_on(profile.birth_date) < book.min_age:
        return f'Este libro requiere tener {book.min_age} años o más.'
    return None
