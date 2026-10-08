"""
community/services.py — Lógica de La Taberna de Tinta: amistades, brindis, tarjetas de
perfil, estado de los amigos y ranking.

Las funciones que escriben devuelven {'success', 'error', 'message', 'status'} como el
resto de servicios del proyecto; `status` es el código HTTP que debe responder la vista.
Hacer amigos o brindar no da XP ni Tinta: así nadie infla el ranking con cuentas falsas.
"""
import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from users.models import Profile
from users.serializers import level_name_for
from .models import Brindis, Friendship, TavernInvitation, TavernMessage, TavernReaction, pair_key_for

User = get_user_model()

MAX_PENDING_OUTGOING = 30
MAX_FRIENDS = 150
DECLINE_COOLDOWN = timedelta(days=7)
TAVERN_ONLINE_WINDOW = timedelta(seconds=150)
READING_WINDOW = timedelta(minutes=10)
OPEN_SESSION_WINDOW = timedelta(minutes=45)
PRESENCE_WRITE_EVERY = timedelta(seconds=30)
SEARCH_LIMIT = 8

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
        'relation': relation,
        'request_id': request_id,
    }


def profile_stats(user) -> dict:
    from catalog.models import Review
    from library.models import ReadingProgress

    return {
        'books_read': ReadingProgress.objects.filter(
            inventory__user=user, completion_percentage__gte=100, is_active=True).count(),
        'reviews': Review.objects.filter(user=user).count(),
        'friends': len(friend_ids(user)),
        'brindis': Brindis.objects.filter(receiver=user).count(),
    }


def full_card(profile, relation) -> dict:
    """Perfil completo: para uno mismo y para los amigos."""
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
        'equipped_title': profile.equipped_title,
        'favorite_genres': [{'name': g.name, 'slug': g.slug} for g in profile.favorite_genres.all()[:6]],
        'stats': profile_stats(user),
        'member_since': user.date_joined,
        'relation': relation,
        'request_id': None,
    }


def my_card(user) -> dict:
    profile = _profiles().filter(user=user).first() or Profile.objects.get_or_create(user=user)[0]
    return {**full_card(profile, 'self'), 'pending_incoming': pending_incoming_count(user)}


def profile_for_viewer(me, raw_code):
    """Perfil por código: completo si eres tú o un amigo; mínimo en otro caso. None si no existe."""
    profile = profile_by_code(raw_code)
    if profile is None:
        return None
    if profile.user_id == me.pk:
        return full_card(profile, 'self')
    relation, request_id = relations_for(me, [profile.user_id])[profile.user_id]
    if relation != 'friend':
        return minimal_card(profile, relation, request_id)
    card = full_card(profile, 'friend')
    card['brindis_given'] = Brindis.objects.filter(giver=me, receiver=profile.user).exists()
    return card


def search(me, raw_query) -> list:
    """Busca por código exacto y por nombre de usuario que empiece con el texto."""
    query = str(raw_query or '').strip().lstrip('#').strip()
    if len(query) < 3:
        return []
    base = _profiles().exclude(user=me)
    found = []
    code = normalize_code(query)
    if code:
        found.extend(base.filter(friend_code=code))
    found.extend(
        base.filter(user__username__istartswith=query)
        .exclude(pk__in=[p.pk for p in found])
        .order_by('user__username')[:SEARCH_LIMIT - len(found)]
    )
    relations = relations_for(me, [p.user_id for p in found])
    return [minimal_card(p, *relations[p.user_id]) for p in found]


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


# ── Chat y Reacciones de La Taberna ───────────────────────────────────

REACTION_MAP = {
    'beer': '🍺',
    'heart': '❤️',
    'clap': '👏',
    'book': '📖',
    'sparkle': '✨',
    '🍺': 'beer',
    '❤️': 'heart',
    '👏': 'clap',
    '📖': 'book',
    '✨': 'sparkle',
}


def list_tavern_messages(me, limit=30) -> list:
    """Mensajes de tu mesa (tú y tus amigos)."""
    ids = friend_ids(me) | {me.pk}
    messages = list(TavernMessage.objects
                    .filter(user_id__in=ids)
                    .select_related('user')
                    .prefetch_related('reactions')
                    .order_by('-created_at')[:limit])

    profiles = {p.user_id: p for p in _profiles().filter(user_id__in=ids)}
    result = []
    for msg in messages:
        profile = profiles.get(msg.user_id)
        reaction_counts = {}
        for r in msg.reactions.all():
            reaction_counts[r.reaction] = reaction_counts.get(r.reaction, 0) + 1

        result.append({
            'id': str(msg.id),
            'content': msg.content,
            'created_at': msg.created_at,
            'is_me': msg.user_id == me.pk,
            'username': msg.user.username,
            'friend_code': profile.friend_code if profile else None,
            'outfit': profile.outfit if profile else {},
            'reactions': reaction_counts,
        })
    return result


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
    return _ok('Mensaje compartido.', status=201, message={
        'id': str(msg.id),
        'content': msg.content,
        'created_at': msg.created_at,
        'is_me': True,
        'username': me.username,
        'friend_code': profile.friend_code if profile else None,
        'outfit': profile.outfit if profile else {},
        'reactions': {},
    })


def delete_tavern_message(me, message_id) -> dict:
    msg = TavernMessage.objects.filter(pk=message_id).first()
    if not msg:
        return _fail('NOT_FOUND', 'El mensaje ya no existe.', status=404)
    if msg.user_id != me.pk:
        return _fail('FORBIDDEN', 'Solo puedes eliminar tus propios mensajes.', status=403)
    msg.delete()
    return _ok('Mensaje eliminado.')


def send_tavern_reaction(me, raw_reaction, message_id=None) -> dict:
    """Reacciona a la mesa o a un mensaje."""
    canonical = REACTION_MAP.get(raw_reaction)
    if not canonical:
        return _fail('INVALID_REACTION', 'Reacción no válida.')
    # Normalizar a clave en texto inglés si vino como emoji
    if canonical not in ('beer', 'heart', 'clap', 'book', 'sparkle'):
        canonical = raw_reaction

    now = timezone.now()
    last = TavernReaction.objects.filter(user=me).order_by('-created_at').first()
    if last and now - last.created_at < timedelta(seconds=1):
        return _fail('REACTION_COOLDOWN', 'Un segundo entre reacciones.', status=429)

    target_msg = None
    if message_id:
        target_msg = TavernMessage.objects.filter(pk=message_id).first()

    rec = TavernReaction.objects.create(user=me, message=target_msg, reaction=canonical)
    emoji = REACTION_MAP.get(canonical, canonical)
    return _ok('Reacción enviada.', status=201, reaction={
        'id': str(rec.id),
        'reaction': canonical,
        'emoji': emoji,
        'symbol': emoji,
        'username': me.username,
        'message_id': str(target_msg.id) if target_msg else None,
        'created_at': rec.created_at,
    })


def recent_tavern_activity(me) -> dict:
    """Últimos mensajes y reacciones recientes (para actualizar burbujas y animaciones en vivo)."""
    ids = friend_ids(me) | {me.pk}
    messages = list_tavern_messages(me, limit=15)
    now = timezone.now()
    recent_reactions = (TavernReaction.objects
                        .filter(user_id__in=ids, created_at__gte=now - timedelta(seconds=20))
                        .select_related('user')
                        .order_by('-created_at')[:10])

    return {
        'messages': messages,
        'invitations': tavern_invitations(me),
        'reactions': [{
            'id': str(r.id),
            'reaction': r.reaction,
            'emoji': REACTION_MAP.get(r.reaction, '✨'),
            'username': r.user.username,
            'is_me': r.user_id == me.pk,
            'message_id': str(r.message_id) if r.message_id else None,
            'created_at': r.created_at,
        } for r in recent_reactions],
    }


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
