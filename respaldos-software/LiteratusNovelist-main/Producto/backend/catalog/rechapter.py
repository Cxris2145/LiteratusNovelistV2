"""
Vuelve a dividir en sus capítulos reales los libros que la importación dejó con capítulos gigantes.

Al importar algunos EPUB, varios capítulos del libro quedaron dentro de un solo `Chapter` (Huckleberry
Finn es uno de 656 KB con 49 títulos adentro) o el texto se cortó por tamaño, a mitad de frase (los
11 capítulos de «Los tres mosqueteros» traen 66 «Capítulo N» y empiezan en cualquier parte). El lector
pinta un capítulo entero de una vez, así que esos libros cargan lento y el índice no sirve.

Este módulo solo planifica (no toca la base): une el contenido del libro, lo corta en los títulos reales
y devuelve los capítulos nuevos con todo lo necesario para trasladar las posiciones guardadas (progreso,
marcadores, subrayados, post-its…), que el lector guarda como (capítulo, índice de palabra). La regla
para trasladarlas es el índice de palabra en todo el libro: el texto no cambia, solo dónde se corta, y
`verify` comprueba que la secuencia de palabras quede idéntica palabra por palabra.

Qué se corta:
  - en los capítulos gigantes (`min_chars` o más), cada título: <h1>–<h6>, o un párrafo corto que dice
    «Capítulo XXV», «Carta III», «Parte segunda»… Los títulos seguidos («VOLUMEN I» + «CARTA I») son un
    solo corte y el capítulo se titula «VOLUMEN I · CARTA I» (un subtítulo corto en cursiva o negrita justo
    debajo también entra en el título). Los <h2 id="calibre_pb_N"> que deja Calibre no son títulos;
  - el límite entre dos capítulos de la base se respeta, salvo que uno de los dos sea gigante y el
    siguiente empiece sin título: entonces era un corte por tamaño y se une con lo anterior.
Un trozo cortado con menos de `MIN_WORDS` palabras (un «VOLUMEN II» suelto) se pega al siguiente.
"""
from __future__ import annotations

import bisect
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, Comment, Declaration, Doctype, NavigableString, ProcessingInstruction, Tag

from .narration import BLOCK_PAUSE_MS, _WORD_RE, chapter_words

DEFAULT_MIN_CHARS = 80 * 1024
MIN_WORDS = 60                 # un trozo más corto que esto se pega al siguiente
MAX_HEADING_CHARS = 120
MAX_KEYWORD_HEADING_CHARS = 90

_HEADING_TAGS = frozenset({'h1', 'h2', 'h3', 'h4', 'h5', 'h6'})
_WRAPPERS = frozenset({'div', 'section', 'article', 'main'})
_SKIPPED_NODES = (Comment, Declaration, Doctype, ProcessingInstruction)
_NUMERAL = (r'(?:\d+|[ivxlcdm]+\.?|primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|sext[oa]|'
            r's[ée]ptim[oa]|octav[oa]|noven[oa]|d[ée]cim[oa]|und[ée]cim[oa]|duod[ée]cim[oa]|decim\w+|'
            r'vig[ée]sim\w+|[úu]nic[oa]|first|second|third|fourth|fifth|\w+th)')
_KEYWORD_HEADING_RE = re.compile(
    rf'^(?:cap[íi]tulo|chapter|parte|part|libro|book|carta|canto|acto|escena|jornada|tratado|'
    rf'secci[óo]n|volumen|tomo)\s+{_NUMERAL}(?=$|[\s.:,;—–-])', re.IGNORECASE)

DOCUMENT_HEAD = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"/></head><body>\n'
DOCUMENT_TAIL = '\n</body></html>'


@dataclass
class Item:
    """Un bloque de primer nivel del cuerpo de un capítulo de la base."""
    chapter: int            # índice (base 0) del capítulo de la base
    node: object            # Tag o NavigableString de BeautifulSoup
    heading: str | None     # texto del título, si el bloque es un título
    blank: bool             # sin texto ni imagen (p. ej. <p>&nbsp;</p>)
    approx_words: int


@dataclass
class NewChapter:
    title: str
    html: str
    words: list
    pauses: list
    items: list = field(default_factory=list)   # índices en BookPlan.items
    starts_old_chapter: int | None = None       # capítulo de la base que empieza aquí (si coincide)
    unchanged_from: int | None = None           # capítulo de la base que queda idéntico (si es el caso)


@dataclass
class BookPlan:
    old_titles: list
    old_sizes: list
    old_words: list               # palabras de cada capítulo de la base (como las numera el lector)
    items: list
    chapters: list                # NewChapter
    ok: bool = False
    reason: str = ''
    flags: list = field(default_factory=list)
    old_offsets: list = field(default_factory=list)
    new_offsets: list = field(default_factory=list)
    item_chapter: list = field(default_factory=list)   # capítulo nuevo de cada Item

    # ── tamaños ─────────────────────────────────────────────────────────────
    @property
    def old_max_chars(self) -> int:
        return max(self.old_sizes, default=0)

    @property
    def new_sizes(self) -> list:
        return [len(chapter.html) for chapter in self.chapters]

    @property
    def total_words(self) -> int:
        return self.old_offsets[-1] if self.old_offsets else 0

    # ── traslado de posiciones (índices base 0) ─────────────────────────────
    def map_word(self, old_chapter: int, word: int) -> tuple[int, int]:
        """(capítulo, palabra) de la base → (capítulo nuevo, palabra) en el mismo lugar del texto."""
        old_chapter = min(max(old_chapter, 0), len(self.old_words) - 1)
        count = len(self.old_words[old_chapter])
        if count == 0:
            return self.map_chapter_start(old_chapter), 0
        word = min(max(int(word), 0), count - 1)
        position = self.old_offsets[old_chapter] + word
        new_chapter = bisect.bisect_right(self.new_offsets, position) - 1
        new_chapter = min(max(new_chapter, 0), len(self.chapters) - 1)
        return new_chapter, position - self.new_offsets[new_chapter]

    def map_chapter_start(self, old_chapter: int) -> int:
        """Capítulo nuevo donde empieza el capítulo `old_chapter` de la base."""
        for index, item in enumerate(self.items):
            if item.chapter >= old_chapter:
                return self.item_chapter[index]
        return len(self.chapters) - 1

    def map_chapter_end(self, old_chapter: int) -> int:
        """Capítulo nuevo donde termina el capítulo `old_chapter` de la base."""
        for index in range(len(self.items) - 1, -1, -1):
            if self.items[index].chapter <= old_chapter:
                return self.item_chapter[index]
        return 0

    def old_boundary_kept(self, old_chapter_count: int) -> int | None:
        """
        Si el texto de los primeros `old_chapter_count` capítulos de la base termina justo donde termina un
        capítulo nuevo, cuántos capítulos nuevos ocupa (sirve para los resúmenes «hasta el capítulo N»).
        """
        if old_chapter_count >= len(self.old_offsets) - 1:
            return len(self.chapters)
        position = self.old_offsets[old_chapter_count]
        index = bisect.bisect_left(self.new_offsets, position)
        if index < len(self.new_offsets) and self.new_offsets[index] == position:
            return index
        return None

    def paragraph_of(self, new_chapter: int, word: int) -> int:
        """Índice del párrafo (bloque) de la palabra, contando como `chapter_paragraphs`."""
        pauses = self.chapters[new_chapter].pauses
        return sum(1 for pause in pauses[:max(0, word)] if pause >= BLOCK_PAUSE_MS)


# ── lectura del HTML ────────────────────────────────────────────────────────

def content_nodes(html: str) -> list:
    """Bloques de primer nivel del cuerpo (sin comentarios, declaraciones ni espacios sueltos)."""
    soup = BeautifulSoup(html or '', 'html.parser')
    root = soup.body or soup.find('html') or soup
    nodes = _meaningful(root.children)
    # Un solo envoltorio (<div class="calibre">…</div>) que contiene los bloques: se mira adentro.
    while len(nodes) == 1 and isinstance(nodes[0], Tag) and nodes[0].name in _WRAPPERS and any(
            isinstance(child, Tag) for child in nodes[0].children):
        nodes = _meaningful(nodes[0].children)
    return nodes


def _meaningful(children) -> list:
    out = []
    for node in children:
        if isinstance(node, _SKIPPED_NODES):
            continue
        if isinstance(node, NavigableString) and not node.strip():
            continue
        if isinstance(node, Tag) and node.name in ('head', 'title', 'script', 'style'):
            continue
        out.append(node)
    return out


def _text(node) -> str:
    raw = node.get_text(' ') if isinstance(node, Tag) else str(node)
    return ' '.join(raw.split())


def heading_text(node) -> str | None:
    """Texto del título si el bloque es el título de un capítulo, o None."""
    if not isinstance(node, Tag):
        return None
    if str(node.get('id', '')).startswith('calibre_pb_'):
        return None  # salto de página que dejó Calibre, con un trozo de texto cualquiera
    text = _text(node)
    if not text or len(text) > MAX_HEADING_CHARS or not any(ch.isalnum() for ch in text):
        return None
    if node.name in _HEADING_TAGS:
        return text
    if node.name in ('p', 'div', 'center') and len(text) <= MAX_KEYWORD_HEADING_CHARS \
            and _KEYWORD_HEADING_RE.match(text):
        return text
    return None


def subtitle_text(node) -> str | None:
    """Un subtítulo bajo el título del capítulo: párrafo corto, todo en cursiva o negrita."""
    if not isinstance(node, Tag) or node.name not in ('p', 'div'):
        return None
    text = _text(node)
    if not text or len(text) > 90 or len(text.split()) > 14:
        return None
    children = [child for child in node.children if not (isinstance(child, NavigableString) and not child.strip())]
    children = [child for child in children if not (isinstance(child, Tag) and child.name == 'a' and not _text(child))]
    if len(children) == 1 and isinstance(children[0], Tag) and children[0].name in ('i', 'em', 'b', 'strong'):
        return text
    return None


def _is_blank(node) -> bool:
    if isinstance(node, NavigableString):
        return not node.strip()
    return not any(ch.isalnum() for ch in node.get_text()) and node.find('img') is None and node.name != 'img'


def build_document(nodes) -> str:
    return DOCUMENT_HEAD + '\n'.join(str(node) for node in nodes) + DOCUMENT_TAIL


# ── planificación ───────────────────────────────────────────────────────────

def plan_book(chapters, min_chars: int = DEFAULT_MIN_CHARS) -> BookPlan:
    """
    `chapters`: los capítulos del libro en orden, con `title` y `content_html`.
    Devuelve el plan; `plan.ok` dice si conviene aplicarlo y `plan.reason` por qué no.
    """
    titles = [chapter.title or '' for chapter in chapters]
    htmls = [chapter.content_html or '' for chapter in chapters]
    plan = BookPlan(old_titles=titles, old_sizes=[len(html) for html in htmls], old_words=[], items=[], chapters=[])
    plan.old_words = [chapter_words(html)[0] for html in htmls]
    plan.old_offsets = _offsets(plan.old_words)
    giant = [size >= min_chars for size in plan.old_sizes]
    if not any(giant):
        plan.reason = 'sin capítulos gigantes'
        return plan

    for index, html in enumerate(htmls):
        for node in content_nodes(html):
            plan.items.append(Item(chapter=index, node=node, heading=heading_text(node), blank=_is_blank(node),
                                   approx_words=len(_WORD_RE.findall(_text(node)))))
    items = plan.items
    if not items:
        plan.reason = 'sin contenido'
        return plan

    # Cortes: título (inicio de una racha de títulos) dentro de un capítulo gigante, y límites de la base
    # que no eran un corte por tamaño.
    cuts = {0}
    kept_boundaries = set()
    previous_content = None  # último ítem con texto antes del actual
    first_item_of = {}
    for index, item in enumerate(items):
        first_item_of.setdefault(item.chapter, index)
    for chapter, first in first_item_of.items():
        if chapter == items[0].chapter:
            continue
        first_content = next((it for it in items[first:] if it.chapter == chapter and not it.blank), None)
        starts_with_heading = first_content is not None and first_content.heading is not None
        if starts_with_heading or not (giant[chapter - 1] or giant[chapter]):
            cuts.add(first)
            kept_boundaries.add(first)
    for index, item in enumerate(items):
        if item.blank:
            continue
        if item.heading and giant[item.chapter] and not (previous_content and previous_content.heading):
            cuts.add(index)
        previous_content = item

    ordered = sorted(cuts)
    segments = [list(range(start, end)) for start, end in zip(ordered, ordered[1:] + [len(items)])]
    segments = [segment for segment in segments if segment]

    # Un trozo cortado dentro de un capítulo gigante y casi vacío (un «VOLUMEN II» con una nota) se pega al
    # siguiente trozo cortado; si lo que sigue es otro capítulo de la base, al anterior.
    def made_by_cut(segment):
        return segment[0] not in kept_boundaries and segment[0] != 0

    groups, carry = [], []
    for position, segment in enumerate(segments):
        group = carry + [segment]
        carry = []
        following = segments[position + 1] if position + 1 < len(segments) else None
        tiny = made_by_cut(group[0]) and sum(items[i].approx_words for part in group for i in part) < MIN_WORDS
        if tiny and following is not None and made_by_cut(following):
            carry = group
        elif tiny and groups:
            groups[-1].extend(group)
        else:
            groups.append(group)
    if carry:
        groups.append(carry)

    last_item_of = {}
    for index, item in enumerate(items):
        last_item_of[item.chapter] = index
    for group in groups:
        segment = [index for part in group for index in part]
        first = items[segment[0]]
        starts_old = first.chapter if first_item_of.get(first.chapter) == segment[0] else None
        if starts_old is not None and segment[-1] == last_item_of[starts_old]                 and all(items[i].chapter == starts_old for i in segment):
            # El capítulo de la base queda entero: se conserva tal cual (HTML, título y fila).
            html, title = htmls[starts_old], titles[starts_old]
            unchanged = starts_old
        else:
            html = build_document([items[i].node for i in segment])
            title, unchanged = _title_for(items, group, titles, starts_old), None
        words, pauses = chapter_words(html)
        plan.chapters.append(NewChapter(title=title, html=html, words=words, pauses=pauses, items=segment,
                                        starts_old_chapter=starts_old, unchanged_from=unchanged))
    plan.item_chapter = [0] * len(items)
    for new_index, chapter in enumerate(plan.chapters):
        for item_index in chapter.items:
            plan.item_chapter[item_index] = new_index
    plan.new_offsets = _offsets([chapter.words for chapter in plan.chapters])

    plan.ok, plan.reason = _judge(plan, min_chars)
    return plan


def _heading_run(items, segment) -> list:
    """Los títulos seguidos con que empieza un trozo (y su subtítulo, si tiene)."""
    run = []
    for index in segment:
        item = items[index]
        if item.blank:
            continue
        if not item.heading:
            subtitle = subtitle_text(item.node) if run else None
            if subtitle:
                run.append(subtitle)
            break
        run.append(item.heading)
    return run


def _title_for(items, group, old_titles, starts_old) -> str:
    """Los títulos con que empiezan los trozos del capítulo; si no tiene, el del capítulo de la base."""
    run = [text for part in group for text in _heading_run(items, part)]
    if run:
        return ' · '.join(dict.fromkeys(run))[:255]
    if starts_old is not None and old_titles[starts_old]:
        return old_titles[starts_old][:255]
    return old_titles[items[group[0][0]].chapter][:255]


def _offsets(word_lists) -> list:
    offsets = [0]
    for words in word_lists:
        offsets.append(offsets[-1] + len(words))
    return offsets


def verify(plan: BookPlan) -> bool:
    """El texto del libro (las palabras, en orden) queda idéntico."""
    old = [word for words in plan.old_words for word in words]
    new = [word for chapter in plan.chapters for word in chapter.words]
    return old == new


def _judge(plan: BookPlan, min_chars: int) -> tuple[bool, str]:
    if not verify(plan):
        return False, 'las palabras no coinciden al reunir el texto (se deja como está)'
    old_max, new_max = plan.old_max_chars, max(plan.new_sizes, default=0)
    if len(plan.chapters) <= len(plan.old_sizes) or new_max > max(min_chars, old_max * 0.75):
        return False, f'sin títulos claros adentro (el mayor quedaría en {new_max // 1024} KB)'
    word_counts = sorted(len(chapter.words) for chapter in plan.chapters)
    median = word_counts[len(word_counts) // 2]
    if median < 300:
        plan.flags.append(f'capítulos muy cortos (mediana {median} palabras): ¿títulos de poemas o secciones?')
    if new_max > min_chars:
        plan.flags.append(f'sigue habiendo un capítulo de {new_max // 1024} KB')
    return True, ''
