"""
catalog/reading_summary.py — Resumen acumulativo con IA desde el capítulo 1 hasta el capítulo N (sin spoilers).

Garantiza:
1. Resumen fiel de los acontecimientos de los capítulos 1 al N.
2. Regla estricta anti-spoilers: jamás revelar hechos posteriores al capítulo N.
3. Se genera en segundo plano una vez por (book, up_to_chapter) y se guarda en ChapterProgressSummary.
4. Proveedores con tiempos acotados y fallback extractivo seguro.
"""
import json
import logging
import re
import threading
from datetime import timedelta
from bs4 import BeautifulSoup
from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from .models import ChapterProgressSummary, Book, BookAuthor

logger = logging.getLogger(__name__)

GEMINI_TIMEOUT_MS = 20_000
STALE_AFTER = timedelta(minutes=2)
RETRY_FAILED_AFTER = timedelta(seconds=30)
SUMMARY_VERSION = 2  # La versión anterior seleccionaba por order y podía incluir un capítulo futuro.

SUMMARY_UP_TO_PROMPT = (
    "Eres el tutor literario de Literatus Novelist. El estudiante está leyendo la obra "
    '"{book_title}" de {author_name} y ha llegado al capítulo {up_to_chapter} de {total_chapters}. '
    'Ha pedido un "Resumen hasta donde voy" para recordar lo que ha ocurrido hasta ahora antes de continuar.\n\n'
    "TEXTO DE LOS CAPÍTULOS 1 AL {up_to_chapter}:\n"
    "{chapters_text}\n\n"
    "REGLA DE ORO ANTI-SPOILERS (ESTRICTAMENTE OBLIGATORIA):\n"
    "1. Resume ÚNICAMENTE los acontecimientos ocurridos entre el capítulo 1 y el capítulo {up_to_chapter}.\n"
    "2. Está TERMINANTEMENTE PROHIBIDO revelar, adelantar o insinuar cualquier hecho o desenlace que ocurra "
    "después del capítulo {up_to_chapter}.\n"
    "3. El resumen debe detenerse con absoluta precisión al final del capítulo {up_to_chapter}, describiendo "
    "el punto exacto donde quedan los personajes.\n\n"
    "FORMATO DE RESPUESTA REQUERIDO:\n"
    "Devuelve EXCLUSIVAMENTE un objeto JSON válido con los siguientes campos:\n"
    "{{\n"
    '  "title": "Resumen: Capítulos 1 al {up_to_chapter}",\n'
    '  "overview": "Síntesis clara de 2 o 3 oraciones que ubica al lector en el momento actual de la trama.",\n'
    '  "plot_recap": [\n'
    '    "Párrafo 1 relatando los inicios...",\n'
    '    "Párrafo 2 relatando el desarrollo...",\n'
    '    "Párrafo 3 relatando los sucesos más recientes hasta el capítulo {up_to_chapter}..."\n'
    "  ],\n"
    '  "key_events": [\n'
    '    "Acontecimiento clave 1",\n'
    '    "Acontecimiento clave 2",\n'
    '    "Acontecimiento clave 3"\n'
    "  ],\n"
    '  "characters_status": [\n'
    '    {{"name": "Nombre de personaje", "status": "Qué hace o cómo queda al final del capítulo {up_to_chapter}"}}\n'
    "  ],\n"
    '  "current_cliffhanger": "Cómo queda la situación al terminar el capítulo {up_to_chapter}, motivando a seguir la lectura."\n'
    "}}"
)


def _gemini_keys():
    return [key for key in (getattr(settings, 'GOOGLE_API_KEY', None), getattr(settings, 'GOOGLE_API_KEY_2', None)) if key]


def _call_gemini(prompt: str) -> str:
    from google import genai
    from google.genai import types

    keys = _gemini_keys()
    if not keys:
        raise ValueError("No Gemini keys configured")

    model = getattr(settings, 'AI_SUBSCRIPTION_MODEL', 'gemini-2.5-flash')
    last_err = None

    for key in keys:
        try:
            # No encadenar modelos ni reintentos del SDK: el lector debe recibir
            # el fallback si los proveedores no responden dentro de su plazo.
            with genai.Client(api_key=key, http_options=types.HttpOptions(
                    timeout=GEMINI_TIMEOUT_MS, retry_options=types.HttpRetryOptions(attempts=1))) as client:
                response = client.models.generate_content(
                    model=model,
                    contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
                    config=types.GenerateContentConfig(
                        temperature=0.3,
                        response_mime_type="application/json",
                        max_output_tokens=4096,
                        thinking_config=types.ThinkingConfig(thinking_budget=0),
                    )
                )
                if response and response.text:
                    return response.text
        except Exception as e:
            last_err = e
            logger.warning('Gemini %s falló al resumir la lectura: %s', model, e)

    if last_err:
        raise last_err
    raise RuntimeError("Failed to generate summary with Gemini")


def _call_deepseek(prompt: str) -> str:
    import requests
    deepseek_key = getattr(settings, 'DEEPSEEK_API_KEY', None)
    if not deepseek_key:
        raise ValueError("No DeepSeek key configured")

    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {deepseek_key}"
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "Eres un asistente literario que responde en formato JSON válido."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3
    }
    res = requests.post(url, headers=headers, json=payload, timeout=(5, 25))
    res.raise_for_status()
    return res.json()['choices'][0]['message']['content']


def _clean_chapter_text(html: str) -> str:
    if not html:
        return ""
    soup = BeautifulSoup(html, 'html.parser')
    for s in soup(['script', 'style']):
        s.decompose()
    text = soup.get_text(separator=' ', strip=True)
    return re.sub(r'\s+', ' ', text)


def _build_extractive_fallback(book: Book, up_to_chapter: int, chapters: list) -> dict:
    """Fallback estructurado sin spoilers cuando las APIs de IA no responden."""
    ch_names = []
    events = []
    for position, c in enumerate(chapters, start=1):
        c_title = c.title or f"Capítulo {position}"
        ch_names.append(c_title)
        c_text = _clean_chapter_text(c.content_html)
        first_sentence = c_text.split('.')[0].strip() if '.' in c_text else c_text[:120]
        if first_sentence:
            events.append(f"Capítulo {position} ({c_title}): {first_sentence}...")

    main_author = next(
        (ba.author.full_name for ba in book.book_authors.select_related('author')
         if ba.role == BookAuthor.RoleChoices.PRIMARY),
        "Autor"
    )

    return {
        "title": f"Resumen: Capítulos 1 al {up_to_chapter}",
        "overview": (
            f"Recapitulación de los primeros {up_to_chapter} capítulos de «{book.title}» de {main_author}. "
            f"Este resumen abarca exclusivamente lo acontecido hasta el capítulo {up_to_chapter} sin anticipar giros posteriores."
        ),
        "plot_recap": [
            f"La narración comienza introduciendo el mundo y los personajes principales en los primeros compases de la historia.",
            f"A lo largo de los capítulos 1 al {up_to_chapter}, se perfila el conflicto inicial y los protagonistas toman sus primeras decisiones clave.",
            f"Al concluir el capítulo {up_to_chapter}, la trama se sitúa en un punto decisivo para continuar la lectura."
        ],
        "key_events": events[:5] if events else [f"Lectura de los capítulos 1 al {up_to_chapter}"],
        "characters_status": [
            {"name": "Protagonistas", "status": f"En curso en el capítulo {up_to_chapter}."}
        ],
        "current_cliffhanger": (
            f"El capítulo {up_to_chapter} concluye dejando abierta la continuación directa de estos hechos. "
            f"Continúa leyendo para descubrir qué sucede en el siguiente capítulo."
        )
    }


def _payload(summary, book, total_chapters):
    data = {
        'status': summary.status,
        'up_to_chapter': summary.up_to_chapter,
        'total_chapters': total_chapters,
        'book_title': book.title,
    }
    if summary.status == ChapterProgressSummary.Status.READY:
        data['summary'] = {**summary.content, **_clean_content(summary.content)}
    elif summary.status == ChapterProgressSummary.Status.FAILED:
        data.update(status='unavailable', message=summary.error)
    return data


def _is_generating(summary):
    return (summary.deleted_at is None and summary.status == ChapterProgressSummary.Status.GENERATING
            and summary.updated_at > timezone.now() - STALE_AFTER)


def _is_ready(summary):
    if summary.deleted_at is not None or summary.status != ChapterProgressSummary.Status.READY:
        return False
    if not isinstance(summary.content, dict) or summary.content.get('reading_summary_version') != SUMMARY_VERSION:
        return False
    try:
        _clean_content(summary.content)
    except ValueError:
        return False
    return True


def _clean_content(data):
    """Guardar únicamente una estructura que el modal puede mostrar con seguridad."""
    if not isinstance(data, dict):
        raise ValueError('El resumen no es un objeto JSON.')

    def text(name):
        value = data.get(name, '')
        if not isinstance(value, str):
            raise ValueError(f'Campo de resumen inválido: {name}.')
        return value.strip()

    def texts(name):
        values = data.get(name, [])
        if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
            raise ValueError(f'Campo de resumen inválido: {name}.')
        return [value.strip() for value in values if value.strip()]

    characters = data.get('characters_status', [])
    if (not isinstance(characters, list) or any(
            not isinstance(character, dict) or not isinstance(character.get('name'), str)
            or not isinstance(character.get('status'), str) for character in characters)):
        raise ValueError('Estado de personajes inválido.')
    content = {
        'title': text('title'), 'overview': text('overview'), 'plot_recap': texts('plot_recap'),
        'key_events': texts('key_events'),
        'characters_status': [{'name': c['name'].strip(), 'status': c['status'].strip()}
                              for c in characters if c['name'].strip()],
        'current_cliffhanger': text('current_cliffhanger'),
    }
    if not content['overview'] or not content['plot_recap']:
        raise ValueError('El resumen llegó incompleto.')
    return content


def _parse_content(raw):
    clean = re.sub(r'^```(?:json)?\s*', '', raw.strip())
    clean = re.sub(r'\s*```$', '', clean)
    return _clean_content(json.loads(clean))


def _failed_recently(summary):
    return (summary.deleted_at is None and summary.status == ChapterProgressSummary.Status.FAILED
            and summary.updated_at > timezone.now() - RETRY_FAILED_AFTER)


def _claim(book, up_to_chapter):
    """Una sola petición reserva la generación compartida por libro y capítulo."""
    with transaction.atomic():
        summary = ChapterProgressSummary.all_objects.select_for_update().filter(
            book=book, up_to_chapter=up_to_chapter).first()
        if summary is None:
            try:
                with transaction.atomic():
                    return ChapterProgressSummary.all_objects.create(
                        book=book, up_to_chapter=up_to_chapter), True
            except IntegrityError:
                return ChapterProgressSummary.all_objects.get(
                    book=book, up_to_chapter=up_to_chapter), False
        if _is_ready(summary) or _is_generating(summary) or _failed_recently(summary):
            return summary, False
        summary.status = ChapterProgressSummary.Status.GENERATING
        summary.content = {}
        summary.error = ''
        summary.model_name = ''
        summary.deleted_at = None
        summary.is_active = True
        summary.save()
        return summary, True


def get_or_create_reading_summary(book: Book, up_to_chapter: int, user=None, run_async=True) -> dict:
    """
    Devuelve el estado y reserva la generación hasta el capítulo N (1-indexed).
    Las peticiones HTTP nunca esperan a la IA: el lector consulta hasta recibir ready.
    Garantiza que no haya spoilers de capítulos > N.
    """
    total_chapters = book.chapters.count()
    if total_chapters == 0:
        return {
            "status": "unavailable",
            "message": "Este libro no tiene capítulos registrados."
        }

    up_to_chapter = max(1, min(up_to_chapter, total_chapters))

    # 1. Reutilizar el resumen listo o una generación que aún está en curso.
    existing = ChapterProgressSummary.objects.filter(
        book=book,
        up_to_chapter=up_to_chapter,
    ).first()

    if existing and (_is_ready(existing) or _is_generating(existing) or _failed_recently(existing)):
        return _payload(existing, book, total_chapters)

    # 2. Obtener capítulos 1 al N
    # N es la posición que muestra el lector; Chapter.order puede comenzar en 0 o tener saltos.
    chapters = list(book.chapters.order_by('order')[:up_to_chapter])
    if not chapters:
        return {
            "status": "unavailable",
            "message": f"No se encontró contenido hasta el capítulo {up_to_chapter}."
        }

    if not any(_clean_chapter_text(c.content_html) for c in chapters):
        return {'status': 'unavailable', 'message': 'Estos capítulos todavía no tienen texto para resumir.'}

    summary, claimed = _claim(book, up_to_chapter)
    if not claimed:
        return _payload(summary, book, total_chapters)
    if run_async:
        # El hilo no puede consultar una fila sin confirmar si la vista está en una transacción.
        transaction.on_commit(lambda: _start_background(summary.pk, summary.updated_at))
        return _payload(summary, book, total_chapters)
    generate_reading_summary(summary.pk, summary.updated_at)
    summary.refresh_from_db()
    return _payload(summary, book, total_chapters)


def _start_background(summary_id, claimed_at):
    threading.Thread(target=_generate_in_background, args=(summary_id, claimed_at), daemon=True,
                     name=f'reading-summary-{summary_id}').start()


def _generate_in_background(summary_id, claimed_at):
    try:
        generate_reading_summary(summary_id, claimed_at)
    except Exception:
        logger.exception('Falló el resumen acumulativo %s', summary_id)
        ChapterProgressSummary.objects.filter(pk=summary_id, updated_at=claimed_at).update(
            status=ChapterProgressSummary.Status.FAILED,
            error='No se pudo generar el resumen. Intenta de nuevo.', updated_at=timezone.now())
    finally:
        connection.close()


def generate_reading_summary(summary_id, claimed_at=None):
    """Genera solo los capítulos autorizados y deja el resultado disponible para las consultas."""
    summary = ChapterProgressSummary.objects.select_related('book').get(pk=summary_id)
    claimed_at = claimed_at or summary.updated_at
    if summary.status != ChapterProgressSummary.Status.GENERATING or summary.updated_at != claimed_at:
        return
    book = summary.book
    up_to_chapter = summary.up_to_chapter
    total_chapters = book.chapters.count()
    chapters = list(book.chapters.order_by('order')[:up_to_chapter])

    # 3. Preparar fragmentos de texto
    main_author = next(
        (ba.author.full_name for ba in book.book_authors.select_related('author')
         if ba.role == BookAuthor.RoleChoices.PRIMARY),
        "el autor"
    )

    chapters_fragments = []
    for position, c in enumerate(chapters, start=1):
        clean = _clean_chapter_text(c.content_html)
        # Limitar longitud por capítulo para no saturar si son muy extensos
        if len(clean) > 3500:
            clean = clean[:3500] + " [...]"
        chapters_fragments.append(f"### CAPÍTULO {position}: {c.title or f'Capítulo {position}'}\n{clean}")

    chapters_text = "\n\n".join(chapters_fragments)

    prompt = SUMMARY_UP_TO_PROMPT.format(
        book_title=book.title,
        author_name=main_author,
        up_to_chapter=up_to_chapter,
        total_chapters=total_chapters,
        chapters_text=chapters_text
    )

    # 4. Intentar generar con IA
    content_dict = None
    model_name = ""

    try:
        raw_json = _call_gemini(prompt)
        content_dict = _parse_content(raw_json)
        model_name = "gemini"
    except Exception as gemini_err:
        logger.warning(f"Error generando resumen con Gemini: {gemini_err}")
        try:
            raw_json = _call_deepseek(prompt)
            content_dict = _parse_content(raw_json)
            model_name = "deepseek"
        except Exception as deepseek_err:
            logger.warning(f"Error generando resumen con DeepSeek: {deepseek_err}")
            content_dict = _build_extractive_fallback(book, up_to_chapter, chapters)
            model_name = "extractive_fallback"

    # Enriquecer metadata
    content_dict['up_to_chapter'] = up_to_chapter
    content_dict['total_chapters'] = total_chapters
    content_dict['book_title'] = book.title
    content_dict['reading_summary_version'] = SUMMARY_VERSION

    # Una generación antigua no puede sobrescribir un reintento posterior.
    ChapterProgressSummary.objects.filter(
        pk=summary_id, status=ChapterProgressSummary.Status.GENERATING, updated_at=claimed_at).update(
            status=ChapterProgressSummary.Status.READY, content=content_dict,
            model_name=model_name, error='', updated_at=timezone.now())
