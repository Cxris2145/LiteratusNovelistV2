"""
catalog/reading_summary.py — Resumen acumulativo con IA desde el capítulo 1 hasta el capítulo N (sin spoilers).

Garantiza:
1. Resumen fiel de los acontecimientos de los capítulos 1 al N.
2. Regla estricta anti-spoilers: jamás revelar hechos posteriores al capítulo N.
3. Se genera una vez por (book, up_to_chapter) y se guarda en ChapterProgressSummary.
4. Soporte multi-provider (Gemini 2.5/2.0 y DeepSeek) con fallback extractivo seguro.
"""
import json
import logging
import re
from bs4 import BeautifulSoup
from django.conf import settings
from django.utils import timezone
from .models import ChapterProgressSummary, Book

logger = logging.getLogger(__name__)

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

    models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]
    last_err = None

    for key in keys:
        client = genai.Client(api_key=key)
        for model in models_to_try:
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
                    config=types.GenerateContentConfig(
                        temperature=0.3,
                        response_mime_type="application/json"
                    )
                )
                if response and response.text:
                    return response.text
            except Exception as e:
                last_err = e
                logger.warning(f"Gemini {model} failed with key: {e}")
                continue

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
    res = requests.post(url, headers=headers, json=payload, timeout=30)
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
    for c in chapters:
        c_title = c.title or f"Capítulo {c.order}"
        ch_names.append(c_title)
        c_text = _clean_chapter_text(c.content_html)
        first_sentence = c_text.split('.')[0].strip() if '.' in c_text else c_text[:120]
        if first_sentence:
            events.append(f"Capítulo {c.order} ({c_title}): {first_sentence}...")

    main_author = next(
        (ba.author.full_name for ba in book.book_authors.all() if ba.role == 'author'),
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


def get_or_create_reading_summary(book: Book, up_to_chapter: int, user=None) -> dict:
    """
    Obtiene o genera el resumen hasta el capítulo N (1-indexed).
    Garantiza que no haya spoilers de capítulos > N.
    """
    total_chapters = book.chapters.count()
    if total_chapters == 0:
        return {
            "status": "unavailable",
            "message": "Este libro no tiene capítulos registrados."
        }

    up_to_chapter = max(1, min(up_to_chapter, total_chapters))

    # 1. Buscar si ya existe listo en la base de datos
    existing = ChapterProgressSummary.objects.filter(
        book=book,
        up_to_chapter=up_to_chapter,
        status=ChapterProgressSummary.Status.READY
    ).first()

    if existing and existing.content:
        return {
            "status": "ready",
            "up_to_chapter": up_to_chapter,
            "total_chapters": total_chapters,
            "book_title": book.title,
            "summary": existing.content
        }

    # 2. Obtener capítulos 1 al N
    chapters = list(book.chapters.filter(order__lte=up_to_chapter).order_by('order'))
    if not chapters:
        return {
            "status": "unavailable",
            "message": f"No se encontró contenido hasta el capítulo {up_to_chapter}."
        }

    # 3. Preparar fragmentos de texto
    main_author = next(
        (ba.author.full_name for ba in book.book_authors.all() if ba.role == 'author'),
        "el autor"
    )

    chapters_fragments = []
    for c in chapters:
        clean = _clean_chapter_text(c.content_html)
        # Limitar longitud por capítulo para no saturar si son muy extensos
        if len(clean) > 3500:
            clean = clean[:3500] + " [...]"
        chapters_fragments.append(f"### CAPÍTULO {c.order}: {c.title or f'Capítulo {c.order}'}\n{clean}")

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
        clean_json = re.sub(r'^```json\s*', '', raw_json.strip())
        clean_json = re.sub(r'\s*```$', '', clean_json)
        content_dict = json.loads(clean_json)
        model_name = "gemini"
    except Exception as gemini_err:
        logger.warning(f"Error generando resumen con Gemini: {gemini_err}")
        try:
            raw_json = _call_deepseek(prompt)
            clean_json = re.sub(r'^```json\s*', '', raw_json.strip())
            clean_json = re.sub(r'\s*```$', '', clean_json)
            content_dict = json.loads(clean_json)
            model_name = "deepseek"
        except Exception as deepseek_err:
            logger.warning(f"Error generando resumen con DeepSeek: {deepseek_err}")
            content_dict = _build_extractive_fallback(book, up_to_chapter, chapters)
            model_name = "extractive_fallback"

    if not content_dict or not isinstance(content_dict, dict):
        content_dict = _build_extractive_fallback(book, up_to_chapter, chapters)
        model_name = "extractive_fallback"

    # Enriquecer metadata
    content_dict['up_to_chapter'] = up_to_chapter
    content_dict['total_chapters'] = total_chapters
    content_dict['book_title'] = book.title

    # 5. Guardar en base de datos para no recalcular
    try:
        ChapterProgressSummary.objects.update_or_create(
            book=book,
            up_to_chapter=up_to_chapter,
            defaults={
                'status': ChapterProgressSummary.Status.READY,
                'content': content_dict,
                'model_name': model_name,
                'error': ''
            }
        )
    except Exception as db_err:
        logger.warning(f"Error guardando ChapterProgressSummary en DB: {db_err}")

    return {
        "status": "ready",
        "up_to_chapter": up_to_chapter,
        "total_chapters": total_chapters,
        "book_title": book.title,
        "summary": content_dict
    }
