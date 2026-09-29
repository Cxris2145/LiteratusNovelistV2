"""
catalog/vocabulary.py — Vocabulario de cada libro: sus palabras (lemas) con tipo y frecuencia.

Para cada libro se listan los sustantivos, nombres propios, verbos y adjetivos que usa,
agrupados por lema ("pudo", "puede" y "podía" cuentan como PODER), cuántas veces aparecen
y las formas en que aparecen. El lector usa esas formas para ubicar cada palabra en sus
páginas.

El análisis (lematización y tipo de palabra) lo hace spaCy con el modelo `es_core_news_sm`.
Se calcula una sola vez por libro, fuera de línea, con `manage.py build_vocabulary`, y se
guarda en BookVocabulary: el servidor en Render solo lee lo guardado y no necesita spaCy.

Instalación (solo en el equipo que genera los vocabularios):
    pip install -r requirements-vocabulary.txt
"""
import gzip
import json
from collections import Counter, defaultdict

from django.utils import timezone

from .narration import BLOCK_PAUSE_MS, chapter_words

SPACY_MODEL = 'es_core_news_sm'
FORMAT_VERSION = 1

# Tipos de palabra del vocabulario (código corto -> etiqueta de spaCy).
NOUN, PROPER, VERB, ADJECTIVE = 'S', 'N', 'V', 'A'
_POS_CODES = {'NOUN': NOUN, 'PROPN': PROPER, 'VERB': VERB, 'AUX': VERB, 'ADJ': ADJECTIVE}

# "haber" como auxiliar ("había dicho") no es vocabulario: es gramática.
_SKIPPED_LEMMAS = frozenset({'haber'})

# Lemas que el modelo resuelve mal, por tipo de palabra.
_LEMMA_FIXES = {
    VERB: {'aber': 'abrir'},
    ADJECTIVE: {'buen': 'bueno', 'gran': 'grande', 'mal': 'malo', 'primer': 'primero',
                'tercer': 'tercero', 'algún': 'alguno', 'ningún': 'ninguno'},
}

MAX_DOC_CHARS = 100_000  # spaCy procesa mejor textos acotados; se parte por párrafos


class VocabularyUnavailable(Exception):
    """spaCy o su modelo de español no están instalados en este equipo."""


def load_nlp():
    """Carga spaCy solo con lo necesario para lematizar y etiquetar (sin parser ni entidades)."""
    try:
        import spacy
    except ImportError as e:
        raise VocabularyUnavailable(
            'spaCy no está instalado. Ejecuta: pip install -r requirements-vocabulary.txt') from e
    try:
        return spacy.load(SPACY_MODEL, disable=['parser', 'ner'])
    except OSError as e:
        raise VocabularyUnavailable(
            f'Falta el modelo {SPACY_MODEL}. Ejecuta: pip install -r requirements-vocabulary.txt') from e


def engine_name(nlp):
    return f"spacy-{nlp.meta.get('name', SPACY_MODEL)}-{nlp.meta.get('version', '')}"


def chapter_paragraphs(content_html):
    """Texto de un capítulo tal como lo muestra el lector, separado en párrafos."""
    words, pauses = chapter_words(content_html)
    paragraphs, current = [], []
    for word, pause in zip(words, pauses):
        current.append(word)
        if pause >= BLOCK_PAUSE_MS:
            paragraphs.append(' '.join(current))
            current = []
    if current:
        paragraphs.append(' '.join(current))
    return paragraphs


def _documents(chapters_html):
    """Agrupa los párrafos de todos los capítulos en textos de hasta MAX_DOC_CHARS."""
    batch, size = [], 0
    for html in chapters_html:
        for paragraph in chapter_paragraphs(html):
            if batch and size + len(paragraph) > MAX_DOC_CHARS:
                yield '\n\n'.join(batch)
                batch, size = [], 0
            batch.append(paragraph)
            size += len(paragraph) + 2
    if batch:
        yield '\n\n'.join(batch)


def _lemma(token, code):
    # spaCy añade los pronombres enclíticos al lema ("decirle" -> "decir él"): basta el verbo.
    lemma = token.lemma_.split(' ')[0].strip().lower()
    return _LEMMA_FIXES.get(code, {}).get(lemma, lemma)


def _merge_false_proper_nouns(counts, forms):
    """
    Una palabra común con mayúscula inicial (comienzo de verso, título) a veces sale como
    nombre propio. Si el mismo lema también aparece como sustantivo, verbo o adjetivo,
    esas apariciones se suman a su uso común más frecuente.
    """
    common = {}
    for (lemma, code), count in counts.items():
        if code != PROPER and count > common.get(lemma, (None, 0))[1]:
            common[lemma] = (code, count)
    for key in [k for k in counts if k[1] == PROPER and k[0] in common]:
        target = (key[0], common[key[0]][0])
        counts[target] += counts.pop(key)
        forms[target].update(forms.pop(key))


def build_entries(chapters_html, nlp):
    """
    Devuelve (entries, counted_words):
      entries: [[lema, tipo, frecuencia, [formas]], ...] ordenadas por frecuencia y luego
               alfabéticamente. Las formas van en minúsculas, de la más a la menos usada.
      counted_words: total de apariciones incluidas en el vocabulario.
    """
    counts = Counter()
    forms = defaultdict(Counter)
    for doc in nlp.pipe(_documents(chapters_html), batch_size=4):
        for token in doc:
            code = _POS_CODES.get(token.pos_)
            if code is None or not token.is_alpha:
                continue
            if code == PROPER and not token.text[0].isupper():
                continue  # un nombre propio siempre va con mayúscula: es un error del modelo
            lemma = _lemma(token, code)
            if len(lemma) < 2 or lemma in _SKIPPED_LEMMAS or not lemma.isalpha():
                continue
            key = (lemma, code)
            counts[key] += 1
            forms[key][token.text.lower()] += 1

    _merge_false_proper_nouns(counts, forms)
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0][0], item[0][1]))
    entries = [[lemma, code, count, [form for form, _ in forms[(lemma, code)].most_common()]]
               for (lemma, code), count in ordered]
    return entries, sum(counts.values())


def build_book_vocabulary(book, nlp):
    """Calcula y guarda el vocabulario de un libro. Devuelve el BookVocabulary."""
    from .models import BookVocabulary

    chapters_html = list(book.chapters.order_by('order').values_list('content_html', flat=True))
    entries, counted = build_entries(chapters_html, nlp)
    document = {
        'status': 'ready',
        'format_version': FORMAT_VERSION,
        'lemma_count': len(entries),
        'word_count': counted,
        'generated_at': timezone.now().isoformat(),
        'entries': entries,
    }
    raw = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

    vocabulary = BookVocabulary.all_objects.filter(book=book).first() or BookVocabulary(book=book)
    vocabulary.data = gzip.compress(raw, compresslevel=9, mtime=0)
    vocabulary.lemma_count = len(entries)
    vocabulary.word_count = counted
    vocabulary.engine = engine_name(nlp)
    vocabulary.format_version = FORMAT_VERSION
    vocabulary.deleted_at = None
    vocabulary.is_active = True
    vocabulary.save()
    return vocabulary


def compressed_document(vocabulary):
    """El JSON del vocabulario tal como se guardó (comprimido con gzip)."""
    return bytes(vocabulary.data)


def document(vocabulary):
    """El JSON del vocabulario, descomprimido (bytes UTF-8)."""
    return gzip.decompress(bytes(vocabulary.data))
