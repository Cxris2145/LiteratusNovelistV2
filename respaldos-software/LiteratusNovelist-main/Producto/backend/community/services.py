"""
community/services.py — Lógica de La Taberna de Tinta: amistades, brindis, tarjetas de
perfil, estado de los amigos y ranking.

Las funciones que escriben devuelven {'success', 'error', 'message', 'status'} como el
resto de servicios del proyecto; `status` es el código HTTP que debe responder la vista.
Hacer amigos o brindar no da XP ni Tinta: así nadie infla el ranking con cuentas falsas.
"""
import re
import uuid
from collections import Counter
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import Count, OuterRef, Q, Subquery, Sum
from django.utils import timezone

from users.models import Profile
from users.serializers import level_name_for
from . import live
from .models import (
    Brindis, FriendMessage, Friendship, ReadingClub, ReadingClubMember, ReadingClubMessage,
    TavernInvitation, TavernMessage, pair_key_for,
)

User = get_user_model()

MAX_PENDING_OUTGOING = 30
MAX_FRIENDS = 150
DECLINE_COOLDOWN = timedelta(days=7)
TAVERN_ONLINE_WINDOW = timedelta(seconds=150)
READING_WINDOW = timedelta(minutes=10)
OPEN_SESSION_WINDOW = timedelta(minutes=45)
PRESENCE_WRITE_EVERY = timedelta(seconds=30)
SEARCH_LIMIT = 8
# Sugerencias: todas las cuentas; el tope solo evita una lista enorme si la comunidad crece.
SUGGESTION_LIMIT = 200
# Orden de las sugerencias: primero a quien puedes agregar, al final tus amigos.
RELATION_ORDER = {'none': 0, 'incoming': 1, 'outgoing': 2, 'friend': 3}
SUGGESTION_RECENT_TAVERN = timedelta(days=7)
NEW_READER_WINDOW = timedelta(days=30)

# Mismo alfabeto que users.models.FRIEND_CODE_ALPHABET (sin I, L, O, 0 ni 1).
FRIEND_CODE_RE = re.compile(r'^[2-9A-HJKMNP-Z]{6}$')

RANKING_SCOPES = ('week', 'month', 'all')


def _ok(msg='', status=200, **data):
    payload = {'success': True, 'message': msg, 'status': status}
    payload.update(data)
    return payload


def _fail(error, message, status=400):
    return {'success': False, 'error': error, 'message': message, 'status': status}


# ── Búsquedas básicas ─────────────────────────────────────────────────

def normalize_code(raw) -> str | None:
    code = str(raw or '').strip().lstrip('#').strip().upper()
    return code if FRIEND_CODE_RE.match(code) else None


def _profiles():
    # El avatar es un data URL de decenas de KB: en la comunidad la identidad es Maguito.
    return Profile.objects.select_related('user').defer('avatar').filter(user__is_active=True)


def profile_by_code(raw_code):
    code = normalize_code(raw_code)
    return _profiles().filter(friend_code=code).first() if code else None


def friend_ids(user) -> set:
    rows = (Friendship.objects
            .filter(status=Friendship.Status.ACCEPTED)
            .filter(Q(requester=user) | Q(addressee=user))
            .values_list('requester_id', 'addressee_id'))
    return {b if a == user.pk else a for a, b in rows}


def relations_for(me, other_ids) -> dict:
    """{user_id: (relation, request_id)} con relation = friend | outgoing | incoming | none."""
    other_ids = set(other_ids) - {me.pk}
    result = {uid: ('none', None) for uid in other_ids}
    if not other_ids:
        return result
    rows = Friendship.objects.filter(
        Q(requester=me, addressee_id__in=other_ids) | Q(addressee=me, requester_id__in=other_ids)
    ).values('id', 'requester_id', 'addressee_id', 'status')
    for row in rows:
        mine = row['requester_id'] == me.pk
        other = row['addressee_id'] if mine else row['requester_id']
        if row['status'] == Friendship.Status.ACCEPTED:
            result[other] = ('friend', None)
        elif row['status'] == Friendship.Status.PENDING:
            result[other] = ('outgoing' if mine else 'incoming', str(row['id']))
    return result


def pending_incoming_count(user) -> int:
    return Friendship.objects.filter(addressee=user, status=Friendship.Status.PENDING).count()


# ── Tarjetas ──────────────────────────────────────────────────────────

def minimal_card(profile, relation='none', request_id=None) -> dict:
    """Lo que ve alguien que todavía no es tu amigo: lo justo para reconocerte e invitarte."""
    return {
        'full': False,
        'friend_code': profile.friend_code,
        'username': profile.user.username,
        'outfit': profile.outfit or {},
        'equipped_frame': profile.equipped_frame,
        'equipped_title': profile.equipped_title,
        'is_public': profile.is_public,
        'relation': relation,
        'request_id': request_id,
    }


def profile_stats(user) -> dict:
    from catalog.age import visible_books
    from catalog.models import Review
    from library.models import ReadingProgress, UserInventory

    friends = friend_ids(user)
    # Lo mismo que lista Mi Biblioteca; dos ediciones del mismo libro cuentan una vez.
    library = visible_books(UserInventory.objects.filter(user=user), user, 'edition__book__')
    return {
        'books': library.values('edition__book_id').distinct().count(),
        'books_read': ReadingProgress.objects.filter(
            inventory__user=user, completion_percentage__gte=100, is_active=True).count(),
        'reviews': Review.objects.filter(user=user).count(),
        # Igual que la lista de amigos: las cuentas desactivadas no cuentan.
        'friends': User.objects.filter(pk__in=friends, is_active=True).count() if friends else 0,
        'brindis': Brindis.objects.filter(receiver=user).count(),
    }


def full_card(profile, relation, request_id=None) -> dict:
    """Perfil completo: para uno mismo, para los amigos y para cualquiera si el perfil es público."""
    user = profile.user
    return {
        'full': True,
        'friend_code': profile.friend_code,
        'username': user.username,
        'tagline': profile.tagline,
        'bio': profile.bio,
        'outfit': profile.outfit or {},
        'level': profile.level,
        'level_name': level_name_for(profile.level),
        'xp': profile.xp,
        'equipped_frame': profile.equipped_frame,
        'equipped_title': profile.equipped_title,
        'favorite_genres': [{'name': g.name, 'slug': g.slug} for g in profile.favorite_genres.all()[:6]],
        'stats': profile_stats(user),
        'member_since': user.date_joined,
        'is_public': profile.is_public,
        'relation': relation,
        'request_id': request_id,
    }


def my_card(user) -> dict:
    profile = _profiles().filter(user=user).first() or Profile.objects.get_or_create(user=user)[0]
    return {**full_card(profile, 'self'), 'pending_incoming': pending_incoming_count(user)}


def profile_for_viewer(me, raw_code):
    """
    Perfil por código: completo si eres tú, un amigo o el perfil es público; mínimo si es
    privado. None si no existe.
    """
    profile = profile_by_code(raw_code)
    if profile is None:
        return None
    if profile.user_id == me.pk:
        return full_card(profile, 'self')
    relation, request_id = relations_for(me, [profile.user_id])[profile.user_id]
    if relation != 'friend':
        if profile.is_public:
            return full_card(profile, relation, request_id)
        return minimal_card(profile, relation, request_id)
    card = full_card(profile, 'friend')
    card['brindis_given'] = Brindis.objects.filter(giver=me, receiver=profile.user).exists()
    return card


def search(me, raw_query) -> list:
    """
    Busca por código exacto y por nombre de usuario que empiece con el texto. Los perfiles
    privados solo aparecen con su código.
    """
    query = str(raw_query or '').strip().lstrip('#').strip()
    if len(query) < 3:
        return []
    base = _profiles().exclude(user=me)
    found = []
    code = normalize_code(query)
    if code:
        found.extend(base.filter(friend_code=code))
    found.extend(
        base.filter(user__username__istartswith=query, is_public=True)
        .exclude(pk__in=[p.pk for p in found])
        .order_by('user__username')[:SEARCH_LIMIT - len(found)]
    )
    relations = relations_for(me, [p.user_id for p in found])
    return [minimal_card(p, *relations[p.user_id]) for p in found]


def suggestions(me, limit=SUGGESTION_LIMIT) -> list:
    """
    Todas las cuentas de Literatus, para "Agregar amigo", cada una con su relación contigo
    para que el botón diga lo que corresponde. Primero las que todavía no son nada tuyo
    (amigos de tus amigos, gustos en común, quienes pasaron hace poco por la taberna y,
    después, las más nuevas), luego las solicitudes pendientes y al final tus amigos.
    Un perfil privado solo aparece si ya tiene una amistad o una solicitud contigo.
    """
    connected = {b if a == me.pk else a for a, b in
                 Friendship.objects.filter(Q(requester=me) | Q(addressee=me))
                 .exclude(status=Friendship.Status.DECLINED).values_list('requester_id', 'addressee_id')}
    base = _profiles().filter(Q(is_public=True) | Q(user_id__in=connected)).exclude(user=me)

    mine = friend_ids(me)
    mutual = Counter()
    if mine:
        rows = (Friendship.objects.filter(status=Friendship.Status.ACCEPTED)
                .filter(Q(requester_id__in=mine) | Q(addressee_id__in=mine))
                .values_list('requester_id', 'addressee_id'))
        for a, b in rows:
            if a in mine:
                mutual[b] += 1
            if b in mine:
                mutual[a] += 1

    shared = {}
    my_genres = list(Profile.favorite_genres.through.objects
                     .filter(profile__user=me).values_list('genre_id', flat=True))
    if my_genres:
        rows = (Profile.favorite_genres.through.objects
                .filter(genre_id__in=my_genres, profile__in=base)
                .values_list('profile__user_id', 'genre__name')[:400])
        for uid, name in rows:
            shared.setdefault(uid, []).append(name)

    now = timezone.now()
    recent = set(base.filter(last_seen_in_tavern__gte=now - SUGGESTION_RECENT_TAVERN)
                 .values_list('user_id', flat=True))
    profiles = list(base)
    relations = relations_for(me, [p.user_id for p in profiles])

    def rank(profile):
        uid = profile.user_id
        points = mutual[uid] * 3 + len(shared.get(uid, ())) * 2 + (1 if uid in recent else 0)
        return (RELATION_ORDER[relations[uid][0]], -points, -profile.user.date_joined.timestamp())

    def reason(profile):
        uid = profile.user_id
        relation = relations[uid][0]
        if relation == 'incoming':
            return 'Te envió una solicitud'
        if relation == 'outgoing':
            return 'Le enviaste una solicitud'
        if mutual[uid]:
            return f'{mutual[uid]} amigo en común' if mutual[uid] == 1 else f'{mutual[uid]} amigos en común'
        if shared.get(uid):
            return f'También le gusta {shared[uid][0]}'
        if uid in recent:
            return 'Estuvo en la taberna esta semana'
        if now - profile.user.date_joined <= NEW_READER_WINDOW:
            return 'Nuevo en Literatus'
        return 'Lector de Literatus'

    ranked = sorted(profiles, key=rank)[:limit]
    return [{**minimal_card(p, *relations[p.user_id]), 'reason': reason(p), 'mutual_friends': mutual[p.user_id]}
            for p in ranked]


# ── Estado de los amigos ──────────────────────────────────────────────

def presence_statuses(profiles, viewer=None) -> dict:
    """{user_id: {'kind', 'label', 'book_title'}} en dos consultas, sin importar cuántos amigos."""
    from library.models import ReadingProgress, ReadingSession
    from catalog.age import age_block_message

    now = timezone.now()
    statuses, readers = {}, []
    for profile in profiles:
        if profile.last_seen_in_tavern and now - profile.last_seen_in_tavern <= TAVERN_ONLINE_WINDOW:
            statuses[profile.user_id] = {'kind': 'tavern', 'label': 'En la taberna', 'book_title': None}
        else:
            readers.append(profile.user_id)

    if readers:
        # El lector guarda el progreso a los pocos segundos de cada cambio de página.
        progress = (ReadingProgress.objects
                    .filter(inventory__user_id__in=readers, updated_at__gte=now - READING_WINDOW)
                    .select_related('inventory__edition__book')
                    .order_by('-updated_at'))
        for row in progress:
            uid = row.inventory.user_id
            if uid not in statuses:
                book = row.inventory.edition.book
                statuses[uid] = (_reading(None) if age_block_message(viewer, book)
                                 else _reading(book.title, chapter=row.current_page))
        pending = [uid for uid in readers if uid not in statuses]
        if pending:
            sessions = (ReadingSession.objects
                        .filter(user_id__in=pending, ended_at__isnull=True, started_at__gte=now - OPEN_SESSION_WINDOW)
                        .select_related('book').order_by('-started_at'))
            for session in sessions:
                reading = (_reading(None) if age_block_message(viewer, session.book)
                           else _reading(session.book.title, chapter=session.chapters_read or None))
                statuses.setdefault(session.user_id, reading)

    for profile in profiles:
        statuses.setdefault(profile.user_id, {'kind': 'away', 'label': 'De paseo', 'book_title': None})
    return statuses


def _reading(title, chapter=None):
    if chapter and int(chapter) > 0:
        label = f'Leyendo · Capítulo {chapter}'
    else:
        label = f'Leyendo · {title}' if title else 'Leyendo'
    return {'kind': 'reading', 'label': label, 'book_title': title, 'chapter': chapter}


def friends_list(me) -> list:
    ids = friend_ids(me)
    if not ids:
        return []
    profiles = list(_profiles().filter(user_id__in=ids).order_by('user__username'))
    statuses = presence_statuses(profiles, viewer=me)
    toasted = set(Brindis.objects.filter(giver=me, receiver_id__in=ids).values_list('receiver_id', flat=True))
    return [{
        'friend_code': p.friend_code,
        'username': p.user.username,
        'outfit': p.outfit or {},
        'tagline': p.tagline,
        'level': p.level,
        'level_name': level_name_for(p.level),
        'equipped_frame': p.equipped_frame,
        'equipped_title': p.equipped_title,
        'status': statuses[p.user_id],
        'brindis_given': p.user_id in toasted,
    } for p in profiles]


def requests_overview(me) -> dict:
    rows = (Friendship.objects.filter(status=Friendship.Status.PENDING)
            .filter(Q(requester=me) | Q(addressee=me)).order_by('-created_at'))
    others = {row.addressee_id if row.requester_id == me.pk else row.requester_id for row in rows}
    profiles = {p.user_id: p for p in _profiles().filter(user_id__in=others)}
    incoming, outgoing = [], []
    for row in rows:
        mine = row.requester_id == me.pk
        profile = profiles.get(row.addressee_id if mine else row.requester_id)
        if profile is None:  # la otra cuenta se desactivó
            continue
        item = {
            'id': str(row.id),
            'created_at': row.created_at,
            'user': minimal_card(profile, 'outgoing' if mine else 'incoming', str(row.id)),
        }
        (outgoing if mine else incoming).append(item)
    return {'incoming': incoming, 'outgoing': outgoing}


def touch_presence(user) -> None:
    """Latido de La Taberna. Escribe como mucho una vez cada 30 s."""
    now = timezone.now()
    (Profile.objects.filter(user=user)
     .filter(Q(last_seen_in_tavern__isnull=True) | Q(last_seen_in_tavern__lt=now - PRESENCE_WRITE_EVERY))
     .update(last_seen_in_tavern=now))


# ── Solicitudes y amistades ───────────────────────────────────────────

def _evaluate_achievements(*users):
    """Logros de La Taberna (Compañero de Mesa, Mesa Llena, Alma de la Fiesta)."""
    from library.achievement_engine import evaluate_for_user
    for user in users:
        evaluate_for_user(user, trigger='friends')


def _limits_error(me, target=None):
    if len(friend_ids(me)) >= MAX_FRIENDS:
        return _fail('FRIEND_LIMIT', f'Tu mesa ya tiene {MAX_FRIENDS} amigos.')
    if target is not None and len(friend_ids(target)) >= MAX_FRIENDS:
        return _fail('FRIEND_LIMIT', 'La mesa de este lector ya está llena.')
    return None


@transaction.atomic
def send_request(me, target):
    if target.pk == me.pk:
        return _fail('SELF_REQUEST', 'No puedes enviarte una solicitud a ti mismo.')

    existing = Friendship.objects.select_for_update().filter(pair_key=pair_key_for(me.pk, target.pk)).first()
    if existing is not None:
        if existing.status == Friendship.Status.ACCEPTED:
            return _fail('ALREADY_FRIENDS', f'{target.username} ya está en tu mesa.')
        if existing.status == Friendship.Status.PENDING:
            if existing.requester_id == me.pk:
                return _fail('ALREADY_SENT', f'Ya le enviaste una solicitud a {target.username}.')
            # Te había invitado primero: invitarlo de vuelta es aceptar.
            return _accept(existing)
        # Rechazada: quien rechazó puede cambiar de opinión; a quien rechazaron le toca esperar.
        rejected_me = existing.requester_id == me.pk
        if rejected_me and existing.responded_at and timezone.now() - existing.responded_at < DECLINE_COOLDOWN:
            return _fail('COOLDOWN', 'Podrás volver a invitar a este lector más adelante.')

    if Friendship.objects.filter(requester=me, status=Friendship.Status.PENDING).count() >= MAX_PENDING_OUTGOING:
        return _fail('TOO_MANY_PENDING', 'Tienes demasiadas solicitudes sin responder. Espera a que te contesten.')
    limit = _limits_error(me)
    if limit:
        return limit

    if existing is not None:
        existing.requester, existing.addressee = me, target
        existing.status = Friendship.Status.PENDING
        existing.responded_at = None
        existing.save()
        friendship = existing
    else:
        try:
            with transaction.atomic():
                friendship = Friendship.objects.create(requester=me, addressee=target)
        except IntegrityError:
            return _fail('ALREADY_SENT', f'Ya hay una solicitud entre tú y {target.username}.')
    return _ok(f'Le enviaste una solicitud a {target.username}.', status=201,
               id=str(friendship.id), state='pending')


def _accept(friendship):
    limit = _limits_error(friendship.addressee, friendship.requester)
    if limit:
        return limit
    friendship.status = Friendship.Status.ACCEPTED
    friendship.responded_at = timezone.now()
    friendship.save(update_fields=['status', 'responded_at', 'updated_at'])
    _evaluate_achievements(friendship.requester, friendship.addressee)
    other = friendship.requester.username
    return _ok(f'¡{other} y tú ahora comparten mesa!', status=201, id=str(friendship.id), state='accepted')


def _pending_for_addressee(me, request_id):
    return (Friendship.objects.select_for_update().select_related('requester', 'addressee')
            .filter(pk=request_id, addressee=me, status=Friendship.Status.PENDING).first())


@transaction.atomic
def accept_request(me, request_id):
    friendship = _pending_for_addressee(me, request_id)
    if friendship is None:
        return _fail('NOT_FOUND', 'La solicitud ya no está disponible.', status=404)
    return _accept(friendship)


@transaction.atomic
def decline_request(me, request_id):
    friendship = _pending_for_addressee(me, request_id)
    if friendship is None:
        return _fail('NOT_FOUND', 'La solicitud ya no está disponible.', status=404)
    friendship.status = Friendship.Status.DECLINED
    friendship.responded_at = timezone.now()
    friendship.save(update_fields=['status', 'responded_at', 'updated_at'])
    return _ok('Solicitud rechazada.')


@transaction.atomic
def cancel_request(me, request_id):
    deleted, _ = Friendship.objects.filter(
        pk=request_id, requester=me, status=Friendship.Status.PENDING).delete()
    if not deleted:
        return _fail('NOT_FOUND', 'La solicitud ya no está disponible.', status=404)
    return _ok('Solicitud cancelada.')


@transaction.atomic
def unfriend(me, other):
    deleted, _ = Friendship.objects.filter(
        pair_key=pair_key_for(me.pk, other.pk), status=Friendship.Status.ACCEPTED).delete()
    if not deleted:
        return _fail('NOT_FRIENDS', 'Ese lector no está en tu mesa.', status=404)
    # Los brindis solo cuentan entre amigos actuales.
    Brindis.objects.filter(Q(giver=me, receiver=other) | Q(giver=other, receiver=me)).delete()
    return _ok(f'{other.username} ya no está en tu mesa.')


# ── Brindis ───────────────────────────────────────────────────────────

def give_brindis(me, other):
    if other.pk == me.pk:
        return _fail('SELF_BRINDIS', 'Brindar por uno mismo no cuenta.')
    if other.pk not in friend_ids(me):
        return _fail('NOT_FRIENDS', 'Solo puedes brindar por tus amigos.', status=403)
    try:
        with transaction.atomic():
            _, created = Brindis.objects.get_or_create(giver=me, receiver=other)
        if created:
            _evaluate_achievements(other)
    except IntegrityError:
        pass  # dos clics a la vez: el brindis ya quedó
    return _ok(f'¡Salud por {other.username}!', given=True,
               brindis_count=Brindis.objects.filter(receiver=other).count())


def remove_brindis(me, other):
    Brindis.objects.filter(giver=me, receiver=other).delete()
    return _ok('Brindis retirado.', given=False, brindis_count=Brindis.objects.filter(receiver=other).count())


# ── Ranking ───────────────────────────────────────────────────────────

def period_start(scope):
    today = timezone.localdate()
    if scope == 'week':
        return today - timedelta(days=today.weekday())  # la semana parte el lunes, como las misiones
    if scope == 'month':
        return today.replace(day=1)
    return None


def ranking(me, scope='week', limit=5):
    """Ranking de tus amigos y tú. 'all' usa el XP total; semana y mes, el registro diario."""
    from learning.models import DailyActivityLog

    ids = friend_ids(me) | {me.pk}
    profiles = list(_profiles().filter(user_id__in=ids))
    start = period_start(scope)
    if start is None:
        points = {p.user_id: p.xp for p in profiles}
    else:
        rows = (DailyActivityLog.objects.filter(user_id__in=ids, date__gte=start)
                .values('user_id').annotate(total=Sum('xp_earned')))
        points = {row['user_id']: row['total'] or 0 for row in rows}

    ordered = sorted(profiles, key=lambda p: (-points.get(p.user_id, 0), p.user.username.lower()))
    entries, rank, previous = [], 0, None
    for position, profile in enumerate(ordered, start=1):
        value = points.get(profile.user_id, 0)
        if value != previous:  # empates comparten puesto: 1, 2, 2, 4
            rank, previous = position, value
        entries.append({
            'rank': rank,
            'username': profile.user.username,
            'friend_code': profile.friend_code,
            'outfit': profile.outfit or {},
            'equipped_frame': profile.equipped_frame,
            'equipped_title': profile.equipped_title,
            'points': value,
            'is_me': profile.user_id == me.pk,
        })
    return {
        'scope': scope,
        'period_start': start,
        'entries': entries[:limit],
        'me': next((e for e in entries if e['is_me']), None),
        'participants': len(entries),
    }


# ── Chat de la mesa y reacciones ──────────────────────────────────────

REACTION_EMOJI = {
    'beer': '🍺',
    'heart': '❤️',
    'clap': '👏',
    'book': '📖',
    'sparkle': '✨',
}
# El corazón llega con o sin el selector de variación (U+FE0F) según el teclado.
_REACTION_BY_EMOJI = {emoji.replace('️', ''): key for key, emoji in REACTION_EMOJI.items()}

TAVERN_MESSAGES_MAX = 50


def _reaction_key(raw):
    """'beer' o '🍺' → 'beer'. None si no es una de las cinco reacciones."""
    raw = str(raw or '').strip()
    if raw in REACTION_EMOJI:
        return raw
    return _REACTION_BY_EMOJI.get(raw.replace('️', ''))


def _tavern_message_item(msg, me, profile) -> dict:
    return {
        'id': str(msg.id),
        'content': msg.content,
        'created_at': msg.created_at,
        'is_me': msg.user_id == me.pk,
        'username': msg.user.username,
        'friend_code': profile.friend_code if profile else None,
        'outfit': (profile.outfit or {}) if profile else {},
        'equipped_frame': profile.equipped_frame if profile else None,
    }


def list_tavern_messages(me, limit=30) -> list:
    """Mensajes de tu mesa (tú y tus amigos), del más nuevo al más viejo."""
    ids = friend_ids(me) | {me.pk}
    limit = max(1, min(int(limit), TAVERN_MESSAGES_MAX))
    messages = list(TavernMessage.objects
                    .filter(user_id__in=ids)
                    .select_related('user')
                    .order_by('-created_at')[:limit])
    profiles = {p.user_id: p for p in _profiles().filter(user_id__in={m.user_id for m in messages})}
    return [_tavern_message_item(msg, me, profiles.get(msg.user_id)) for msg in messages]


def send_tavern_message(me, raw_content) -> dict:
    """Envía un mensaje a la mesa con validaciones y protección contra spam."""
    content = str(raw_content or '').strip()
    if not content:
        return _fail('EMPTY_MESSAGE', 'El mensaje no puede estar vacío.')
    if len(content) > 200:
        return _fail('MESSAGE_TOO_LONG', 'El mensaje no puede superar los 200 caracteres.')

    now = timezone.now()
    last = TavernMessage.objects.filter(user=me).order_by('-created_at').first()
    if last and now - last.created_at < timedelta(seconds=3):
        return _fail('SPAM_COOLDOWN', 'Espera unos segundos antes de enviar otro mensaje.', status=429)

    recent_count = TavernMessage.objects.filter(user=me, created_at__gte=now - timedelta(minutes=10)).count()
    if recent_count >= 25:
        return _fail('RATE_LIMIT', 'Has enviado muchos mensajes recientemente. Tómate un respiro.', status=429)

    msg = TavernMessage.objects.create(user=me, content=content)
    profile = _profiles().filter(user=me).first()
    return _ok('Mensaje compartido.', status=201, message=_tavern_message_item(msg, me, profile))


def delete_tavern_message(me, message_id) -> dict:
    msg = TavernMessage.objects.filter(pk=message_id).first()
    if not msg:
        return _fail('NOT_FOUND', 'El mensaje ya no existe.', status=404)
    if msg.user_id != me.pk:
        return _fail('FORBIDDEN', 'Solo puedes eliminar tus propios mensajes.', status=403)
    msg.delete()
    return _ok('Mensaje eliminado.')


def send_tavern_reaction(me, raw_reaction) -> dict:
    """Reacciona a la mesa. No se guarda: tus amigos la ven flotar unos segundos y desaparece."""
    key = _reaction_key(raw_reaction)
    if key is None:
        return _fail('INVALID_REACTION', 'Reacción no válida.')
    if not live.take_reaction_slot(me):
        return _fail('REACTION_COOLDOWN', 'Un segundo entre reacciones.', status=429)

    item = live.push_reaction(me, key, REACTION_EMOJI[key])
    return _ok('Reacción enviada.', status=201, reaction={
        'id': item['id'],
        'reaction': key,
        'emoji': item['emoji'],
        'symbol': item['emoji'],
        'username': me.username,
        'created_at': item['created_at'],
    })


def recent_tavern_activity(me) -> dict:
    """Lo que la mesa sondea cada pocos segundos: mensajes, reacciones, invitaciones y charlas sin leer."""
    ids = friend_ids(me) | {me.pk}
    return {
        'messages': list_tavern_messages(me, limit=15),
        'invitations': tavern_invitations(me),
        'reactions': [{
            'id': item['id'],
            'reaction': item['reaction'],
            'emoji': item['emoji'],
            'username': item['username'],
            'is_me': item['user_id'] == str(me.pk),
            'created_at': item['created_at'],
        } for item in live.recent_reactions(ids)],
        'chat_unread': chat_unread(me),
    }


# ── Charlas privadas entre amigos ─────────────────────────────────────

CHAT_MAX_LENGTH = 500
CHAT_PAGE = 50
CHAT_COOLDOWN = timedelta(seconds=1)
CHAT_BURST_WINDOW = timedelta(minutes=5)
CHAT_BURST_MAX = 40


def _chat_item(msg, me) -> dict:
    return {
        'id': str(msg.id),
        'content': msg.content,
        'created_at': msg.created_at,
        'is_me': msg.sender_id == me.pk,
        'read': msg.read_at is not None,
    }


def _chat_partner_error(me, other):
    if other.pk == me.pk:
        return _fail('SELF_CHAT', 'No puedes conversar contigo mismo.')
    if other.pk not in friend_ids(me):
        return _fail('NOT_FRIENDS', 'Solo puedes conversar con tus amigos.', status=403)
    return None


def chat_unread(me) -> dict:
    """{'total': n, 'by_friend': {código: n}} con los mensajes sin leer de tus amigos actuales."""
    friends = friend_ids(me)
    if not friends:
        return {'total': 0, 'by_friend': {}}
    rows = (FriendMessage.objects.filter(recipient=me, read_at__isnull=True, sender_id__in=friends)
            .order_by().values('sender_id').annotate(n=Count('id')))
    counts = {row['sender_id']: row['n'] for row in rows}
    if not counts:
        return {'total': 0, 'by_friend': {}}
    codes = dict(_profiles().filter(user_id__in=counts).values_list('user_id', 'friend_code'))
    by_friend = {codes[uid]: n for uid, n in counts.items() if codes.get(uid)}
    return {'total': sum(by_friend.values()), 'by_friend': by_friend}


def chat_threads(me) -> dict:
    """Tus amigos con su último mensaje y los no leídos; primero las charlas más recientes."""
    friends = friends_list(me)
    if not friends:
        return {'threads': [], 'unread_total': 0}
    user_ids = dict(_profiles().filter(friend_code__in=[f['friend_code'] for f in friends])
                    .values_list('friend_code', 'user_id'))
    keys = {pair_key_for(me.pk, uid): code for code, uid in user_ids.items()}
    latest = FriendMessage.objects.filter(pair_key=OuterRef('pair_key')).order_by('-created_at')
    last_ids = (Friendship.objects.filter(pair_key__in=keys, status=Friendship.Status.ACCEPTED)
                .annotate(last_id=Subquery(latest.values('id')[:1]))
                .values_list('pair_key', 'last_id'))
    last_by_code = {}
    wanted = {last_id: keys[pair] for pair, last_id in last_ids if last_id}
    for msg in FriendMessage.objects.filter(pk__in=wanted):
        last_by_code[wanted[msg.pk]] = {
            'content': msg.content[:120],
            'created_at': msg.created_at,
            'is_me': msg.sender_id == me.pk,
        }
    unread = chat_unread(me)['by_friend']
    threads = [{
        **friend,
        'last_message': last_by_code.get(friend['friend_code']),
        'unread': unread.get(friend['friend_code'], 0),
    } for friend in friends]
    talked = sorted((t for t in threads if t['last_message']),
                    key=lambda t: t['last_message']['created_at'], reverse=True)
    silent = [t for t in threads if not t['last_message']]  # friends_list ya viene por nombre
    return {'threads': talked + silent, 'unread_total': sum(unread.values())}


def chat_messages(me, other, after=None) -> dict:
    """
    Los últimos mensajes de la charla con un amigo, del más viejo al más nuevo. Con `after`
    (id de un mensaje) entrega solo los posteriores. Marca como leídos los que te mandó.
    """
    error = _chat_partner_error(me, other)
    if error:
        return error
    key = pair_key_for(me.pk, other.pk)
    conversation = FriendMessage.objects.filter(pair_key=key)
    anchor = None
    if after:
        try:
            anchor = conversation.filter(pk=uuid.UUID(str(after))).values_list('created_at', flat=True).first()
        except ValueError:
            anchor = None
    if anchor is not None:
        messages = list(conversation.filter(created_at__gt=anchor).order_by('created_at')[:CHAT_PAGE])
    else:
        messages = list(conversation.order_by('-created_at')[:CHAT_PAGE])[::-1]

    now = timezone.now()
    marked = conversation.filter(recipient=me, read_at__isnull=True).update(read_at=now)
    if marked:
        for msg in messages:
            if msg.recipient_id == me.pk and msg.read_at is None:
                msg.read_at = now
    return _ok(messages=[_chat_item(msg, me) for msg in messages], incremental=anchor is not None)


def send_chat_message(me, other, raw_content) -> dict:
    error = _chat_partner_error(me, other)
    if error:
        return error
    content = str(raw_content or '').strip()
    if not content:
        return _fail('EMPTY_MESSAGE', 'El mensaje no puede estar vacío.')
    if len(content) > CHAT_MAX_LENGTH:
        return _fail('MESSAGE_TOO_LONG', f'El mensaje no puede superar los {CHAT_MAX_LENGTH} caracteres.')

    now = timezone.now()
    last = (FriendMessage.objects.filter(sender=me).order_by('-created_at')
            .values_list('created_at', flat=True).first())
    if last and now - last < CHAT_COOLDOWN:
        return _fail('SPAM_COOLDOWN', 'Espera un segundo antes de enviar otro mensaje.', status=429)
    if FriendMessage.objects.filter(sender=me, created_at__gte=now - CHAT_BURST_WINDOW).count() >= CHAT_BURST_MAX:
        return _fail('RATE_LIMIT', 'Has enviado muchos mensajes seguidos. Tómate un respiro.', status=429)

    msg = FriendMessage.objects.create(sender=me, recipient=other, content=content)
    return _ok('Mensaje enviado.', status=201, item=_chat_item(msg, me))


def tavern_invitations(me):
    friends = friend_ids(me)
    rows = list(TavernInvitation.objects.filter(
        Q(sender=me, recipient_id__in=friends) | Q(recipient=me, sender_id__in=friends),
        expires_at__gt=timezone.now(),
    ).select_related('sender', 'recipient').order_by('-created_at'))
    profiles = {p.user_id: p for p in _profiles().filter(user_id__in=friends)}
    result = {'incoming': [], 'outgoing': []}
    for row in rows:
        incoming = row.recipient_id == me.pk
        other = row.sender if incoming else row.recipient
        profile = profiles.get(other.pk)
        if profile:
            result['incoming' if incoming else 'outgoing'].append({
                'id': str(row.pk), 'created_at': row.created_at, 'expires_at': row.expires_at,
                'user': {'friend_code': profile.friend_code, 'username': other.username, 'outfit': profile.outfit or {}},
            })
    return result


def invite_to_tavern(me, other):
    if other.pk not in friend_ids(me):
        return _fail('NOT_FRIEND', 'Solo puedes invitar a tus amigos.', 403)
    now = timezone.now()
    TavernInvitation.objects.filter(sender=me, expires_at__lte=now).delete()
    invitation, created = TavernInvitation.objects.get_or_create(
        sender=me, recipient=other, defaults={'expires_at': now + timedelta(minutes=30)},
    )
    return _ok('Invitación enviada.' if created else 'Tu invitación sigue pendiente.',
               id=str(invitation.pk), expires_at=invitation.expires_at)


def respond_to_tavern_invitation(me, pk, accept):
    with transaction.atomic():
        row = TavernInvitation.objects.select_for_update().filter(pk=pk, recipient=me).first()
        if row is None or row.expires_at <= timezone.now() or row.sender_id not in friend_ids(me):
            return _fail('NOT_FOUND', 'Esta invitación ya no está disponible.', 404)
        TavernInvitation.objects.filter(pk=row.pk).delete()
        if accept:
            touch_presence(me)
        return _ok('Ya estás en la mesa. ¡Salud!' if accept else 'Invitación descartada.')


# ── Círculos de lectura grupal por capítulos ──────────────────────────

CLUB_MODES = {choice[0] for choice in ReadingClub.Mode.choices}


def _reader_chapter(user_id, book_id, book_chapters_count: int):
    """(capítulo donde va en el lector, cuándo lo guardó), o (None, None) si nunca abrió el libro."""
    from library.models import ReadingProgress
    prog = (ReadingProgress.objects
            .filter(inventory__user_id=user_id, inventory__edition__book_id=book_id)
            .order_by('-updated_at').first())
    if not prog:
        return None, None
    last = max(1, book_chapters_count)
    if prog.completion_percentage and float(prog.completion_percentage) >= 100:
        return last, prog.updated_at
    chapter = min(int(prog.current_page or 0), last)
    return (chapter or None), prog.updated_at


def _sync_member_reading_progress(member: ReadingClubMember, book_chapters_count: int) -> int:
    """
    Sube el capítulo del miembro hasta donde va en el lector, si leyó después de su última marca.
    Quien baja su capítulo a mano lo conserva hasta que vuelve a leer (antes saltaba de vuelta).
    """
    chapter, saved_at = _reader_chapter(member.user_id, member.club.book_id, book_chapters_count)
    if chapter and chapter > (member.current_chapter or 1) and saved_at > member.updated_at:
        member.current_chapter = chapter
        member.save(update_fields=['current_chapter', 'updated_at'])
    return member.current_chapter or 1


def _join_club(club: ReadingClub, user, book_chapters_count: int):
    """Suma al lector al círculo partiendo del capítulo donde ya va en su lector."""
    chapter, _ = _reader_chapter(user.pk, club.book_id, book_chapters_count)
    return ReadingClubMember.objects.get_or_create(club=club, user=user, defaults={'current_chapter': chapter or 1})


def _live_member(position) -> dict:
    return {
        'reading_now': bool(position and position['reading_now']),
        'position': position,
    }


def _club_summary(club: ReadingClub, me) -> dict:
    from library.models import UserInventory
    chapters_count = club.book.chapters.count() or 1
    memberships = list(club.memberships.select_related('user').all())
    user_ids = [m.user_id for m in memberships]
    profiles = {p.user_id: p for p in _profiles().filter(user_id__in=user_ids)}

    my_membership = next((m for m in memberships if m.user_id == me.pk), None)
    my_chapter = _sync_member_reading_progress(my_membership, chapters_count) if my_membership else 1

    inv = (UserInventory.objects
           .filter(user=me, edition__book_id=club.book_id)
           .values_list('id', flat=True).first())

    positions = live.club_positions(club.pk, user_ids)
    members_data = []
    for m in memberships:
        prof = profiles.get(m.user_id)
        chap = _sync_member_reading_progress(m, chapters_count) if m.user_id != me.pk else my_chapter
        members_data.append({
            'friend_code': prof.friend_code if prof else '',
            'username': m.user.username,
            'outfit': (prof.outfit or {}) if prof else {},
            'equipped_frame': prof.equipped_frame if prof else '',
            'current_chapter': chap,
            'is_host': m.user_id == club.host_id,
            'is_me': m.user_id == me.pk,
            **_live_member(positions.get(m.user_id)),
        })

    last_msg = club.messages.select_related('user').order_by('-created_at').first()
    return {
        'id': str(club.id),
        'name': club.name,
        'mode': club.mode,
        'unlocked_until_chapter': club.unlocked_until_chapter,
        'allow_member_invites': club.allow_member_invites,
        'is_host': club.host_id == me.pk,
        'my_chapter': my_chapter,
        'inventory_id': str(inv) if inv else None,
        'book': {
            'id': str(club.book_id),
            'title': club.book.title,
            'slug': club.book.slug,
            'cover_image': club.book.cover_image.url if club.book.cover_image else None,
            'chapters_count': chapters_count,
        },
        'members': members_data,
        'last_message': {
            'username': last_msg.user.username,
            'chapter_order': last_msg.chapter_order,
            'content': last_msg.content[:100],
            'created_at': last_msg.created_at,
        } if last_msg else None,
        'updated_at': club.updated_at,
    }


def list_reading_clubs(me) -> dict:
    club_ids = ReadingClubMember.objects.filter(user=me).values_list('club_id', flat=True)
    clubs = list(ReadingClub.objects.filter(id__in=club_ids).select_related('book', 'host').order_by('-updated_at'))
    return {'results': [_club_summary(c, me) for c in clubs]}


def available_books_for_club(me) -> dict:
    """Libros publicados que tienen capítulos (priorizando los de Mi Biblioteca)."""
    from catalog.models import Book
    from catalog.age import visible_books
    from library.models import UserInventory

    my_book_ids = set(UserInventory.objects.filter(user=me).values_list('edition__book_id', flat=True))
    qs = visible_books(Book.objects.filter(is_published=True), me).annotate(
        chapters_count=Count('chapters')
    ).filter(chapters_count__gt=0).order_by('-is_featured', 'title')[:40]

    books = []
    for b in qs:
        books.append({
            'id': str(b.id),
            'title': b.title,
            'slug': b.slug,
            'chapters_count': b.chapters_count,
            'in_library': b.id in my_book_ids,
        })
    books.sort(key=lambda x: (0 if x['in_library'] else 1, x['title']))
    return {'results': books}


@transaction.atomic
def create_reading_club(me, data: dict) -> dict:
    from catalog.models import Book
    from catalog.age import visible_books

    book_id = data.get('book_id')
    book = visible_books(Book.objects.filter(is_published=True), me).filter(pk=book_id).first() if book_id else None
    if not book:
        return _fail('BOOK_NOT_FOUND', 'Selecciona un libro válido para la lectura grupal.', 404)

    name = str(data.get('name') or '').strip()
    if not name:
        name = f'Lectura de {book.title}'[:120]
    else:
        name = name[:120]

    mode = str(data.get('mode') or ReadingClub.Mode.SPOILER_SAFE)
    if mode not in CLUB_MODES:
        mode = ReadingClub.Mode.SPOILER_SAFE

    chapters_count = max(1, book.chapters.count())
    try:
        unlocked = max(1, min(int(data.get('unlocked_until_chapter') or 1), chapters_count))
    except (TypeError, ValueError):
        unlocked = 1

    allow_invites = bool(data.get('allow_member_invites', True))

    club = ReadingClub.objects.create(
        name=name,
        book=book,
        host=me,
        mode=mode,
        unlocked_until_chapter=unlocked,
        allow_member_invites=allow_invites,
    )
    _join_club(club, me, chapters_count)

    raw_codes = data.get('friend_codes') or []
    if isinstance(raw_codes, list) and raw_codes:
        friends = friend_ids(me)
        clean_codes = [normalize_code(c) for c in raw_codes if normalize_code(c)]
        for prof in _profiles().filter(friend_code__in=clean_codes, user_id__in=friends):
            _join_club(club, prof.user, chapters_count)

    return _ok('¡Círculo de lectura creado!', status=201, club=_club_summary(club, me))


def _get_club_and_member(me, club_id):
    club = ReadingClub.objects.select_related('book', 'host').filter(pk=club_id).first()
    if not club:
        return None, None
    member = ReadingClubMember.objects.filter(club=club, user=me).first()
    return club, member


def _is_chapter_locked_for(club: ReadingClub, member: ReadingClubMember, chapter_order: int) -> tuple[bool, str | None]:
    if club.mode == ReadingClub.Mode.FREE:
        return False, None
    if club.mode == ReadingClub.Mode.HOST_PACED:
        if chapter_order > club.unlocked_until_chapter:
            return True, f'El anfitrión ha habilitado la conversación hasta el Capítulo {club.unlocked_until_chapter}.'
        return False, None
    # SPOILER_SAFE
    if chapter_order > member.current_chapter:
        return True, f'Protección anti-spoilers activa: marca tu avance al Capítulo {chapter_order} para ver y participar aquí.'
    return False, None


def reading_club_detail(me, club_id) -> dict:
    club, member = _get_club_and_member(me, club_id)
    if not club or not member:
        return _fail('NOT_FOUND', 'No formas parte de este círculo de lectura.', 404)

    summary = _club_summary(club, me)
    member.refresh_from_db()

    chapters_qs = list(club.book.chapters.order_by('order').values('id', 'order', 'title'))
    if not chapters_qs:
        chapters_qs = [{'id': None, 'order': 1, 'title': 'Capítulo 1'}]

    msg_counts = dict(
        ReadingClubMessage.objects.filter(club=club)
        .values('chapter_order').annotate(n=Count('id')).values_list('chapter_order', 'n')
    )

    chapters_data = []
    for ch in chapters_qs:
        order = ch['order']
        locked, reason = _is_chapter_locked_for(club, member, order)
        readers_here = [
            m for m in summary['members']
            if m['current_chapter'] == order
        ]
        chapters_data.append({
            'order': order,
            'title': ch['title'] or f'Capítulo {order}',
            'locked': locked,
            'lock_reason': reason,
            'message_count': msg_counts.get(order, 0),
            'readers_here': readers_here,
        })

    summary['chapters'] = chapters_data
    return _ok(club=summary)


@transaction.atomic
def update_reading_club_settings(me, club_id, data: dict) -> dict:
    club, member = _get_club_and_member(me, club_id)
    if not club or not member:
        return _fail('NOT_FOUND', 'No encontramos este círculo de lectura.', 404)
    if club.host_id != me.pk:
        return _fail('FORBIDDEN', 'Solo el anfitrión del grupo puede cambiar las reglas.', 403)

    chapters_count = max(1, club.book.chapters.count())
    if 'name' in data and str(data['name']).strip():
        club.name = str(data['name']).strip()[:120]
    if 'mode' in data and data['mode'] in CLUB_MODES:
        club.mode = data['mode']
    if 'unlocked_until_chapter' in data:
        try:
            club.unlocked_until_chapter = max(1, min(int(data['unlocked_until_chapter']), chapters_count))
        except (TypeError, ValueError):
            pass
    if 'allow_member_invites' in data:
        club.allow_member_invites = bool(data['allow_member_invites'])

    club.save()
    return reading_club_detail(me, club.id)


@transaction.atomic
def update_my_club_progress(me, club_id, chapter_order: int) -> dict:
    club, member = _get_club_and_member(me, club_id)
    if not club or not member:
        return _fail('NOT_FOUND', 'No formas parte de este círculo de lectura.', 404)
    chapters_count = max(1, club.book.chapters.count())
    try:
        target = max(1, min(int(chapter_order), chapters_count))
    except (TypeError, ValueError):
        return _fail('INVALID_CHAPTER', 'Indica un número de capítulo válido.')

    member.current_chapter = target
    member.save(update_fields=['current_chapter', 'updated_at'])
    club.save(update_fields=['updated_at'])
    res = reading_club_detail(me, club.id)
    res['message'] = f'Tu capítulo en el círculo quedó en el {target}.'
    return res


@transaction.atomic
def invite_friends_to_club(me, club_id, friend_codes: list) -> dict:
    club, member = _get_club_and_member(me, club_id)
    if not club or not member:
        return _fail('NOT_FOUND', 'No encontramos este círculo de lectura.', 404)
    if club.host_id != me.pk and not club.allow_member_invites:
        return _fail('FORBIDDEN', 'Solo el anfitrión puede sumar integrantes en este grupo.', 403)

    friends = friend_ids(me)
    clean_codes = [normalize_code(c) for c in (friend_codes or []) if normalize_code(c)]
    chapters_count = max(1, club.book.chapters.count())
    added = 0
    for prof in _profiles().filter(friend_code__in=clean_codes, user_id__in=friends):
        _, created = _join_club(club, prof.user, chapters_count)
        if created:
            added += 1
    club.save(update_fields=['updated_at'])
    res = reading_club_detail(me, club.id)
    res['message'] = f'Se sumaron {added} amigo(s) al círculo.' if added else 'Tus amigos seleccionados ya estaban en el círculo.'
    return res


@transaction.atomic
def leave_or_delete_club(me, club_id) -> dict:
    club, member = _get_club_and_member(me, club_id)
    if not club or not member:
        return _fail('NOT_FOUND', 'No encontramos este círculo de lectura.', 404)
    if club.host_id == me.pk:
        club.delete()
        return _ok('El círculo de lectura fue cerrado.')
    member.delete()
    return _ok('Saliste del círculo de lectura.')


# ── Lectura simultánea: dónde va cada uno mientras lee ────────────────
# El lector abierto avisa su posición cada pocos segundos (sondeo corto: el servidor corre un
# solo proceso de gunicorn y sin websockets) y de vuelta recibe la de sus compañeros.

LIVE_POLL_MS = 5000
CHAPTERS_COUNT_TTL = 10 * 60


def clubs_for_book(me, book_id) -> dict:
    """Mis círculos de este libro, para que el lector sepa con quién se lee (del más activo al menos)."""
    club_ids = ReadingClubMember.objects.filter(user=me, club__book_id=book_id).values_list('club_id', flat=True)
    clubs = ReadingClub.objects.filter(id__in=club_ids).order_by('-updated_at')
    return {'results': [{
        'id': str(c.id),
        'name': c.name,
        'mode': c.mode,
        'is_host': c.host_id == me.pk,
    } for c in clubs]}


def _chapters_count(club: ReadingClub) -> int:
    # El lector pregunta cada 5 s: el número de capítulos de un libro casi nunca cambia.
    return cache.get_or_set(f'club:chapters:{club.book_id}',
                            lambda: max(1, club.book.chapters.count()), CHAPTERS_COUNT_TTL)


def _clean_position(data) -> dict | None:
    """{chapter, word, fraction} válidos, o None si no llegó un capítulo (solo sigue abierto)."""
    if not isinstance(data, dict) or data.get('chapter') in (None, ''):
        return None
    try:
        chapter = int(data['chapter'])
    except (TypeError, ValueError):
        raise ValueError
    try:
        word = int(data['word']) if data.get('word') not in (None, '') else None
    except (TypeError, ValueError):
        word = None
    try:
        fraction = float(data.get('fraction') or 0)
    except (TypeError, ValueError):
        fraction = 0.0
    if fraction != fraction:  # NaN
        fraction = 0.0
    return {
        'chapter': chapter,
        'word': word if word is not None and word >= 0 else None,
        'fraction': round(min(1.0, max(0.0, fraction)), 3),
    }


def club_live(me, club_id, data=None) -> dict:
    """
    GET: dónde va cada miembro y quién está leyendo ahora.
    POST (data): además avisa que sigo leyendo y, si viene, mi posición.
    """
    club, member = _get_club_and_member(me, club_id)
    if not club or not member:
        return _fail('NOT_FOUND', 'No formas parte de este círculo de lectura.', 404)
    chapters_count = _chapters_count(club)

    if data is not None:
        try:
            position = _clean_position(data)
        except ValueError:
            return _fail('INVALID_POSITION', 'Indica un número de capítulo válido.')
        if position and not 1 <= position['chapter'] <= chapters_count:
            return _fail('INVALID_POSITION', 'Ese capítulo no existe en el libro.')
        live.touch_club_position(club.pk, me, position)
        # Avanzar en el lector también avanza tu capítulo del círculo (y abre sus salas).
        if position and position['chapter'] > member.current_chapter:
            ReadingClubMember.objects.filter(pk=member.pk, current_chapter__lt=position['chapter']).update(
                current_chapter=position['chapter'], updated_at=timezone.now())

    memberships = list(club.memberships.select_related('user').order_by('created_at'))
    profiles = {p.user_id: p for p in _profiles().filter(user_id__in=[m.user_id for m in memberships])}
    positions = live.club_positions(club.pk, [m.user_id for m in memberships])
    members = []
    for m in memberships:
        prof = profiles.get(m.user_id)
        members.append({
            'friend_code': prof.friend_code if prof else '',
            'username': m.user.username,
            'outfit': (prof.outfit or {}) if prof else {},
            'is_host': m.user_id == club.host_id,
            'is_me': m.user_id == me.pk,
            'current_chapter': m.current_chapter,
            **_live_member(positions.get(m.user_id)),
        })
    return _ok(
        club={'id': str(club.id), 'name': club.name, 'mode': club.mode, 'chapters_count': chapters_count},
        members=members,
        poll_ms=LIVE_POLL_MS,
    )


def leave_club_live(me, club_id) -> dict:
    """Cerró el lector: deja de verse «leyendo ahora» sin esperar a que caduque."""
    club, member = _get_club_and_member(me, club_id)
    if not club or not member:
        return _fail('NOT_FOUND', 'No formas parte de este círculo de lectura.', 404)
    live.leave_club_position(club.pk, me)
    return _ok()


def _club_msg_item(msg: ReadingClubMessage, me, profiles_map: dict) -> dict:
    prof = profiles_map.get(msg.user_id)
    return {
        'id': str(msg.id),
        'chapter_order': msg.chapter_order,
        'content': msg.content,
        'is_spoiler': msg.is_spoiler,
        'created_at': msg.created_at,
        'is_me': msg.user_id == me.pk,
        'username': msg.user.username,
        'friend_code': prof.friend_code if prof else '',
        'outfit': (prof.outfit or {}) if prof else {},
        'equipped_frame': prof.equipped_frame if prof else '',
    }


def list_chapter_messages(me, club_id, chapter_order: int, after=None) -> dict:
    club, member = _get_club_and_member(me, club_id)
    if not club or not member:
        return _fail('NOT_FOUND', 'No formas parte de este círculo de lectura.', 404)

    chapters_count = max(1, club.book.chapters.count())
    _sync_member_reading_progress(member, chapters_count)
    locked, reason = _is_chapter_locked_for(club, member, chapter_order)
    if locked:
        return _fail('CHAPTER_LOCKED', reason or 'Este capítulo está bloqueado.', 403)

    qs = ReadingClubMessage.objects.filter(club=club, chapter_order=chapter_order).select_related('user')
    anchor = None
    if after:
        try:
            anchor = qs.filter(pk=uuid.UUID(str(after))).values_list('created_at', flat=True).first()
        except ValueError:
            anchor = None
    if anchor is not None:
        msgs = list(qs.filter(created_at__gt=anchor).order_by('created_at')[:CHAT_PAGE])
    else:
        msgs = list(qs.order_by('-created_at')[:CHAT_PAGE])[::-1]

    uids = {m.user_id for m in msgs}
    profiles_map = {p.user_id: p for p in _profiles().filter(user_id__in=uids)} if uids else {}
    return _ok(
        messages=[_club_msg_item(m, me, profiles_map) for m in msgs],
        incremental=anchor is not None,
    )


@transaction.atomic
def send_chapter_message(me, club_id, chapter_order: int, raw_content: str, is_spoiler: bool = False) -> dict:
    club, member = _get_club_and_member(me, club_id)
    if not club or not member:
        return _fail('NOT_FOUND', 'No formas parte de este círculo de lectura.', 404)

    chapters_count = max(1, club.book.chapters.count())
    if chapter_order < 1 or chapter_order > chapters_count:
        return _fail('INVALID_CHAPTER', 'Este capítulo no existe en el libro.')

    _sync_member_reading_progress(member, chapters_count)
    locked, reason = _is_chapter_locked_for(club, member, chapter_order)
    if locked:
        return _fail('CHAPTER_LOCKED', reason or 'Este capítulo está bloqueado.', 403)

    content = str(raw_content or '').strip()
    if not content:
        return _fail('EMPTY_MESSAGE', 'El mensaje no puede estar vacío.')
    if len(content) > CHAT_MAX_LENGTH:
        return _fail('MESSAGE_TOO_LONG', f'El mensaje no puede superar los {CHAT_MAX_LENGTH} caracteres.')

    msg = ReadingClubMessage.objects.create(
        club=club,
        user=me,
        chapter_order=chapter_order,
        content=content,
        is_spoiler=bool(is_spoiler),
    )
    club.save(update_fields=['updated_at'])
    prof = _profiles().filter(user=me).first()
    profiles_map = {me.pk: prof} if prof else {}
    return _ok('Comentario publicado en el capítulo.', status=201, item=_club_msg_item(msg, me, profiles_map))

