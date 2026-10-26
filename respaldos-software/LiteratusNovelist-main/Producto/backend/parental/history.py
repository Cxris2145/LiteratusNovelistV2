"""
Historial de un hijo para el panel del tutor: lectura, juegos, lo que escribe, chats y actividad.

Todo es de solo lectura. No se usan ensure_streak, calculate_and_sync_hearts ni el endpoint de
misiones, porque esos escriben en la cuenta (el tutor solo mira).

Minutos leídos: una sesión del lector cerrada cuenta lo que duró, con un tope de
READING_SESSION_CAP (una pestaña olvidada no suma horas). Una sesión sin cerrar no cuenta, salvo
la que sigue en curso (abierta hace menos de OPEN_SESSION_WINDOW): el lector la cierra al salir,
y si el navegador se cerró antes no hay forma de saber cuánto duró.
"""
from collections import defaultdict
from datetime import timedelta

from django.db.models import Count, Max, Q
from django.http import Http404
from django.utils import timezone

READING_SESSION_CAP = timedelta(hours=3)
OPEN_SESSION_WINDOW = timedelta(minutes=45)
HISTORY_DAYS = 30
MAX_EVENTS = 100

ENIGMA_LABELS = {'solved': 'Resuelto', 'lost': 'Perdido', 'abandoned': 'Abandonado'}
INTERROGATION_LABELS = {'playing': 'En curso', 'won': 'Adivinó', 'lost': 'No adivinó', 'abandoned': 'Abandonó'}


# ── Utilidades ────────────────────────────────────────────────────────

def session_minutes(started_at, ended_at, now=None) -> float:
    now = now or timezone.now()
    if ended_at is None:
        if now - started_at > OPEN_SESSION_WINDOW:
            return 0.0
        ended_at = now
    elapsed = max(timedelta(0), min(ended_at - started_at, READING_SESSION_CAP))
    return elapsed.total_seconds() / 60


def _local_date(moment):
    return timezone.localtime(moment).date()


def _cover(book, request=None):
    if not book.cover_image:
        return None
    url = book.cover_image.url
    return request.build_absolute_uri(url) if request else url


def _clip(text, limit):
    text = ' '.join(str(text or '').split())
    return text if len(text) <= limit else text[:limit - 1].rstrip() + '…'


def _sessions(child):
    from library.models import ReadingSession

    return list(ReadingSession.objects.filter(user=child)
                .values_list('book_id', 'started_at', 'ended_at').order_by('-started_at'))


def _enigma_result(tx):
    if tx.concept == 'daily_enigma':
        return 'solved'
    return 'lost' if tx.reference_id == 'lost' else 'abandoned'


def last_activity(child):
    """El momento más reciente en que el hijo hizo algo (o entró)."""
    from learning.models import UserExerciseAttempt
    from library.models import InkTransaction, ReadingProgress, ReadingSession

    moments = [
        child.last_login,
        ReadingProgress.objects.filter(inventory__user=child).aggregate(m=Max('updated_at'))['m'],
        ReadingSession.objects.filter(user=child).aggregate(m=Max('started_at'))['m'],
        UserExerciseAttempt.objects.filter(user=child).aggregate(m=Max('created_at'))['m'],
        InkTransaction.objects.filter(user=child).aggregate(m=Max('created_at'))['m'],
    ]
    moments = [m for m in moments if m]
    return max(moments) if moments else None


# ── Resumen ───────────────────────────────────────────────────────────

def overview(child):
    from ai_engine.models import BlindInterrogationSession, ChatSession
    from community.services import profile_stats
    from learning.services import get_streak_details, learning_stats
    from library.models import (Achievement, InkTransaction, NotebookTab, UserAchievement, UserHighlight,
                                UserPostIt, UserVocabulary)
    from users.serializers import level_name_for

    from .services import age_of, is_child_email

    profile = child.profile
    now = timezone.now()
    today = timezone.localdate()
    minutes_7 = minutes_30 = minutes_total = 0.0
    for _, started, ended in _sessions(child):
        minutes = session_minutes(started, ended, now)
        minutes_total += minutes
        days_ago = (today - _local_date(started)).days
        if days_ago < 7:
            minutes_7 += minutes
        if days_ago < HISTORY_DAYS:
            minutes_30 += minutes
    senda = learning_stats(child)
    streak = get_streak_details(child)
    return {
        'child': {
            'id': str(child.pk),
            'username': child.username,
            'first_name': child.first_name,
            'age': age_of(child),
            'avatar_color': profile.avatar_color,
            'member_since': child.date_joined,
            'last_login': child.last_login,
            'has_own_email': not is_child_email(child.email),
        },
        'profile': {
            'level': profile.level,
            'level_name': level_name_for(profile.level),
            'xp': profile.xp,
            'ink_balance': profile.ink_balance,
            'streak_current': profile.streak_current,
            'streak_max': profile.streak_max,
        },
        'library': profile_stats(child),
        'reading': {
            'minutes_7d': round(minutes_7),
            'minutes_30d': round(minutes_30),
            'minutes_total': round(minutes_total),
        },
        'senda': senda,
        'games': {
            'enigmas_solved': InkTransaction.objects.filter(user=child, concept='daily_enigma').count(),
            'interrogations_won': BlindInterrogationSession.objects.filter(user=child, status='won').count(),
            'achievements_unlocked': UserAchievement.objects.filter(user=child, unlocked_at__isnull=False).count(),
            'achievements_total': Achievement.objects.count(),
        },
        'writing': {
            'highlights': UserHighlight.objects.filter(inventory__user=child).count(),
            'post_its': UserPostIt.objects.filter(inventory__user=child).count(),
            'vocabulary': UserVocabulary.objects.filter(user=child).count(),
            'notebook_tabs': NotebookTab.objects.filter(user=child).count(),
            'chats': ChatSession.objects.filter(user=child).count(),
        },
        'calendar': streak['calendar'],
        'last_activity': last_activity(child),
    }


# ── Lectura ───────────────────────────────────────────────────────────

def reading(child, request=None):
    from catalog.age import visible_books
    from catalog.models import Chapter
    from library.models import InkTransaction, UserInventory

    now = timezone.now()
    today = timezone.localdate()
    inventory = list(visible_books(UserInventory.objects.filter(user=child), child, 'edition__book__')
                     .select_related('edition__book', 'progress'))
    book_ids = {item.edition.book_id for item in inventory}
    chapter_totals = dict(Chapter.objects.filter(book_id__in=book_ids).values('book_id')
                          .annotate(n=Count('id')).values_list('book_id', 'n'))
    finished = {}
    for tx in InkTransaction.objects.filter(user=child, concept='book_completed').order_by('created_at'):
        finished.setdefault(tx.reference_id, tx.created_at)

    sessions = _sessions(child)
    per_book = defaultdict(lambda: {'minutes': 0.0, 'sessions': 0, 'last': None})
    daily = defaultdict(float)
    for book_id, started, ended in sessions:
        minutes = session_minutes(started, ended, now)
        entry = per_book[book_id]
        entry['minutes'] += minutes
        entry['sessions'] += 1
        entry['last'] = max(entry['last'], started) if entry['last'] else started
        if (today - _local_date(started)).days < HISTORY_DAYS:
            daily[_local_date(started)] += minutes

    books, seen = [], set()
    for item in inventory:
        book = item.edition.book
        if book.pk in seen:  # dos ediciones del mismo libro: una fila
            continue
        seen.add(book.pk)
        progress = getattr(item, 'progress', None)
        stats = per_book.get(book.pk, {'minutes': 0.0, 'sessions': 0, 'last': None})
        last_read = max(filter(None, [stats['last'], progress.updated_at if progress else None]), default=None)
        books.append({
            'book_id': str(book.pk),
            'title': book.title,
            'slug': book.slug,
            'cover': _cover(book, request),
            'acquired_at': item.acquired_at,
            'current_chapter': progress.current_page if progress else 0,
            'total_chapters': chapter_totals.get(book.pk, 0),
            'completion_percentage': float(progress.completion_percentage) if progress else 0.0,
            'minutes': round(stats['minutes']),
            'sessions': stats['sessions'],
            'last_read_at': last_read,
            'finished_at': finished.get(str(book.pk)),
        })
    books.sort(key=lambda b: b['last_read_at'] or b['acquired_at'], reverse=True)

    titles = {item.edition.book_id: item.edition.book.title for item in inventory}
    missing = {book_id for book_id, _, _ in sessions[:20]} - set(titles)
    if missing:
        from catalog.models import Book
        titles.update(Book.objects.filter(pk__in=missing).values_list('pk', 'title'))
    recent = [{
        'book_title': titles.get(book_id, 'Libro'),
        'started_at': started,
        'ended_at': ended,
        'minutes': round(session_minutes(started, ended, now)),
        'in_progress': ended is None and now - started <= OPEN_SESSION_WINDOW,
    } for book_id, started, ended in sessions[:20]]

    days = []
    for offset in range(HISTORY_DAYS - 1, -1, -1):
        day = today - timedelta(days=offset)
        days.append({'date': day.isoformat(), 'minutes': round(daily.get(day, 0))})

    return {
        'books': books,
        'daily_minutes': days,
        'recent_sessions': recent,
        'totals': {
            'books': len(books),
            'finished': sum(1 for b in books if b['completion_percentage'] >= 100),
            'minutes': round(sum(entry['minutes'] for entry in per_book.values())),
            'sessions': len(sessions),
        },
    }


# ── Juegos ────────────────────────────────────────────────────────────

def games(child):
    from ai_engine.models import BlindInterrogationSession
    from learning.models import LearningUnit, UserExerciseAttempt, UserLevelProgress
    from learning.services import get_streak_details, learning_stats
    from library.models import UserAchievement, Achievement, InkTransaction

    # La Senda: avance por unidad
    progress = UserLevelProgress.objects.filter(user=child)
    by_level = {p.level_id: p for p in progress}
    units = []
    for unit in LearningUnit.objects.prefetch_related('levels').order_by('order', 'unit_number'):
        levels = [level for level in unit.levels.all()]
        if not levels:
            continue
        done = [by_level[l.pk] for l in levels if l.pk in by_level and by_level[l.pk].is_completed]
        units.append({
            'number': unit.unit_number,
            'title': unit.title,
            'icon': unit.icon,
            'levels_total': len(levels),
            'levels_completed': len(done),
            'stars': sum(p.stars for p in done),
            'stars_total': len(levels) * 3,
        })
    attempts = [{
        'level_title': attempt.level.title,
        'unit_number': attempt.level.unit.unit_number,
        'unit_title': attempt.level.unit.title,
        'score': attempt.score,
        'passed': attempt.passed,
        'xp_earned': attempt.xp_earned,
        'ink_earned': attempt.ink_earned,
        'duration_seconds': attempt.duration_seconds,
        'hearts_lost': attempt.hearts_lost,
        'at': attempt.created_at,
    } for attempt in UserExerciseAttempt.objects.filter(user=child)
        .select_related('level__unit').order_by('-created_at')[:15]]

    # El Enigma: resueltos, perdidos y abandonados
    since = timezone.now() - timedelta(days=HISTORY_DAYS)
    enigma_txs = InkTransaction.objects.filter(user=child, concept__in=['daily_enigma', 'daily_enigma_abandoned'])
    enigma_totals = {'solved': 0, 'lost': 0, 'abandoned': 0}
    enigma_recent = []
    for tx in enigma_txs.order_by('-created_at'):
        result = _enigma_result(tx)
        enigma_totals[result] += 1
        if tx.created_at >= since:
            enigma_recent.append({'date': _local_date(tx.created_at).isoformat(), 'result': result,
                                  'label': ENIGMA_LABELS[result], 'ink': tx.amount})

    # Interrogatorio: el personaje se oculta mientras la partida sigue
    sessions = BlindInterrogationSession.objects.filter(user=child).select_related('avatar__edition__book')
    interrogation_totals = {key: 0 for key in INTERROGATION_LABELS}
    for row in sessions.values('status').annotate(n=Count('id')):
        interrogation_totals[row['status']] = row['n']
    interrogation_recent = []
    for session in sessions.order_by('-created_at')[:30]:
        finished = session.status != 'playing'
        interrogation_recent.append({
            'id': str(session.pk),
            'date': session.game_date,
            'at': session.created_at,
            'status': session.status,
            'label': INTERROGATION_LABELS.get(session.status, session.status),
            'character': session.avatar.name if finished else None,
            'book_title': session.avatar.edition.book.title if finished else None,
            'questions_used': session.questions_used,
            'questions_allowed': session.questions_allowed + session.extra_questions_bought,
            'clues_bought': session.clues_bought,
            'ink_earned': session.ink_earned,
            'xp_earned': session.xp_earned,
        })

    # Logros: desbloqueados y los más cercanos
    mine = UserAchievement.objects.filter(user=child).select_related('achievement')
    unlocked = [{
        'title': ua.achievement.title,
        'description': ua.achievement.description,
        'icon': ua.achievement.icon,
        'rarity': ua.achievement.rarity,
        'category': ua.achievement.category,
        'unlocked_at': ua.unlocked_at,
    } for ua in mine.filter(unlocked_at__isnull=False).order_by('-unlocked_at')]
    pending = [ua for ua in mine.filter(unlocked_at__isnull=True, current_progress__gt=0)]
    pending.sort(key=lambda ua: ua.progress_percentage, reverse=True)
    next_up = [{
        'title': ua.achievement.title,
        'icon': ua.achievement.icon,
        'current_progress': ua.current_progress,
        'threshold': ua.achievement.threshold,
        'percentage': ua.progress_percentage,
    } for ua in pending[:5]]

    streak = get_streak_details(child)
    return {
        'senda': {**learning_stats(child), 'units': units, 'recent_attempts': attempts},
        'enigma': {'totals': enigma_totals, 'recent': enigma_recent},
        'interrogation': {'totals': interrogation_totals, 'recent': interrogation_recent},
        'achievements': {'unlocked': unlocked, 'next': next_up, 'total': Achievement.objects.count()},
        'streak': {key: streak[key] for key in ('streak_current', 'streak_max', 'streak_shields', 'is_secured_today')},
    }


# ── Lo que escribe ────────────────────────────────────────────────────

# Nodos de TipTap que terminan una línea al pasarlos a texto.
_BLOCK_NODES = {'paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'codeBlock', 'hardBreak',
                'horizontalRule'}


def notebook_text(content, limit=20_000) -> str:
    """Texto plano del documento del cuaderno (JSON de TipTap)."""
    parts = []

    def walk(node, depth=0):
        if depth > 40 or not isinstance(node, dict):
            return
        if node.get('type') == 'text':
            parts.append(str(node.get('text', '')))
        for child in node.get('content') or []:
            walk(child, depth + 1)
        if node.get('type') in _BLOCK_NODES:
            parts.append('\n')

    walk(content if isinstance(content, dict) else {})
    lines = [' '.join(line.split()) for line in ''.join(parts).split('\n')]
    text = '\n'.join(line for line in lines if line).strip()
    return text if len(text) <= limit else text[:limit - 1].rstrip() + '…'


def _chapter_label(chapter):
    return chapter.title or f'Capítulo {chapter.order}'


def writing(child):
    from library.models import NotebookTab, UserHighlight, UserPostIt, UserVocabulary

    highlights = [{
        'book_title': h.inventory.edition.book.title,
        'chapter': _chapter_label(h.chapter),
        'text': h.text,
        'color': h.color,
        'at': h.created_at,
    } for h in UserHighlight.objects.filter(inventory__user=child)
        .select_related('inventory__edition__book', 'chapter').order_by('-created_at')[:200]]
    post_its = [{
        'book_title': p.inventory.edition.book.title,
        'chapter': _chapter_label(p.chapter),
        'text': p.text,
        'at': p.created_at,
    } for p in UserPostIt.objects.filter(inventory__user=child)
        .select_related('inventory__edition__book', 'chapter').order_by('-created_at')[:200]]
    notebook = [{
        'title': tab.title,
        'book_title': tab.inventory.edition.book.title if tab.inventory_id else None,
        'text': notebook_text(tab.content),
        'has_drawing': bool(tab.drawing),
        'updated_at': tab.updated_at,
    } for tab in NotebookTab.objects.filter(user=child)
        .select_related('inventory__edition__book').order_by('-updated_at')[:50]]
    vocabulary = [{
        'word': v.word,
        'definition': v.definition,
        'context': v.context_sentence,
        'book_title': v.book.title if v.book_id else None,
        'is_learned': v.is_learned,
        'at': v.created_at,
    } for v in UserVocabulary.objects.filter(user=child).select_related('book').order_by('-created_at')[:300]]
    return {'highlights': highlights, 'post_its': post_its, 'notebook': notebook, 'vocabulary': vocabulary}


# ── Chats ─────────────────────────────────────────────────────────────

def chats(child):
    from ai_engine.models import BlindInterrogationSession, ChatMessage, ChatSession

    sessions = (ChatSession.objects.filter(user=child)
                .select_related('avatar__edition__book')
                .annotate(message_count=Count('messages', filter=Q(messages__is_active=True)
                                              & ~Q(messages__role=ChatMessage.RoleChoices.SYSTEM)),
                          questions=Count('messages', filter=Q(messages__role='user', messages__is_active=True)),
                          last_message_at=Max('messages__created_at'))
                .order_by('-created_at'))
    characters = [{
        'id': str(session.pk),
        'character': session.avatar.name,
        'book_title': session.avatar.edition.book.title,
        'title': session.title,
        'message_count': session.message_count,
        'questions': session.questions,
        'started_at': session.created_at,
        'last_message_at': session.last_message_at or session.created_at,
    } for session in sessions[:100]]
    characters.sort(key=lambda c: c['last_message_at'], reverse=True)

    interrogations = []
    for session in (BlindInterrogationSession.objects.filter(user=child)
                    .select_related('avatar').order_by('-created_at')[:20]):
        dialogue = [{'role': entry.get('role'), 'content': str(entry.get('content', ''))}
                    for entry in session.dialogue_history or []
                    if isinstance(entry, dict) and entry.get('role') in ('user', 'character', 'clue')]
        if not dialogue:
            continue
        interrogations.append({
            'id': str(session.pk),
            'at': session.created_at,
            'status': session.status,
            'label': INTERROGATION_LABELS.get(session.status, session.status),
            'character': session.avatar.name if session.status != 'playing' else None,
            'dialogue': dialogue,
        })
    return {'characters': characters, 'interrogations': interrogations}


def chat_detail(child, session_id):
    from ai_engine.models import ChatMessage, ChatSession

    session = (ChatSession.objects.filter(user=child, pk=session_id)
               .select_related('avatar__edition__book').first())
    if session is None:
        raise Http404('Esa conversación no existe.')
    messages = [{'role': m.role, 'content': m.content, 'at': m.created_at}
                for m in ChatMessage.objects.filter(session=session)
                .exclude(role=ChatMessage.RoleChoices.SYSTEM).order_by('created_at')]
    return {
        'id': str(session.pk),
        'character': session.avatar.name,
        'book_title': session.avatar.edition.book.title,
        'title': session.title,
        'messages': messages,
    }


# ── Actividad reciente ────────────────────────────────────────────────

def activity(child, days=HISTORY_DAYS):
    """Línea de tiempo de los últimos `days` días (hasta MAX_EVENTS eventos) y un resumen por día."""
    from ai_engine.models import BlindInterrogationSession, ChatSession
    from catalog.models import Book
    from community.models import Friendship
    from learning.models import DailyActivityLog, PathChestClaim, UserExerciseAttempt
    from library.models import (InkTransaction, ReadingSession, UserAchievement, UserHighlight, UserPostIt,
                                UserVocabulary)

    now = timezone.now()
    today = timezone.localdate()
    since = now - timedelta(days=days)
    events = []

    def add(kind, at, title, detail='', icon='history'):
        events.append({'kind': kind, 'at': at, 'title': title, 'detail': detail, 'icon': icon})

    daily_minutes = defaultdict(float)
    for session in (ReadingSession.objects.filter(user=child, started_at__gte=since)
                    .select_related('book').order_by('-started_at')[:MAX_EVENTS]):
        minutes = session_minutes(session.started_at, session.ended_at, now)
        daily_minutes[_local_date(session.started_at)] += minutes
        in_progress = session.ended_at is None and now - session.started_at <= OPEN_SESSION_WINDOW
        detail = 'Leyendo ahora' if in_progress else (f'{round(minutes)} min' if minutes >= 1 else 'Menos de un minuto')
        add('reading', session.started_at, f'Leyó «{session.book.title}»', detail, 'menu_book')

    completed = list(InkTransaction.objects.filter(user=child, concept='book_completed', created_at__gte=since)
                     .order_by('-created_at')[:MAX_EVENTS])
    titles = dict(Book.all_objects.filter(pk__in=[tx.reference_id for tx in completed if tx.reference_id])
                  .values_list('pk', 'title')) if completed else {}
    titles = {str(pk): title for pk, title in titles.items()}
    for tx in completed:
        add('book_finished', tx.created_at, f'Terminó «{titles.get(tx.reference_id, "un libro")}»', '', 'task_alt')

    for attempt in (UserExerciseAttempt.objects.filter(user=child, created_at__gte=since)
                    .select_related('level__unit').order_by('-created_at')[:MAX_EVENTS]):
        result = f'Aprobado con {attempt.score} %' if attempt.passed else f'No aprobado ({attempt.score} %)'
        add('senda', attempt.created_at,
            f'La Senda · Unidad {attempt.level.unit.unit_number}: {attempt.level.title}', result, 'route')

    for claim in PathChestClaim.objects.filter(user=child, claimed_at__gte=since).order_by('-claimed_at')[:MAX_EVENTS]:
        add('chest', claim.claimed_at, 'Abrió un cofre de La Senda', f'+{claim.ink_earned} Tinta', 'redeem')

    for ua in (UserAchievement.objects.filter(user=child, unlocked_at__gte=since)
               .select_related('achievement').order_by('-unlocked_at')[:MAX_EVENTS]):
        add('achievement', ua.unlocked_at, f'Logro: {ua.achievement.title}', ua.achievement.description,
            'emoji_events')

    for tx in (InkTransaction.objects.filter(user=child, created_at__gte=since,
                                             concept__in=['daily_enigma', 'daily_enigma_abandoned'])
               .order_by('-created_at')[:MAX_EVENTS]):
        result = _enigma_result(tx)
        add('enigma', tx.created_at, f'El Enigma: {ENIGMA_LABELS[result].lower()}',
            f'+{tx.amount} Tinta' if tx.amount else '', 'extension')

    for session in (BlindInterrogationSession.objects.filter(user=child, created_at__gte=since)
                    .select_related('avatar').order_by('-created_at')[:MAX_EVENTS]):
        label = INTERROGATION_LABELS.get(session.status, session.status).lower()
        detail = f'Personaje: {session.avatar.name}' if session.status != 'playing' else ''
        add('interrogation', session.created_at, f'Interrogatorio: {label}', detail, 'psychology_alt')

    for h in (UserHighlight.objects.filter(inventory__user=child, created_at__gte=since)
              .select_related('inventory__edition__book').order_by('-created_at')[:MAX_EVENTS]):
        add('highlight', h.created_at, f'Subrayó en «{h.inventory.edition.book.title}»', _clip(h.text, 140),
            'format_ink_highlighter')

    for p in (UserPostIt.objects.filter(inventory__user=child, created_at__gte=since)
              .select_related('inventory__edition__book').order_by('-created_at')[:MAX_EVENTS]):
        add('post_it', p.created_at, f'Pegó un post-it en «{p.inventory.edition.book.title}»', _clip(p.text, 140),
            'sticky_note_2')

    for v in UserVocabulary.objects.filter(user=child, created_at__gte=since).order_by('-created_at')[:MAX_EVENTS]:
        add('vocabulary', v.created_at, f'Guardó la palabra «{v.word}»', _clip(v.definition, 140), 'translate')

    for session in (ChatSession.objects.filter(user=child, created_at__gte=since)
                    .select_related('avatar').order_by('-created_at')[:MAX_EVENTS]):
        add('chat', session.created_at, f'Conversó con {session.avatar.name}', session.title or '', 'forum')

    friendships = (Friendship.objects.filter(status=Friendship.Status.ACCEPTED, responded_at__gte=since)
                   .filter(Q(requester=child) | Q(addressee=child))
                   .select_related('requester', 'addressee').order_by('-responded_at')[:MAX_EVENTS])
    for friendship in friendships:
        other = friendship.addressee if friendship.requester_id == child.pk else friendship.requester
        add('friend', friendship.responded_at, f'Nuevo amigo en la Taberna: {other.username}', '', 'group')

    events.sort(key=lambda e: e['at'], reverse=True)

    logs = {log.date: log for log in DailyActivityLog.objects.filter(user=child, date__gt=today - timedelta(days=days))}
    calendar = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        log = logs.get(day)
        minutes = round(daily_minutes.get(day, 0))
        calendar.append({
            'date': day.isoformat(),
            'minutes': minutes,
            'levels_completed': log.levels_completed if log else 0,
            'xp_earned': log.xp_earned if log else 0,
            'active': bool(minutes or (log and (log.chapters_read or log.levels_completed or log.xp_earned))),
        })
    return {'events': events[:MAX_EVENTS], 'days': calendar}
