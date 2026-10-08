"""
catalog/narration.py — Narración de capítulos con Azure, generada una sola vez y reutilizada.

Flujo:
1. El lector pide la narración de un capítulo.
2. Si el capítulo ya tiene un ChapterAudio listo, se devuelve al instante (no gasta cupo).
3. Si no, se reserva una fila de ChapterAudio como "en generación" (la restricción única
   chapter + voice_name impide que dos lectores generen el mismo capítulo a la vez) y un
   hilo en segundo plano sintetiza el capítulo por fragmentos, con el tiempo de cada palabra.
4. El MP3 se guarda en disco y en Supabase. Los tiempos quedan en `alignment_data` con el
   mismo índice de palabras que el lector (`word-N`), para resaltar exactamente lo que se lee.

No agrega tablas ni columnas: el estado de cada generación vive en `alignment_data['meta']`.
"""
import logging
import re
import threading
import unicodedata
from dataclasses import dataclass
from datetime import timedelta
from xml.sax.saxutils import escape

from bs4 import BeautifulSoup, NavigableString, Tag
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import IntegrityError, connection, transaction
from django.urls import reverse
from django.utils import timezone
from django.utils.text import slugify

from ai_engine import azure_tts
from core.storage import upload_to_supabase_if_configured

from .models import ChapterAudio

logger = logging.getLogger(__name__)

WORD_TIMES_FORMAT = 'word-times-v1'
READY, GENERATING, FAILED = 'ready', 'generating', 'failed'

MAX_CHUNK_CHARS = 6000             # ~6-7 min de audio; Azure acepta hasta 10 min por síntesis
BLOCK_PAUSE_MS = 500               # pausa al final de cada párrafo o título
LINE_BREAK_PAUSE_MS = 300          # pausa en cada <br> (versos, diálogos)
STALE_AFTER = timedelta(minutes=10)            # una generación sin avances se considera caída
RETRY_FAILED_AFTER = timedelta(minutes=5)      # espera antes de reintentar un capítulo que falló

# El lector separa palabras con el `\s` de JavaScript; este es el mismo conjunto de espacios.
_JS_WHITESPACE = '\t\n\x0b\x0c\r \xa0  -     　﻿'
_WORD_RE = re.compile(f'[^{_JS_WHITESPACE}]+')
_SENTENCE_END_RE = re.compile(r'[.!?…]["\'»”)\]]*$')
_BLOCK_TAGS = frozenset({'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li',
                         'ul', 'ol', 'section', 'article', 'figure'})
_SKIPPED_TAGS = frozenset({'script', 'style', 'template', 'head', 'title', 'noscript'})


@dataclass
class NarrationResult:
    status: str                    # 'ready' | 'generating' | 'unavailable'
    audio: ChapterAudio = None
    progress: float = 0.0
    reason: str = ''               # not_configured | empty | monthly_budget | daily_limit | quota | failed
    message: str = ''


# ---------------------------------------------------------------------------
# Texto del capítulo (mismas palabras e índices que reader.component.ts)
# ---------------------------------------------------------------------------

def chapter_words(content_html):
    """
    Devuelve (words, pauses): las palabras del capítulo en el orden e índices del lector,
    y la pausa en milisegundos que va después de cada una (fin de párrafo o <br>).

    Replica parseAndRenderChapter() de reader.component.ts: el lector no muestra (ni numera)
    el texto suelto de <body> ni el de un bloque que contiene otros bloques.
    """
    soup = BeautifulSoup(content_html or '', 'html.parser')
    root = soup.body or soup
    words, blocks, pauses = [], [], []
    reached = {}

    for node in root.descendants:
        if isinstance(node, Tag):
            if node.name == 'br' and pauses and not pauses[-1]:
                pauses[-1] = LINE_BREAK_PAUSE_MS
            continue
        # Solo nodos de texto: quedan fuera comentarios y el contenido de <script>/<style>.
        if type(node) is not NavigableString:
            continue
        parent = node.parent
        if parent is root or (_is_container(parent) and _is_reached(parent, root, reached)):
            continue
        if any(p.name in _SKIPPED_TAGS for p in node.parents if isinstance(p, Tag)):
            continue
        block = _nearest_block(node, root)
        for word in _WORD_RE.findall(str(node)):
            if blocks and blocks[-1] is not block:
                pauses[-1] = max(pauses[-1], BLOCK_PAUSE_MS)
            words.append(word)
            blocks.append(block)
            pauses.append(0)

    if pauses:
        pauses[-1] = 0
    return words, pauses


def _is_container(element):
    """Bloque con hijos directos que también son bloques (el lector lo recorre hijo por hijo)."""
    return element.name in _BLOCK_TAGS and any(
        isinstance(child, Tag) and child.name in _BLOCK_TAGS for child in element.children)


def _is_reached(element, root, memo):
    """True si el lector llega a `element` recorriendo nodo por nodo desde <body>."""
    key = id(element)
    if key not in memo:
        parent = element.parent
        memo[key] = parent is root or (
            parent is not None and _is_container(parent) and _is_reached(parent, root, memo))
    return memo[key]


def _nearest_block(node, root):
    for parent in node.parents:
        if parent is root:
            return root
        if parent.name in _BLOCK_TAGS:
            return parent
    return root


def split_chunks(words, pauses, max_chars=None):
    """Agrupa las palabras en fragmentos (inicio, fin) de hasta max_chars, cortando entre oraciones."""
    max_chars = max_chars or MAX_CHUNK_CHARS
    units, start = [], 0
    for i, word in enumerate(words):
        if pauses[i] or _SENTENCE_END_RE.search(word) or i == len(words) - 1:
            units.append((start, i + 1))
            start = i + 1

    chunks, current, size = [], None, 0
    for unit_start, unit_end in units:
        unit_size = sum(len(w) + 1 for w in words[unit_start:unit_end])
        if unit_size > max_chars:
            # Oración más larga que un fragmento: se corta por palabras.
            if current:
                chunks.append(current)
                current, size = None, 0
            piece_start, piece_size = unit_start, 0
            for i in range(unit_start, unit_end):
                if piece_size + len(words[i]) + 1 > max_chars and i > piece_start:
                    chunks.append((piece_start, i))
                    piece_start, piece_size = i, 0
                piece_size += len(words[i]) + 1
            chunks.append((piece_start, unit_end))
            continue
        if current and size + unit_size > max_chars:
            chunks.append(current)
            current, size = None, 0
        current = (current[0] if current else unit_start, unit_end)
        size += unit_size
    if current:
        chunks.append(current)
    return chunks


def chunk_body(words, pauses, start, end):
    """Texto SSML (escapado) de un fragmento, con pausas entre párrafos."""
    parts = []
    for i in range(start, end):
        parts.append(escape(words[i]))
        if pauses[i] and i < end - 1:
            parts.append(f'<break time="{pauses[i]}ms"/>')
    return ' '.join(parts)


def billed_chars(words, pauses):
    """Caracteres que Azure cobrará por narrar el capítulo completo (estimación)."""
    return sum(len(chunk_body(words, pauses, s, e)) for s, e in split_chunks(words, pauses))


# ---------------------------------------------------------------------------
# Tiempos por palabra
# ---------------------------------------------------------------------------

def _normalize(text):
    return ''.join(ch for ch in unicodedata.normalize('NFKC', text).lower() if ch.isalnum())


def map_word_timings(words, timings, offset=0.0, lookahead=4):
    """
    Asigna a cada palabra del lector su inicio y fin (segundos) a partir de los límites de
    palabra que devolvió Azure. Las palabras sin coincidencia (puntuación suelta, etc.) quedan
    en None y se completan después con `fill_gaps`.
    """
    norm_words = [_normalize(w) for w in words]
    norm_times = [(t_text, t) for t_text, t in ((_normalize(t.text), t) for t in timings) if t_text]
    starts, ends = [None] * len(words), [None] * len(words)

    i = j = 0
    while i < len(words) and j < len(norm_times):
        word = norm_words[i]
        if not word:
            i += 1
            continue
        text, timing = norm_times[j]
        if word.startswith(text):
            starts[i], ends[i] = offset + timing.start, offset + timing.end
            consumed, j = len(text), j + 1
            # Una palabra del lector puede corresponder a varias de Azure ("dijo—¡Hola!").
            while consumed < len(word) and j < len(norm_times) and word.startswith(norm_times[j][0], consumed):
                consumed += len(norm_times[j][0])
                ends[i] = offset + norm_times[j][1].end
                j += 1
            i += 1
            continue

        # Azure agrupa fechas y cifras en un solo límite ("1 de enero de 1864"): se reparte
        # su duración entre las palabras del lector que lo forman, según su largo.
        if text.startswith(word):
            group, consumed, k = [i], len(word), i + 1
            while consumed < len(text) and k < len(words):
                if norm_words[k] and not text.startswith(norm_words[k], consumed):
                    break
                group.append(k)
                consumed += len(norm_words[k])
                k += 1
            if consumed == len(text):
                weights = [max(len(norm_words[g]), 1) for g in group]
                cursor, span = offset + timing.start, timing.end - timing.start
                for g, weight in zip(group, weights):
                    share = span * weight / sum(weights)
                    starts[g], ends[g] = cursor, cursor + share
                    cursor += share
                i, j = k, j + 1
                continue

        # Desalineación: la palabra de Azure corresponde a una palabra posterior del lector...
        ahead = next((k for k in range(i + 1, min(len(words), i + 1 + lookahead))
                      if norm_words[k] and norm_words[k].startswith(text)), None)
        if ahead is not None:
            i = ahead
            continue
        # ...o Azure devolvió palabras extra antes de la que buscamos.
        skip = next((k for k in range(j + 1, min(len(norm_times), j + 1 + lookahead))
                     if word.startswith(norm_times[k][0])), None)
        if skip is not None:
            j = skip
            continue
        i, j = i + 1, j + 1
    return starts, ends


def fill_gaps(starts, ends):
    """Completa las palabras sin tiempo y garantiza que los inicios nunca retrocedan (en ms)."""
    starts_ms, ends_ms = [], []
    previous_end = 0.0
    for start, end in zip(starts, ends):
        if start is None:
            start = end = previous_end
        if starts_ms:
            start = max(start, starts_ms[-1] / 1000)
        end = max(end, start)
        starts_ms.append(round(start * 1000))
        ends_ms.append(round(end * 1000))
        previous_end = end
    return starts_ms, ends_ms


_MP3_BITRATES_V1 = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)
_MP3_BITRATES_V2 = (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160)
_MP3_SAMPLE_RATES = {3: (44100, 48000, 32000), 2: (22050, 24000, 16000), 0: (11025, 12000, 8000)}


def mp3_duration_seconds(data):
    """Duración real de reproducción de un MP3 (Layer III), contando sus cuadros."""
    i, total, size = 0, 0.0, len(data)
    if data[:3] == b'ID3' and size >= 10:
        i = 10 + ((data[6] & 0x7F) << 21 | (data[7] & 0x7F) << 14 | (data[8] & 0x7F) << 7 | (data[9] & 0x7F))
    while i + 4 <= size:
        b1, b2 = data[i + 1], data[i + 2]
        version, layer = (b1 >> 3) & 0x03, (b1 >> 1) & 0x03
        bitrate_idx, rate_idx, padding = (b2 >> 4) & 0x0F, (b2 >> 2) & 0x03, (b2 >> 1) & 0x01
        if (data[i] != 0xFF or (b1 & 0xE0) != 0xE0 or version == 1 or layer != 1
                or bitrate_idx in (0, 15) or rate_idx == 3):
            i += 1
            continue
        sample_rate = _MP3_SAMPLE_RATES[version][rate_idx]
        if version == 3:
            bitrate, samples = _MP3_BITRATES_V1[bitrate_idx] * 1000, 1152
            frame_len = 144 * bitrate // sample_rate + padding
        else:
            bitrate, samples = _MP3_BITRATES_V2[bitrate_idx] * 1000, 576
            frame_len = 72 * bitrate // sample_rate + padding
        total += samples / sample_rate
        i += frame_len
    return total


# ---------------------------------------------------------------------------
# Estado de las narraciones (vive en alignment_data['meta'])
# ---------------------------------------------------------------------------

def narrator_voice_name(voice=None):
    return f"Azure · {voice or settings.AZURE_TTS_NARRATOR_VOICE}"


def _meta(audio):
    return ((audio.alignment_data or {}).get('meta') or {}) if audio else {}


def is_azure(audio):
    return _meta(audio).get('engine') == 'azure'


def is_ready(audio):
    if audio is None or audio.deleted_at is not None or not audio.audio_file:
        return False
    meta = _meta(audio)
    if meta.get('status') in (GENERATING, FAILED):
        return False
    # Un MP3 que solo quedó en el disco de Render desaparece en cada reinicio.
    if meta.get('storage') == 'local' and not default_storage.exists(audio.audio_file.name):
        return False
    return True


def _is_generating(audio):
    return (_meta(audio).get('status') == GENERATING
            and audio.deleted_at is None
            and audio.updated_at > timezone.now() - STALE_AFTER)


def _failed_recently(audio):
    return (_meta(audio).get('status') == FAILED
            and audio.deleted_at is None
            and audio.updated_at > timezone.now() - RETRY_FAILED_AFTER)


def _this_month():
    return timezone.now().strftime('%Y-%m')


def _today():
    return timezone.localdate().isoformat()


def monthly_chars_used():
    """Caracteres de narración de capítulos gastados (o reservados) este mes."""
    values = (ChapterAudio.all_objects
              .filter(alignment_data__meta__engine='azure', alignment_data__meta__month=_this_month())
              .values_list('alignment_data__meta__chars', flat=True))
    return sum(int(v or 0) for v in values)


def _user_generations_today(user):
    return (ChapterAudio.all_objects
            .filter(alignment_data__meta__engine='azure',
                    alignment_data__meta__day=_today(),
                    alignment_data__meta__requested_by=str(user.pk))
            .count())


def _unavailable(reason, message):
    return NarrationResult('unavailable', reason=reason, message=message)


def _set_meta(audio, meta, **changes):
    meta.update(changes)
    data = dict(audio.alignment_data or {})
    data['meta'] = meta
    audio.alignment_data = data
    audio.save(update_fields=['alignment_data', 'updated_at'])


# ---------------------------------------------------------------------------
# API del servicio
# ---------------------------------------------------------------------------

def request_chapter_narration(chapter, user, run_async=True):
    """
    Devuelve la narración lista del capítulo o empieza a generarla.
    Un audio cargado a mano (no generado por Azure) siempre tiene prioridad.
    """
    for audio in chapter.audios.all():
        if not is_azure(audio) and audio.audio_file:
            return NarrationResult(READY, audio=audio, progress=1.0)

    voice = settings.AZURE_TTS_NARRATOR_VOICE
    voice_name = narrator_voice_name(voice)
    existing = ChapterAudio.all_objects.filter(chapter=chapter, voice_name=voice_name).first()
    if is_ready(existing):
        return NarrationResult(READY, audio=existing, progress=1.0)
    if existing and _is_generating(existing):
        return NarrationResult(GENERATING, audio=existing, progress=_meta(existing).get('progress', 0.0))
    if existing and _failed_recently(existing):
        meta = _meta(existing)
        return _unavailable(meta.get('reason', 'failed'), meta.get('message', ''))

    if not azure_tts.is_configured():
        return _unavailable('not_configured', 'La voz neural no está configurada en el servidor.')

    words, pauses = chapter_words(chapter.content_html)
    if not words:
        return _unavailable('empty', 'Este capítulo no tiene texto para narrar.')

    chars = billed_chars(words, pauses)
    if monthly_chars_used() + chars > settings.AZURE_TTS_MONTHLY_BOOK_CHARS:
        return _unavailable(
            'monthly_budget',
            'Se alcanzó el límite mensual de narración con voz neural. '
            'Los capítulos ya narrados siguen disponibles; para el resto usa la voz estándar.',
        )
    if (user is not None and not (user.is_staff or user.is_superuser)
            and _user_generations_today(user) >= settings.AZURE_TTS_USER_DAILY_CHAPTERS):
        return _unavailable(
            'daily_limit',
            'Alcanzaste el límite diario de capítulos nuevos con voz neural. '
            'Los capítulos ya narrados siguen disponibles.',
        )

    audio, claimed = _claim(chapter, voice_name, voice, chars, user)
    if not claimed:
        if is_ready(audio):
            return NarrationResult(READY, audio=audio, progress=1.0)
        return NarrationResult(GENERATING, audio=audio, progress=_meta(audio).get('progress', 0.0))

    if run_async:
        _start_background(audio.pk)
        return NarrationResult(GENERATING, audio=audio, progress=0.0)

    audio = generate_narration(audio.pk)
    if is_ready(audio):
        return NarrationResult(READY, audio=audio, progress=1.0)
    meta = _meta(audio)
    return _unavailable(meta.get('reason', 'failed'), meta.get('message', ''))


def _claim(chapter, voice_name, voice, chars, user):
    """Reserva la fila del capítulo para generarla. Retorna (audio, True si le toca generar)."""
    meta = {
        'engine': 'azure', 'voice': voice, 'status': GENERATING, 'progress': 0.0,
        'chars': chars, 'month': _this_month(), 'day': _today(),
        'requested_by': str(user.pk) if user is not None else None,
    }
    with transaction.atomic():
        audio = (ChapterAudio.all_objects.select_for_update()
                 .filter(chapter=chapter, voice_name=voice_name).first())
        if audio is None:
            try:
                with transaction.atomic():
                    audio = ChapterAudio.all_objects.create(
                        chapter=chapter, voice_name=voice_name, alignment_data={'meta': meta})
                return audio, True
            except IntegrityError:
                return ChapterAudio.all_objects.get(chapter=chapter, voice_name=voice_name), False

        if is_ready(audio) or _is_generating(audio):
            return audio, False

        # Fila caída, fallida, borrada o con el MP3 perdido: se reutiliza para regenerar.
        audio.deleted_at = None
        audio.is_active = True
        audio.alignment_data = {'meta': meta}
        audio.save(update_fields=['deleted_at', 'is_active', 'alignment_data', 'updated_at'])
        return audio, True


def _start_background(audio_id):
    """gunicorn corta las peticiones a los 30 s: la síntesis corre en un hilo aparte."""
    threading.Thread(target=_generate_in_background, args=(audio_id,), daemon=True,
                     name=f'narration-{audio_id}').start()


def _generate_in_background(audio_id):
    try:
        generate_narration(audio_id)
    except Exception:
        logger.exception('Falló la narración del ChapterAudio %s', audio_id)
    finally:
        connection.close()  # el hilo tiene su propia conexión a la base de datos


def generate_narration(audio_id):
    """Sintetiza el capítulo de una fila reservada y la deja lista (o marcada como fallida)."""
    audio = ChapterAudio.all_objects.select_related('chapter').get(pk=audio_id)
    meta = dict(_meta(audio))
    voice = meta.get('voice') or settings.AZURE_TTS_NARRATOR_VOICE

    words, pauses = chapter_words(audio.chapter.content_html)
    chunks = split_chunks(words, pauses)
    starts, ends = [None] * len(words), [None] * len(words)
    mp3, offset, billed = bytearray(), 0.0, 0

    try:
        with azure_tts.SynthesisSession() as session:
            for index, (start, end) in enumerate(chunks):
                body = chunk_body(words, pauses, start, end)
                chunk_mp3, timings = session.synthesize(azure_tts.build_ssml(body, voice))
                billed += len(body)
                starts[start:end], ends[start:end] = map_word_timings(words[start:end], timings, offset)
                mp3 += chunk_mp3
                offset += mp3_duration_seconds(chunk_mp3)
                _set_meta(audio, meta, progress=round((index + 1) / len(chunks), 3))
    except azure_tts.AzureTTSQuotaError as e:
        _set_meta(audio, meta, status=FAILED, reason='quota', message=str(e), chars=billed)
        return audio
    except Exception:
        _set_meta(audio, meta, status=FAILED, reason='failed', chars=billed,
                  message='No se pudo generar la narración. Intenta de nuevo en unos minutos.')
        raise

    starts_ms, ends_ms = fill_gaps(starts, ends)
    data = bytes(mp3)
    audio.audio_file.save(f'chapter_{audio.chapter_id}_{slugify(voice)}.mp3', ContentFile(data), save=False)
    uploaded = upload_to_supabase_if_configured(data, audio.audio_file.name, 'audio/mpeg', upsert=True)
    if not uploaded:
        logger.warning('La narración %s quedó solo en disco local: configura SUPABASE_KEY para conservarla.',
                       audio.pk)

    meta.update(status=READY, progress=1.0, chars=billed, storage='supabase' if uploaded else 'local',
                duration_ms=round(offset * 1000), generated_at=timezone.now().isoformat())
    audio.alignment_data = {
        'format': WORD_TIMES_FORMAT,
        'word_count': len(words),
        'word_starts_ms': starts_ms,
        'word_ends_ms': ends_ms,
        'meta': meta,
    }
    audio.save(update_fields=['audio_file', 'alignment_data', 'updated_at'])
    return audio


def audio_url(request, audio):
    """URL del MP3; las narraciones locales restringidas llevan un permiso firmado."""
    if _meta(audio).get('storage') == 'local':
        url = request.build_absolute_uri(reverse('narration-audio', args=[audio.pk]))
        if audio.chapter.book.min_age:
            from django.core import signing
            from urllib.parse import urlencode
            from .age import ensure_book_access
            ensure_book_access(request.user, audio.chapter.book)
            # <audio> no envía Authorization: permiso firmado, ligado a esta narración.
            token = signing.dumps({'audio': str(audio.pk), 'user': str(request.user.pk)},
                                  salt='catalog:narration-age-v1')
            url += '?' + urlencode({'access': token})
        return url
    return request.build_absolute_uri(audio.audio_file.url)


def narration_payload(request, result):
    """Cuerpo de respuesta del endpoint de narración."""
    if result.status == READY:
        data = result.audio.alignment_data or {}
        alignment = {key: value for key, value in data.items() if key != 'meta'} or None
        return {
            'status': READY,
            'audio_id': str(result.audio.pk),
            'voice_name': result.audio.voice_name,
            'audio_url': audio_url(request, result.audio),
            'alignment': alignment,
        }
    if result.status == GENERATING:
        return {'status': GENERATING, 'progress': result.progress}
    return {'status': 'unavailable', 'reason': result.reason, 'message': result.message}
