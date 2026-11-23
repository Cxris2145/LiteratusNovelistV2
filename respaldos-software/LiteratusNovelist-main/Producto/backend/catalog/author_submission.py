"""
catalog/author_submission.py — Convierte el manuscrito que envía un autor en capítulos para el lector.

El lector lee capítulos guardados en la base (Chapter.content_html), no archivos. Por eso el envío de
un autor tiene que salir de aquí con capítulos, venga como venga:

  - EPUB: un capítulo por documento del spine (lo mismo que `import_epubs --spine`).
  - PDF: el texto de cada página con pypdf; se rearman los párrafos, se quitan números de página y
    encabezados repetidos, y se corta en los «Capítulo N», «Parte II»… Sin títulos, en partes.
  - Formulario: los capítulos escritos a mano son texto plano; cada línea es un párrafo.

Todo sale como HTML limpio (sin scripts, estilos, imágenes ni atributos): lo escribió un usuario.
Si no queda texto, `ManuscriptError` trae un mensaje para el autor.
"""
from __future__ import annotations

import html as html_lib
import re
import statistics
from collections import Counter
from io import BytesIO

from bs4 import BeautifulSoup, Comment

from .rechapter import _KEYWORD_HEADING_RE

PART_WORDS = 4000          # sin títulos, el texto se corta en partes de más o menos este largo
MAX_CHAPTER_WORDS = 9000   # un capítulo más largo se parte: el lector pinta el capítulo entero
MIN_TEXT_CHARS = 50
MAX_PDF_PAGES = 3000

# Se borran con su contenido; las demás etiquetas desconocidas se quitan dejando el texto.
_DROP_TAGS = {
    'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input',
    'button', 'select', 'option', 'textarea', 'link', 'meta', 'base', 'head', 'title', 'svg', 'math',
    'img', 'picture', 'source', 'video', 'audio', 'track', 'canvas', 'noscript', 'template', 'map',
}
_KEEP_TAGS = {
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'i', 'strong', 'b', 'u', 's', 'small',
    'sup', 'sub', 'blockquote', 'q', 'cite', 'ul', 'ol', 'li', 'pre', 'code', 'span', 'div', 'section',
    'article', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'abbr',
}

_ROMAN_HEADING_RE = re.compile(r'^[IVXLCDM]{1,8}\.?$')
_PAGE_NUMBER_RE = re.compile(r'^\W*(?:p[áa]g(?:ina)?\.?|page)?\s*\d{1,4}(?:\s*(?:de|of|/)\s*\d{1,4})?\W*$',
                             re.IGNORECASE)
_TOC_LINE_RE = re.compile(r'(?:\.{2,}|…|\s{3,})\s*\d{1,4}\s*$')
_TOC_ENTRY_RE = re.compile(r'(?:(?:\.\s?){4,}|…+)\s*\d{1,4}$')  # «Capítulo 1 ........ 3» de un índice
_FRONT_LABELS = {'indice', 'índice', 'contenido', 'contenidos', 'tabla de contenidos', 'tabla de contenido'}
_SENTENCE_END = tuple('.!?…:;»”"\')')
_DIALOGUE_START = ('—', '–', '―', '-', '«', '“')


class ManuscriptError(ValueError):
    """El manuscrito no se pudo leer o no trae texto. El mensaje se le muestra al autor."""


# ── HTML ────────────────────────────────────────────────────────────────────

def sanitize_html(markup: str) -> str:
    """Deja solo etiquetas de texto, sin atributos: nada que se ejecute ni que cargue algo de afuera."""
    soup = BeautifulSoup(markup or '', 'html.parser')
    for comment in soup.find_all(string=lambda node: isinstance(node, Comment)):
        comment.extract()
    for tag in list(soup.find_all(True)):
        if tag.decomposed:
            continue
        name = (tag.name or '').lower()
        if name in _DROP_TAGS:
            tag.decompose()
        elif name not in _KEEP_TAGS:
            tag.unwrap()
        else:
            tag.attrs = {}
    return str(soup).strip()


def text_of(markup: str) -> str:
    return ' '.join(BeautifulSoup(markup or '', 'html.parser').get_text(' ').split())


def _chapter_html(title: str, paragraphs: list[str]) -> str:
    """Título en <h2> (el lector lo saca de ahí) y un <p> por párrafo, con el texto escapado."""
    head = f'<h2>{html_lib.escape(title)}</h2>\n' if title else ''
    return head + '\n'.join(f'<p>{html_lib.escape(p)}</p>' for p in paragraphs)


def _chapter(title: str, content_html: str) -> dict:
    return {'title': (title or '').strip()[:200], 'content_html': content_html}


def _finish(chapters: list[dict]) -> list[dict]:
    """Numera, pone título a los que no traen y exige que quede texto."""
    kept = [ch for ch in chapters if text_of(ch['content_html'])]
    if sum(len(text_of(ch['content_html'])) for ch in kept) < MIN_TEXT_CHARS:
        raise ManuscriptError('No encontramos texto suficiente en el manuscrito para armar los capítulos.')
    for order, chapter in enumerate(kept, start=1):
        chapter['order'] = order
        chapter['title'] = chapter['title'] or f'Capítulo {order}'
    return kept


def _split_paragraphs(title: str, paragraphs: list[str], limit: int = MAX_CHAPTER_WORDS) -> list[tuple[str, list[str]]]:
    """Parte un capítulo larguísimo en trozos de párrafos enteros: «Título», «Título (parte 2)»…"""
    parts, current, words = [], [], 0
    for paragraph in paragraphs:
        size = len(paragraph.split())
        if current and words + size > limit:
            parts.append(current)
            current, words = [], 0
        current.append(paragraph)
        words += size
    if current:
        parts.append(current)
    if len(parts) <= 1:
        return [(title, paragraphs)]
    return [(title if i == 0 else f'{title} (parte {i + 1})', part) for i, part in enumerate(parts)]


# ── Formulario ──────────────────────────────────────────────────────────────

def chapters_from_form(items) -> list[dict]:
    """Capítulos escritos en el formulario: [{title, content}] en texto plano, una línea por párrafo."""
    if not isinstance(items, list):
        raise ManuscriptError('Los capítulos llegaron con un formato inválido.')
    chapters = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        title = ' '.join(str(item.get('title') or '').split())[:200] or f'Capítulo {index}'
        text = str(item.get('content') or '')
        paragraphs = [' '.join(line.split()) for line in text.splitlines()]
        paragraphs = [p for p in paragraphs if p]
        if not paragraphs:
            continue
        for part_title, part in _split_paragraphs(title, paragraphs):
            chapters.append(_chapter(part_title, _chapter_html(part_title, part)))
    return _finish(chapters)


# ── EPUB ────────────────────────────────────────────────────────────────────

def chapters_from_epub(data: bytes) -> list[dict]:
    from .management.commands.import_epubs import _chapters_spine, _chapters_wholebook

    try:
        raw = _chapters_spine(BytesIO(data), 'autor') or _chapters_wholebook(BytesIO(data), 'autor')
    except Exception as exc:  # zip dañado, sin container.xml, OPF ilegible…
        raise ManuscriptError('El archivo EPUB está dañado o no es un EPUB válido.') from exc

    chapters = []
    for item in raw:
        content = sanitize_html(item.get('content', ''))
        if not text_of(content):
            continue
        title = item.get('title') or ''
        if len(text_of(content).split()) > MAX_CHAPTER_WORDS * 2:
            # Un documento enorme sin títulos adentro: se parte por párrafos para no trabar el lector.
            blocks = [text_of(str(b)) for b in BeautifulSoup(content, 'html.parser').find_all(['p', 'li', 'blockquote'])]
            blocks = [b for b in blocks if b]
            if blocks:
                for part_title, part in _split_paragraphs(title or 'Texto', blocks):
                    chapters.append(_chapter(part_title, _chapter_html(part_title, part)))
                continue
        chapters.append(_chapter(title, content))
    if not chapters:
        raise ManuscriptError('El EPUB no trae capítulos con texto.')
    return _finish(chapters)


# ── PDF ─────────────────────────────────────────────────────────────────────

def chapters_from_pdf(data: bytes, skip_lines=()) -> list[dict]:
    """`skip_lines`: título y autor de la obra; en la portada del PDF sobran (el lector ya los muestra)."""
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # el servidor todavía no tiene pypdf instalado
        raise ManuscriptError('El servidor aún no puede leer PDF. Sube el manuscrito en EPUB o pega los '
                              'capítulos en «Redactar Capítulos Manuales».') from exc
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(''):
            raise ManuscriptError('El PDF está protegido con contraseña. Quítale la protección y vuelve a enviarlo.')
        if len(reader.pages) > MAX_PDF_PAGES:
            raise ManuscriptError(f'El PDF tiene más de {MAX_PDF_PAGES} páginas.')
        pages = [_page_text(page) for page in reader.pages]
    except ManuscriptError:
        raise
    except Exception as exc:
        raise ManuscriptError('El PDF está dañado o no se puede leer.') from exc

    blocks = pdf_blocks(pages)
    if not any(kind == 'p' for kind, _ in blocks):
        raise ManuscriptError('El PDF no trae texto seleccionable (parece escaneado como imagen). '
                              'Súbelo en EPUB o pega los capítulos en el formulario.')
    return chapters_from_blocks(blocks, skip_lines)


def _page_text(page) -> str:
    """Texto de la página con su disposición (la sangría de primera línea marca los párrafos)."""
    try:
        return page.extract_text(extraction_mode='layout') or ''
    except Exception:  # algunos PDF raros no admiten el modo layout
        return page.extract_text() or ''


def _fold(text: str) -> str:
    return ' '.join(re.sub(r'[^\w\s]', ' ', text.casefold()).split())


def _edge_key(line: str) -> str:
    # Se compara el comienzo: los programas acortan con «…» los pies largos de forma distinta en cada página.
    return re.sub(r'\d+', '#', line.lower()).strip()[:32]


def _is_heading(line: str) -> bool:
    if len(line) > 90 or not line[:1].isupper() or _TOC_LINE_RE.search(line):
        return False
    return bool(_KEYWORD_HEADING_RE.match(line) or _ROMAN_HEADING_RE.match(line))


def pdf_blocks(pages: list[str]) -> list[tuple[str, str]]:
    """
    Texto de las páginas → [('h', título) | ('p', párrafo)].

    pypdf entrega las líneas tal como se ven en la página. Un párrafo empieza en una línea con sangría o
    tras una línea en blanco, y termina en una línea claramente más corta que el ancho normal del texto; las
    palabras cortadas con guion al final de la línea se vuelven a unir. Se quitan los números de página, las
    entradas del índice y los encabezados o pies que se repiten.
    """
    raw_lines = [(text or '').splitlines() for text in pages]
    page_lines = [[' '.join(line.split()) for line in page] for page in raw_lines]
    indents = {}  # (página, línea) → espacios a la izquierda (solo el modo layout los conserva)
    for page_index, page in enumerate(raw_lines):
        for line_index, line in enumerate(page):
            if line.strip():
                indents[page_index, line_index] = len(line) - len(line.lstrip(' '))

    # Encabezados y pies: la misma línea (con otro número) en el borde de muchas páginas.
    edges = Counter()
    for lines in page_lines:
        content = [line for line in lines if line]
        for line in set(content[:2] + content[-2:]):
            edges[_edge_key(line)] += 1
    threshold = max(3, int(len(pages) * 0.4))
    repeated = {key for key, count in edges.items() if count >= threshold}

    lines: list[tuple[str, int] | None] = []
    for page_index, page in enumerate(page_lines):
        content = [line for line in page if line]
        edge_lines = set(content[:2] + content[-2:])
        kept = []
        for line_index, line in enumerate(page):
            if line and (_PAGE_NUMBER_RE.match(line) or _TOC_ENTRY_RE.search(line)
                         or (line in edge_lines and _edge_key(line) in repeated)):
                continue
            kept.append((line, indents.get((page_index, line_index), 0)))
        # Los blancos del margen (junto al encabezado o al pie) no separan párrafos.
        while kept and not kept[0][0]:
            kept.pop(0)
        while kept and not kept[-1][0]:
            kept.pop()
        lines.extend(kept)
        lines.append(None)  # fin de página: corta el párrafo solo si la línea anterior ya lo cerraba

    body = [(line, indent) for line, indent in filter(None, lines) if len(line) >= 20]
    if not body:
        return [('p', item[0]) for item in lines if item and item[0]]
    lengths = sorted(len(line) for line, _ in body)
    full = lengths[int(len(lengths) * 0.8)]
    one_paragraph_per_line = statistics.median(lengths) > 150  # el PDF no corta las líneas
    # Margen izquierdo del texto: la sangría más pequeña que se repite (las primeras líneas van más adentro).
    indent_counts = Counter(indent for _, indent in body)
    margin = min((i for i, n in indent_counts.items() if n >= max(2, len(body) * 0.1)),
                 default=min(indent_counts))
    # A doble espacio, el modo layout deja una línea en blanco entre todas las líneas: ahí no separan.
    blank_count = sum(1 for item in lines if item and not item[0])
    blank_separates = blank_count < len(body) * 0.5

    blocks: list[tuple[str, str]] = []
    paragraph: list[str] = []
    previous_closed = True  # ¿la línea anterior cerraba un párrafo?
    previous_ended_sentence = True

    def flush():
        nonlocal paragraph
        if paragraph:
            text = paragraph[0]
            for piece in paragraph[1:]:
                if re.search(r'[^\W\d_]-$', text) and piece[:1].islower():
                    text = text[:-1] + piece
                else:
                    text = f'{text} {piece}'
            blocks.append(('p', text))
            paragraph = []

    for item in lines:
        if item is None:  # salto de página: el párrafo sigue en la página siguiente si no se cerró
            continue
        line, indent = item
        if not line:      # línea en blanco: fin de párrafo
            if blank_separates:
                flush()
                previous_closed = previous_ended_sentence = True
            continue
        # Un título empieza tras un párrafo cerrado, o es una línea corta tras un punto final (los capítulos
        # suelen empezar en página nueva y la última línea de la anterior puede ir a todo el ancho).
        if (previous_closed or (previous_ended_sentence and len(line) < full * 0.6)) and _is_heading(line):
            flush()
            blocks.append(('h', line))
            previous_closed = previous_ended_sentence = True
            continue
        indented = indent >= margin + 2
        if paragraph and previous_ended_sentence and (indented or line.startswith(_DIALOGUE_START)):
            flush()  # sangría de primera línea, o una nueva intervención de un diálogo
        paragraph.append(line)
        short = len(line) < full * 0.6
        previous_ended_sentence = line.endswith(_SENTENCE_END)
        previous_closed = one_paragraph_per_line or short or (previous_ended_sentence and len(line) < full * 0.9)
        if previous_closed:
            flush()
    flush()
    return blocks


def chapters_from_blocks(blocks: list[tuple[str, str]], skip_lines=()) -> list[dict]:
    """[('h', título) | ('p', párrafo)] → capítulos. Corta en cada título; sin títulos, en partes."""
    # En la portada (antes del primer título), el título, el autor y el rótulo «Índice» sobran.
    skip = {_fold(line) for line in skip_lines if line and _fold(line)} | _FRONT_LABELS
    front = next((i for i, (kind, _) in enumerate(blocks) if kind == 'h'), min(len(blocks), 8))
    blocks = [b for i, b in enumerate(blocks) if not (i < front and b[0] == 'p' and _fold(b[1]) in skip)]

    # Rachas de 3+ títulos sin texto entre ellos son un índice: fuera, salvo el último, que es el título
    # real del texto que sigue.
    cleaned, run = [], []
    for kind, text in blocks + [('end', '')]:
        if kind == 'h':
            run.append((kind, text))
            continue
        cleaned.extend(run if len(run) < 3 else run[-1:] if kind == 'p' else [])
        run = []
        if kind == 'p':
            cleaned.append((kind, text))

    sections: list[list] = []  # [título, [párrafos]]
    for kind, text in cleaned:
        if kind == 'h':
            if sections and not sections[-1][1]:
                sections[-1][0] = f'{sections[-1][0]} · {text}' if sections[-1][0] else text
            else:
                sections.append([text, []])
        else:
            if not sections:
                sections.append(['', []])
            sections[-1][1].append(text)
    sections = [s for s in sections if s[1]]

    titled = [s for s in sections if s[0]]
    if not titled:
        paragraphs = [p for s in sections for p in s[1]]
        parts = _split_paragraphs('', paragraphs, PART_WORDS)
        if len(parts) == 1:
            sections = [['Texto completo', paragraphs]]
        else:
            sections = [[f'Parte {i}', part] for i, (_, part) in enumerate(parts, start=1)]
    elif not sections[0][0]:
        # Lo que va antes del primer título (portada, dedicatoria) es su propio capítulo si es largo.
        intro = sections[0]
        if sum(len(p.split()) for p in intro[1]) < 40 and len(sections) > 1:
            sections[1][1] = intro[1] + sections[1][1]
            sections = sections[1:]
        else:
            intro[0] = 'Inicio'

    chapters = []
    for title, paragraphs in sections:
        for part_title, part in _split_paragraphs(title, paragraphs):
            chapters.append(_chapter(part_title, _chapter_html(part_title, part)))
    return _finish(chapters)
