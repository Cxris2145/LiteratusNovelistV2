"""Sinopsis extractivas y reproducibles a partir de los libros locales.

El generador no intenta completar la trama con conocimiento externo. Selecciona
un pasaje inicial coherente del contenido importado y, cuando ese contenido esta
incompleto, vuelve a leer el EPUB original de ``respaldos-software/books``.
"""

from __future__ import annotations

import math
import re
import unicodedata
import warnings
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from zipfile import ZipFile

from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
from ebooklib import ITEM_DOCUMENT, epub

from catalog.audit_engine import extract_plain_text

MIN_SOURCE_CHARS = 1400
MAX_SOURCE_CHARS = 32_000
TARGET_MIN_WORDS = 60
TARGET_MAX_WORDS = 120

_WORD_RE = re.compile(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ]+\b", re.UNICODE)
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡«\"“])")
_HEADING_RE = re.compile(
    r"^(cap[ií]tulo|canto|acto|escena|parte|libro|secci[oó]n|pr[oó]logo|ep[ií]logo|"
    r"[ivxlcdm]+|\d+)(?:\s+[ivxlcdm\d]+)?[\s.:\-]*$",
    re.IGNORECASE,
)
_SKIP_CHAPTER_RE = re.compile(
    r"^(t[ií]tulo|acerca|portada|cubierta|tomo\s+[ivxlcdm]+|pr[oó]logo|prefacio|"
    r"introducci[oó]n|[ií]ndice|tabla de contenidos|document outline|www\.)",
    re.IGNORECASE,
)
_BOILERPLATE_RE = re.compile(
    r"(https?://|www\.|gutenberg|elejandr[ií]a|dominio p[uú]blico|libro descargado|"
    r"todos los derechos|copyright|isbn|publicado\s*:|traducci[oó]n\s*:|origen\s*:|"
    r"categor[ií]a(?:\(s\))?\s*:|acerca(?: de)?\s+[^:]+:|fue un escritor|"
    r"escribi[oó] principalmente|"
    r"pa[ií]ses de habla hispana|no puede ser utilizado|fines comerciales|"
    r"produced by|project gutenberg|transcriber.?s note|tabla de contenidos|"
    r"esperamos que lo disfrut|librer[ií]a de|edici[oó]n original|p[aá]gina de t[ií]tulo|"
    r"fuente\s*:|document outline|titlepage|toc \.level|text-indent|nota de transcripci[oó]n|"
    r"[ií]ndice de figuras|fe de erratas|notas a pie de p[aá]gina|errores de imprenta|"
    r"ortograf[ií]a del original|variantes de los nombres)",
    re.IGNORECASE,
)
_EDITORIAL_META_RE = re.compile(
    r"\b(esta obra|esta novela|este libro|el autor|la autora|el lector|la lectora|"
    r"obra maestra|nos sumerge|imprescindible)\b",
    re.IGNORECASE,
)
_SPOILER_RE = re.compile(
    r"\b(al final|finalmente muere|muere al final|revela que es|resulta ser el|"
    r"el asesino es|el culpable es|desenlace|spoiler)\b",
    re.IGNORECASE,
)
_CONFLICT_RE = re.compile(
    r"\b(debe|decide|descubre|enfrenta|intenta|busca|teme|amenaza|obliga|huye|"
    r"lucha|viaje|secreto|familia|amor|misterio|peligro|desea|quiere|pierde)\b",
    re.IGNORECASE,
)
_FIRST_SECOND_PERSON_RE = re.compile(
    r"\b(yo|me|m[ií]|conmigo|nosotros|nosotras|te|t[uú]|contigo|vosotros|vosotras)\b",
    re.IGNORECASE,
)

_STOPWORDS = {
    "a", "al", "algo", "ante", "aquel", "aquella", "aquellas", "aquellos", "aqui",
    "aquí", "asi", "así", "aunque", "bajo", "bien", "cada", "como", "con", "contra",
    "cual", "cuando", "de", "del", "desde", "donde", "dos", "durante", "e", "el",
    "ella", "ellas", "ello", "ellos", "en", "entre", "era", "eran", "es", "esa",
    "esas", "ese", "eso", "esos", "esta", "estaba", "estaban", "este", "esto", "estos",
    "fue", "ha", "habia", "había", "han", "hasta", "hay", "la", "las", "le", "les",
    "lo", "los", "mas", "más", "me", "mi", "mientras", "muy", "ni", "no", "nos",
    "o", "otra", "otro", "para", "pero", "poco", "por", "porque", "que", "qué", "se",
    "ser", "si", "sí", "sin", "sobre", "son", "su", "sus", "tambien", "también", "tan",
    "todo", "tras", "tu", "un", "una", "uno", "unos", "y", "ya",
}
_SPANISH_WORDS = {
    "el", "la", "los", "las", "un", "una", "de", "del", "al", "a", "que", "y",
    "en", "con", "por", "para", "su", "sus", "se", "no", "es", "como", "pero",
    "cuando", "donde", "entre", "sobre", "sin", "desde", "había", "era", "fue",
}


@dataclass(frozen=True)
class LocalSynopsis:
    text: str
    source: str
    source_chars: int
    review_reasons: tuple[str, ...] = ()


def _words(text: str) -> list[str]:
    return _WORD_RE.findall(text or "")


def _fold(value: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(ch)
    )


def _meaningful_tokens(text: str) -> list[str]:
    return [
        folded for token in _words(text)
        if len(folded := _fold(token)) >= 3 and folded not in _STOPWORDS and not folded.isdigit()
    ]


def _looks_spanish(text: str) -> bool:
    tokens = [_fold(token) for token in _words(text)]
    if not tokens:
        return False
    hits = sum(token in _SPANISH_WORDS for token in tokens)
    return hits / len(tokens) >= 0.16


def _clean_source(text: str, *, title: str = "", authors: str = "") -> str:
    title_key = _fold(title)
    author_keys = {_fold(part) for part in re.split(r"[,;]", authors) if part.strip()}
    kept: list[str] = []
    for raw in re.split(r"[\r\n]+", text or ""):
        line = re.sub(r"\s+", " ", raw).strip(" \t\ufeff")
        if not line or _BOILERPLATE_RE.search(line) or _HEADING_RE.match(line):
            continue
        folded = _fold(line.strip(".:;,-"))
        if len(_words(line)) <= 8 and (folded == title_key or folded in author_keys):
            continue
        kept.append(line)
    return " ".join(kept)


def _sentence_candidates(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    pieces = _SENTENCE_RE.split(normalized)
    candidates: list[str] = []
    seen: set[str] = set()
    for piece in pieces:
        sentence = piece.strip(" \t\r\n«»\"“”")
        count = len(_words(sentence))
        key = _fold(re.sub(r"\W+", " ", sentence))
        if count < 8 or count > 52 or key in seen:
            continue
        if (_BOILERPLATE_RE.search(sentence) or _EDITORIAL_META_RE.search(sentence)
                or _SPOILER_RE.search(sentence) or _HEADING_RE.match(sentence)):
            continue
        letter_count = sum(ch.isalpha() for ch in sentence)
        if letter_count < max(20, len(sentence) * 0.55):
            continue
        uppercase_count = sum(ch.isupper() for ch in sentence if ch.isalpha())
        if count >= 15 and uppercase_count / max(1, letter_count) > 0.42:
            continue
        seen.add(key)
        candidates.append(sentence)
    return candidates


def _score_sentences(sentences: list[str]) -> list[float]:
    frequencies = Counter(token for sentence in sentences for token in _meaningful_tokens(sentence))
    if not frequencies:
        return [0.0] * len(sentences)
    ceiling = max(2, int(math.sqrt(max(frequencies.values())) + 2))
    scores: list[float] = []
    for index, sentence in enumerate(sentences):
        tokens = _meaningful_tokens(sentence)
        lexical = sum(min(frequencies[token], ceiling) for token in tokens)
        score = lexical / math.sqrt(max(1, len(tokens)))
        if _CONFLICT_RE.search(sentence):
            score += 1.8
        if _FIRST_SECOND_PERSON_RE.search(sentence):
            score -= 1.2
        if sentence.startswith(("—", "-", "¿", "¡")):
            score -= 2.0
        score -= max(0, sentence.count("-") - 1) * 0.8
        score -= sentence.count("?") * 0.7
        score += max(0.0, 1.5 - index * 0.025)
        scores.append(score)
    return scores


def _best_window(sentences: list[str], *, min_words: int, max_words: int) -> str:
    if not sentences:
        return ""
    scores = _score_sentences(sentences)
    best: tuple[float, int, int] | None = None
    for start in range(len(sentences)):
        total_words = 0
        score_total = 0.0
        for end in range(start, min(len(sentences), start + 7)):
            total_words += len(_words(sentences[end]))
            score_total += scores[end]
            if total_words > max_words:
                break
            if total_words < min_words:
                continue
            length_bonus = 3.0 - abs(total_words - 88) / 18
            # La apertura es la zona más segura para resumir sin anticipar el final.
            window_score = score_total / (end - start + 1) + length_bonus - start * 0.32
            candidate = (window_score, start, end)
            if best is None or candidate > best:
                best = candidate
    if best is None:
        return ""
    _, start, end = best
    return " ".join(sentences[start:end + 1]).strip()


def _metadata_fallback(*, title: str, authors: str, genres: str, chapter_titles: list[str]) -> str:
    author_text = authors or "autoría anónima"
    genre_text = genres or "literatura clásica"
    headings = [
        h.strip() for h in chapter_titles
        if h and not _HEADING_RE.match(h.strip()) and not _BOILERPLATE_RE.search(h)
        and not _SKIP_CHAPTER_RE.match(h.strip())
        and _fold(h.strip()) != _fold(title)
    ]
    heading_text = ", ".join(f"«{h}»" for h in headings[:3])
    detail = (
        f" Los apartados {heading_text} anticipan distintas perspectivas y situaciones."
        if heading_text else
        " Sus páginas desarrollan imágenes, voces y situaciones ligadas al núcleo sugerido por el título."
    )
    folded_genres = _fold(genre_text)
    folded_title = _fold(title)
    if "poesia" in folded_genres or "poema" in folded_genres or "soneto" in folded_title:
        return (
            f"En {title}, {author_text} reúne composiciones poéticas donde imágenes, emociones y "
            "ritmo construyen una voz propia."
            f"{detail} Los textos recorren distintos estados de ánimo y motivos simbólicos, enlazando "
            "la experiencia íntima con el mundo que la rodea. Cada pieza conserva su autonomía, "
            "mientras el conjunto propone una lectura abierta, atenta a los cambios de tono y perspectiva."
        )
    if (any(term in folded_genres for term in ("ensayo", "filosofia", "ciencia", "religion", "no ficcion"))
            or any(term in folded_title for term in ("tratado", "ensayo", "memorias", "recuerdos"))):
        return (
            f"En {title}, {author_text} desarrolla una reflexión vinculada con {genre_text.lower()}."
            f"{detail} Los temas se organizan de manera progresiva, combinando observación, experiencia "
            "y argumento para examinar sus ideas centrales. El recorrido conecta casos particulares "
            "con preguntas más amplias y permite seguir la evolución del pensamiento sin reducirlo "
            "a una única conclusión."
        )
    return (
        f"En {title}, {author_text} propone una historia de {genre_text.lower()} centrada en las "
        "tensiones humanas, el ambiente y las decisiones que impulsan el relato."
        f"{detail} La acción avanza mediante contrastes de carácter, emoción y contexto, manteniendo "
        "abierta la evolución del conflicto. La atención recae en la experiencia de sus figuras y "
        "en las preguntas que surgen de sus encuentros, sin adelantar la resolución."
    )


def build_local_synopsis(
    *, title: str, authors: str, genres: str, documents: list[str],
    chapter_titles: list[str] | None = None,
) -> tuple[str, tuple[str, ...]]:
    """Construye una sinopsis breve sin añadir hechos ajenos a ``documents``."""
    cleaned = [
        _clean_source(document, title=title, authors=authors)
        for document in documents if document
    ]
    source = " ".join(part for part in cleaned if part)[:MAX_SOURCE_CHARS]
    sentences = _sentence_candidates(source)
    text = _best_window(sentences, min_words=TARGET_MIN_WORDS, max_words=TARGET_MAX_WORDS)
    reasons: list[str] = []
    if text and not _looks_spanish(text):
        text = ""
        reasons.append("el texto local seleccionado no parece estar en español")
    if not text:
        text = _metadata_fallback(
            title=title,
            authors=authors,
            genres=genres,
            chapter_titles=chapter_titles or [],
        )
        reasons.append("contenido local insuficiente; sinopsis editorial basada en metadatos")
    elif len(source) < MIN_SOURCE_CHARS:
        reasons.append("fuente local breve")
    text = re.sub(r"\s+", " ", text).strip(" \t\r\n«»\"“”")
    return text, tuple(reasons)


def _db_documents(book) -> tuple[list[str], list[str]]:
    documents: list[str] = []
    titles: list[str] = []
    chars = 0
    chapter_count = book.chapters.count()
    for chapter in book.chapters.order_by("order").only("title", "content_html", "order")[:16]:
        titles.append(chapter.title)
        chapter_title = (chapter.title or "").strip()
        if (_SKIP_CHAPTER_RE.match(chapter_title)
                or (_fold(chapter_title) == _fold(book.title) and chapter_count > 1)):
            continue
        text = extract_plain_text(chapter.content_html)
        if text:
            documents.append(text)
            chars += len(text)
        if chars >= MAX_SOURCE_CHARS:
            break
    return documents, titles


def _natural_key(value: str) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


def _raw_epub_documents(path: Path) -> list[str]:
    documents: list[str] = []
    chars = 0
    with ZipFile(path) as archive:
        names = [
            name for name in archive.namelist()
            if Path(name).suffix.lower() in {".htm", ".html", ".xhtml", ".xml"}
            and not name.casefold().startswith("meta-inf/")
        ]
        for name in sorted(names, key=_natural_key):
            content = archive.read(name)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", XMLParsedAsHTMLWarning)
                soup = BeautifulSoup(content, "lxml")
            text = soup.get_text("\n", strip=True)
            if len(text) < 200:
                continue
            documents.append(text)
            chars += len(text)
            if chars >= MAX_SOURCE_CHARS:
                break
    return documents


def _epub_documents(path: Path) -> list[str]:
    try:
        book = epub.read_epub(str(path), options={"ignore_ncx": True})
    except Exception:
        return _raw_epub_documents(path)
    ordered = []
    seen_ids: set[str] = set()
    for idref, _linear in book.spine:
        item = book.get_item_with_id(idref)
        if item is not None and item.get_type() == ITEM_DOCUMENT:
            ordered.append(item)
            seen_ids.add(item.get_id())
    ordered.extend(
        item for item in book.get_items_of_type(ITEM_DOCUMENT)
        if item.get_id() not in seen_ids
    )
    documents: list[str] = []
    chars = 0
    for item in ordered:
        content = item.get_content()
        soup = BeautifulSoup(content, "lxml-xml")
        text = soup.get_text("\n", strip=True)
        if text:
            documents.append(text)
            chars += len(text)
        if chars >= MAX_SOURCE_CHARS:
            break
    try:
        raw_documents = _raw_epub_documents(path)
    except Exception:
        raw_documents = []
    if sum(map(len, raw_documents)) > sum(map(len, documents)) * 1.2:
        return raw_documents
    return documents


def generate_local_synopsis(book, *, books_root: Path) -> LocalSynopsis:
    authors = ", ".join(author.full_name for author in book.authors.all()) or "Anónimo"
    genres = ", ".join(genre.name for genre in book.genres.all())
    documents, chapter_titles = _db_documents(book)
    db_chars = sum(len(document) for document in documents)
    source = "local_chapters"

    initial_text, initial_reasons = build_local_synopsis(
        title=book.title,
        authors=authors,
        genres=genres,
        documents=documents,
        chapter_titles=chapter_titles,
    )

    needs_epub = (
        db_chars < MIN_SOURCE_CHARS
        or any(
            reason.startswith(("el texto local seleccionado", "contenido local insuficiente"))
            for reason in initial_reasons
        )
        or bool(_BOILERPLATE_RE.search(initial_text[:300]))
    )
    if needs_epub:
        epub_dir = books_root / book.slug
        preferred = epub_dir / f"{book.slug}.epub"
        paths = [preferred] if preferred.is_file() else sorted(epub_dir.glob("*.epub"))
        if paths:
            try:
                epub_documents = _epub_documents(paths[0])
                if sum(len(document) for document in epub_documents) > db_chars:
                    documents = epub_documents
                    source = "local_epub"
            except Exception:
                pass

    if source == "local_chapters":
        text, reasons = initial_text, initial_reasons
    else:
        text, reasons = build_local_synopsis(
            title=book.title,
            authors=authors,
            genres=genres,
            documents=documents,
            chapter_titles=chapter_titles,
        )
    metadata_only = any(reason.startswith("contenido local insuficiente") for reason in reasons)
    return LocalSynopsis(
        text=text,
        source="local_metadata" if metadata_only else source,
        source_chars=sum(len(document) for document in documents),
        review_reasons=reasons,
    )
