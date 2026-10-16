"""
community/live.py — Lo efímero de La Taberna: las reacciones (🍺, ❤️, 👏, 📖, ✨).

No tocan la base de datos: viven unos segundos en la caché de Django y se pierden solas.
La mesa las recoge en su sondeo de actividad (cada 8 s) y las anima como emojis flotantes.

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


def recent_reactions(user_ids, limit=10) -> list:
    """Reacciones de los últimos segundos de estos lectores, de la más nueva a la más vieja."""
    since = timezone.now() - REACTION_WINDOW
    found = []
    for items in cache.get_many([_key(uid) for uid in user_ids]).values():
        for item in items:
            created = datetime.fromisoformat(item['created_at'])
            if created.tzinfo is None:
                created = created.replace(tzinfo=dt_timezone.utc)
            if created >= since:
                found.append(item)
    found.sort(key=lambda item: item['created_at'], reverse=True)
    return found[:limit]
