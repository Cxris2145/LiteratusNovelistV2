"""
catalog/summary.py — Resumen del libro completo con IA, generado una sola vez y reutilizado.

Flujo (el mismo de la narración, ver catalog/narration.py):
1. Un lector pide el resumen desde la ficha del libro.
2. Si el libro ya tiene un BookSummary listo, se devuelve al instante.
3. Si no, se reserva la fila como "generando" (es OneToOne con el libro: un solo lector la genera)
   y un hilo en segundo plano manda el texto completo a Gemini; gunicorn corta las peticiones a los 30 s.
4. La ficha consulta el estado hasta que el resumen esté listo.

Es gratis para el lector porque cada libro se resume una sola vez. Para que nadie dispare cientos de
libros nuevos, cada cuenta puede pedir BOOK_SUMMARY_USER_DAILY resúmenes nuevos al día; ver los que
ya existen no tiene límite.
"""
import json
import logging
import re
import threading
from dataclasses import dataclass
from datetime import timedelta

from bs4 import BeautifulSoup
from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from .models import BookAuthor, BookSummary

logger = logging.getLogger(__name__)

READY, GENERATING, FAILED = BookSummary.Status.READY, BookSummary.Status.GENERATING, BookSummary.Status.FAILED
MISSING, UNAVAILABLE = 'missing', 'unavailable'

STALE_AFTER = timedelta(minutes=10)          # una generación sin terminar se considera caída
RETRY_FAILED_AFTER = timedelta(minutes=5)    # espera antes de reintentar un libro que falló
MAX_SINGLE_PASS_CHARS = 1_600_000            # ~400 mil tokens: casi cualquier novela va de una vez
PART_CHARS = 800_000                         # las obras más largas se resumen por partes
GEMINI_TIMEOUT_MS = 240_000

SUMMARY_PROMPT = (
    'Eres el editor literario de Literatus Novelist. Escribe en español neutro el resumen completo de la '
    'obra para lectores que aceptan spoilers: incluye el desenlace. Básate solo en el texto que recibes; '
    'no inventes hechos ni personajes. Devuelve JSON con: overview (2 o 3 oraciones que presenten la obra), '
    'plot (de 3 a 6 párrafos que cuenten el argumento en orden, de principio a fin), characters (de 3 a 8 '
    'personajes principales, cada uno con name y role: quién es y qué papel cumple, en una oración) y themes '
    '(de 3 a 5 temas, una frase corta cada uno). Extensión total: entre 450 y 750 palabras.'
)
PART_PROMPT = (
    'Eres el editor literario de Literatus Novelist. Recibes la parte {n} de {total} de una obra extensa. '
    'Resume en español, en 500 a 900 palabras, todo lo que ocurre en esta parte y en orden, conservando los '
    'nombres de personajes y lugares y los hechos importantes. No adelantes nada que no esté en el texto.'
)
SUMMARY_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'overview': {'type': 'STRING'},
        'plot': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'characters': {'type': 'ARRAY', 'items': {
            'type': 'OBJECT',
            'properties': {'name': {'type': 'STRING'}, 'role': {'type': 'STRING'}},
            'required': ['name', 'role'],
        }},
        'themes': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
    },
    'required': ['overview', 'plot', 'characters', 'themes'],
}


@dataclass
class SummaryResult:
    status: str                    # 'ready' | 'generating' | 'missing' | 'unavailable'
    summary: BookSummary = None
    reason: str = ''
    message: str = ''


def _gemini_keys():
    return [key for key in (settings.GOOGLE_API_KEY, settings.GOOGLE_API_KEY_2) if key]


def is_configured():
    return bool(_gemini_keys())


def _is_ready(summary):
    return summary is not None and summary.deleted_at is None and summary.status == READY and bool(summary.content)


def _is_generating(summary):
    return (summary.status == GENERATING and summary.deleted_at is None
            and summary.updated_at > timezone.now() - STALE_AFTER)


def _failed_recently(summary):
    return (summary.status == FAILED and summary.deleted_at is None
            and summary.updated_at > timezone.now() - RETRY_FAILED_AFTER)


def _unavailable(reason, message):
    return SummaryResult(UNAVAILABLE, reason=reason, message=message)


def _user_requests_today(user):
    start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    return BookSummary.all_objects.filter(requested_by=user, requested_at__gte=start).count()


def chapter_texts(book):
    """Texto plano de cada capítulo, en orden y con su título."""
    texts = []
    for title, html in book.chapters.order_by('order').values_list('title', 'content_html'):
        text = BeautifulSoup(html or '', 'html.parser').get_text('\n')
        text = re.sub(r'\n\s*\n+', '\n\n', text).strip()
        if text:
            texts.append(f'## {title}\n\n{text}' if title else text)
    return texts


def split_parts(texts, limit):
    """Agrupa capítulos en partes de hasta `limit` caracteres (corta un capítulo solo si no cabe entero)."""
    parts, current = [], ''
    for text in texts:
        while len(text) > limit:
            if current:
                parts.append(current)
                current = ''
            parts.append(text[:limit])
            text = text[limit:]
        if current and len(current) + len(text) + 2 > limit:
            parts.append(current)
            current = ''
        current = f'{current}\n\n{text}' if current else text
    if current:
        parts.append(current)
    return parts


def clean_content(raw):
    """Valida el JSON de Gemini y lo recorta a la forma que pinta la ficha del libro."""
    data = json.loads(raw)

    def strings(values, limit):
        return [str(v).strip() for v in (values or []) if str(v).strip()][:limit]

    content = {
        'overview': str(data.get('overview') or '').strip(),
        'plot': strings(data.get('plot'), 8),
        'characters': [
            {'name': str(c.get('name') or '').strip(), 'role': str(c.get('role') or '').strip()}
            for c in (data.get('characters') or []) if isinstance(c, dict) and str(c.get('name') or '').strip()
        ][:10],
        'themes': strings(data.get('themes'), 6),
    }
    if not content['overview'] or not content['plot']:
        raise ValueError('El resumen llegó incompleto.')
    return content


def _call_gemini(system_prompt, text, schema=None, max_output_tokens=2048):
    """Devuelve (texto, tokens de entrada, tokens de salida). Prueba las dos claves de Gemini."""
    from google import genai
    from google.genai import types

    config = {'system_instruction': system_prompt, 'temperature': 0.4, 'max_output_tokens': max_output_tokens,
              'thinking_config': types.ThinkingConfig(thinking_budget=0)}
    if schema:
        config.update(response_mime_type='application/json', response_schema=schema)
    last_error = None
    for key in _gemini_keys():
        try:
            client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS))
            response = client.models.generate_content(
                model=settings.AI_SUBSCRIPTION_MODEL, contents=text,
                config=types.GenerateContentConfig(**config))
            usage = response.usage_metadata
            return response.text or '', usage.prompt_token_count or 0, usage.candidates_token_count or 0
        except Exception as e:  # cuota, red o clave inválida: se intenta con la otra clave
            last_error = e
            logger.warning('Gemini falló al resumir: %s', e)
    raise RuntimeError('Gemini no respondió.') from last_error


# ---------------------------------------------------------------------------
# API del servicio
# ---------------------------------------------------------------------------

def current_summary(book):
    """Estado del resumen sin pedir uno nuevo."""
    summary = BookSummary.all_objects.filter(book=book).first()
    if summary is None or summary.deleted_at is not None:
        return SummaryResult(MISSING)
    if _is_ready(summary):
        return SummaryResult(READY, summary=summary)
    if _is_generating(summary):
        return SummaryResult(GENERATING, summary=summary)
    if _failed_recently(summary):
        return _unavailable('failed', summary.error)
    return SummaryResult(MISSING)


def request_book_summary(book, user, run_async=True):
    """Devuelve el resumen listo del libro o empieza a generarlo."""
    state = current_summary(book)
    if state.status != MISSING:
        return state

    if not is_configured():
        return _unavailable('not_configured', 'El resumen con IA no está configurado en el servidor.')
    if not book.chapters.exclude(content_html='').exists():
        return _unavailable('empty', 'Este libro aún no tiene texto para resumir.')
    if not (user.is_staff or user.is_superuser) and _user_requests_today(user) >= settings.BOOK_SUMMARY_USER_DAILY:
        return _unavailable('daily_limit', (
            f'Puedes pedir hasta {settings.BOOK_SUMMARY_USER_DAILY} resúmenes nuevos al día. '
            'Los libros que ya tienen resumen se pueden ver sin límite.'))

    summary, claimed = _claim(book, user)
    if not claimed:
        return current_summary(book)
    if run_async:
        _start_background(summary.pk)
        return SummaryResult(GENERATING, summary=summary)
    generate_summary(summary.pk)
    return current_summary(book)


def _claim(book, user):
    """Reserva la fila del libro para generarla. Retorna (summary, True si le toca generar)."""
    fields = {'status': GENERATING, 'content': {}, 'error': '', 'requested_by': user,
              'requested_at': timezone.now(), 'input_tokens': 0, 'output_tokens': 0}
    with transaction.atomic():
        summary = BookSummary.all_objects.select_for_update().filter(book=book).first()
        if summary is None:
            try:
                with transaction.atomic():
                    return BookSummary.all_objects.create(book=book, **fields), True
            except IntegrityError:
                return BookSummary.all_objects.get(book=book), False

        if _is_ready(summary) or _is_generating(summary):
            return summary, False

        # Fila caída, fallida o borrada: se reutiliza para generar de nuevo.
        for name, value in fields.items():
            setattr(summary, name, value)
        summary.deleted_at = None
        summary.is_active = True
        summary.save()
        return summary, True


def _start_background(summary_id):
    threading.Thread(target=_generate_in_background, args=(summary_id,), daemon=True,
                     name=f'book-summary-{summary_id}').start()


def _generate_in_background(summary_id):
    try:
        generate_summary(summary_id)
    finally:
        connection.close()  # el hilo tiene su propia conexión a la base de datos


def generate_summary(summary_id):
    """Resume la obra de una fila reservada y la deja lista (o marcada como fallida)."""
    summary = BookSummary.all_objects.select_related('book').get(pk=summary_id)
    book = summary.book
    authors = ', '.join(BookAuthor.objects.filter(book=book, role=BookAuthor.RoleChoices.PRIMARY)
                        .values_list('author__full_name', flat=True))
    header = f'Obra: «{book.title}»' + (f' de {authors}' if authors else '') + '.'
    tokens_in = tokens_out = 0

    try:
        texts = chapter_texts(book)
        full_text = '\n\n'.join(texts)
        if len(full_text) <= MAX_SINGLE_PASS_CHARS:
            source = f'Texto íntegro de la obra:\n\n{full_text}'
        else:
            parts = split_parts(texts, PART_CHARS)
            part_summaries = []
            for n, part in enumerate(parts, start=1):
                text, used_in, used_out = _call_gemini(PART_PROMPT.format(n=n, total=len(parts)),
                                                       f'{header}\n\n{part}')
                tokens_in, tokens_out = tokens_in + used_in, tokens_out + used_out
                part_summaries.append(f'### Parte {n} de {len(parts)}\n\n{text.strip()}')
            source = ('La obra es extensa: en lugar del texto íntegro recibes el resumen de cada parte, en orden.'
                      '\n\n' + '\n\n'.join(part_summaries))

        raw, used_in, used_out = _call_gemini(SUMMARY_PROMPT, f'{header}\n\n{source}',
                                              schema=SUMMARY_SCHEMA, max_output_tokens=4096)
        tokens_in, tokens_out = tokens_in + used_in, tokens_out + used_out
        content = clean_content(raw)
    except Exception:
        logger.exception('Falló el resumen del libro %s', book.pk)
        summary.status = FAILED
        summary.error = 'No se pudo generar el resumen. Intenta de nuevo en unos minutos.'
        summary.input_tokens, summary.output_tokens = tokens_in, tokens_out
        summary.save(update_fields=['status', 'error', 'input_tokens', 'output_tokens', 'updated_at'])
        return summary

    summary.status = READY
    summary.content = content
    summary.error = ''
    summary.model_name = settings.AI_SUBSCRIPTION_MODEL
    summary.input_tokens, summary.output_tokens = tokens_in, tokens_out
    summary.save(update_fields=['status', 'content', 'error', 'model_name', 'input_tokens',
                                'output_tokens', 'updated_at'])
    return summary


def summary_payload(result):
    data = {'status': result.status}
    if result.status == READY:
        data['summary'] = result.summary.content
        data['generated_at'] = result.summary.updated_at
    if result.status == UNAVAILABLE:
        data['reason'] = result.reason
        data['message'] = result.message
    return data
