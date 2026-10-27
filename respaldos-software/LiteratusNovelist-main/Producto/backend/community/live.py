"""
community/live.py — Lo efímero de La Taberna: las reacciones (🍺, ❤️, 👏, 📖, ✨) y dónde va
cada lector de una lectura conjunta.

No tocan la base de datos: viven unos segundos en la caché de Django y se pierden solas.
La mesa recoge las reacciones en su sondeo de actividad (cada 8 s) y las anima como emojis
flotantes; el lector avisa su posición cada pocos segundos mientras está abierto.

La caché por defecto es la de memoria, propia de cada proceso. Render arranca un solo
proceso de gunicorn, así que todos los lectores comparten la misma; si algún día corren
varios procesos, hay que configurar una caché compartida en CACHES.
"""
import uuid
from datetime import datetime, timedelta, timezone as dt_timezone

from django.core.cache import cache
from django.utils import timezone

REACTION_TTL = 30            # segundos que la caché guarda la lista de cada lector
REACTION_WINDOW = timedelta(seconds=20)  # lo que la mesa todavía muestra
REACTION_COOLDOWN = 1        # segundos entre reacciones de un mismo lector
REACTIONS_KEPT = 10


def _key(user_id) -> str:
    return f'tavern:reactions:{user_id}'


def take_reaction_slot(user) -> bool:
    """True si el lector puede reaccionar ahora (una reacción por segundo)."""
    return cache.add(f'tavern:reaction-cooldown:{user.pk}', 1, REACTION_COOLDOWN)


def push_reaction(user, reaction: str, emoji: str) -> dict:
    now = timezone.now()
    item = {
        'id': uuid.uuid4().hex,
        'reaction': reaction,
        'emoji': emoji,
        'username': user.username,
        'user_id': str(user.pk),
        'created_at': now.isoformat(),
    }
    # Dos reacciones simultáneas del mismo lector pueden pisarse: es un adorno, no importa.
    items = [item, *(cache.get(_key(user.pk)) or [])][:REACTIONS_KEPT]
    cache.set(_key(user.pk), items, REACTION_TTL)
    return item


def _parse(iso: str) -> datetime:
    moment = datetime.fromisoformat(iso)
    return moment if moment.tzinfo else moment.replace(tzinfo=dt_timezone.utc)


def recent_reactions(user_ids, limit=10) -> list:
    """Reacciones de los últimos segundos de estos lectores, de la más nueva a la más vieja."""
    since = timezone.now() - REACTION_WINDOW
    found = []
    for items in cache.get_many([_key(uid) for uid in user_ids]).values():
        for item in items:
            if _parse(item['created_at']) >= since:
                found.append(item)
    found.sort(key=lambda item: item['created_at'], reverse=True)
    return found[:limit]


# ── Lectura conjunta: posición en vivo ────────────────────────────────

CLUB_POSITION_TTL = 10 * 60                  # la última posición se recuerda 10 min
CLUB_LIVE_WINDOW = timedelta(seconds=20)     # «leyendo ahora»: el lector avisó hace menos de 20 s


def _club_key(club_id, user_id) -> str:
    return f'club:live:{club_id}:{user_id}'


def touch_club_position(club_id, user, position: dict | None) -> None:
    """
    El lector sigue abierto. Con `position` ({chapter, word, fraction}) la reemplaza; sin ella
    (libro cerrado en la tapa, capítulo todavía cargando) conserva la última que avisó.
    """
    key = _club_key(club_id, user.pk)
    if position is None:
        position = {k: v for k, v in (cache.get(key) or {}).items() if k in ('chapter', 'word', 'fraction')}
    cache.set(key, {**position, 'active': True, 'updated_at': timezone.now().isoformat()}, CLUB_POSITION_TTL)


def leave_club_position(club_id, user) -> None:
    """Cerró el lector: deja de estar «leyendo ahora», pero su última posición sigue a la vista."""
    key = _club_key(club_id, user.pk)
    item = cache.get(key)
    if item:
        cache.set(key, {**item, 'active': False}, CLUB_POSITION_TTL)


def club_positions(club_id, user_ids) -> dict:
    """{user_id: {chapter, word, fraction, updated_at, reading_now}} de quienes avisaron hace poco."""
    keys = {_club_key(club_id, uid): uid for uid in user_ids}
    now = timezone.now()
    found = {}
    for key, item in cache.get_many(list(keys)).items():
        fresh = now - _parse(item['updated_at']) <= CLUB_LIVE_WINDOW
        found[keys[key]] = {
            'chapter': item.get('chapter'),
            'word': item.get('word'),
            'fraction': item.get('fraction', 0),
            'updated_at': item['updated_at'],
            'reading_now': bool(item.get('active')) and fresh,
        }
    return found
