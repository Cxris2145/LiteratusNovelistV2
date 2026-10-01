"""
learning/games.py — Tipos de actividad de La Senda: cómo se muestran, cómo se corrigen
y cómo se enseña la solución.

Cada actividad vive como un dict dentro de LearningExercise.questions_data. Este módulo es
la única fuente de verdad para:

- public_question(): la versión que viaja al navegador, SIN respuestas.
- grade(): la nota de una respuesta, de 0.0 a 1.0 (los juegos con varias piezas dan crédito
  parcial: 3 de 4 parejas valen 0.75).
- solution(): lo que se le muestra al lector después de responder.
- validate(): descarta actividades mal formadas (p. ej. las que devuelve la IA).
"""

import random
import re
import unicodedata
import zlib

# Preguntas de opción única (la respuesta es el id de la opción).
OPTION_TYPES = {
    'single_choice', 'context_vocabulary', 'synonym_replacement', 'true_false',
    'fill_blank', 'character_role', 'inference_prediction',
}

# Juegos: cada uno con su propia forma de respuesta.
GAME_TYPES = {
    'order_events',      # ordenar sucesos                → lista de textos
    'match_pairs',       # une las parejas                → {left_id: right_id}
    'word_scramble',     # anagrama                       → palabra
    'build_sentence',    # reconstruye la frase           → lista de palabras
    'word_hunt',         # caza la palabra en un texto    → índice de la palabra
    'classify',          # clasifica en categorías        → {item_id: category_id}
    'rapid_true_false',  # relámpago de verdadero/falso   → {statement_id: bool}
}

ALL_TYPES = OPTION_TYPES | GAME_TYPES

# Nombre visible de cada actividad (para el mapa de La Senda y el resumen).
ACTIVITY_LABELS = {
    'reading': 'Lectura',
    'options': 'Preguntas',
    'order_events': 'Ordena la historia',
    'match_pairs': 'Une las parejas',
    'word_scramble': 'Anagrama',
    'build_sentence': 'Reconstruye la frase',
    'word_hunt': 'Caza la palabra',
    'classify': 'Clasifica',
    'rapid_true_false': 'Relámpago',
}

_PUNCT = '¡!¿?.,;:«»"“”‘’()[]—–-…\''


def normalize(text) -> str:
    """Compara sin mayúsculas, tildes ni signos: "¡Quijote!" == "quijote"."""
    text = unicodedata.normalize('NFD', str(text or ''))
    text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
    return text.strip(_PUNCT + ' \n\t').lower()


def tokenize(fragment: str) -> list[str]:
    """Palabras de un fragmento tal como se muestran (con su puntuación pegada)."""
    return [tok for tok in re.split(r'\s+', fragment or '') if tok]


def make_pair(question_id: str, index: int, left: str, right: str) -> dict:
    """
    Una pareja de "Une las parejas". El id de la derecha sale de un hash para que
    su orden no delate con qué elemento de la izquierda va.
    """
    digest = zlib.crc32(f'{question_id}|{index}|{right}'.encode('utf-8'))
    return {'left_id': f'{question_id}_l{index}', 'left': left,
            'right_id': f'{question_id}_r{digest:08x}', 'right': right}


def _stable_shuffle(items: list, seed: str) -> list:
    """
    Barajado que no cambia entre recargas de la misma actividad y que nunca entrega
    el orden original (una frase u orden de sucesos no puede llegar ya resuelto).
    """
    shuffled = list(items)
    rng = random.Random(seed)
    for _ in range(10):
        rng.shuffle(shuffled)
        if shuffled != list(items) or len({str(i) for i in items}) < 2:
            break
    return shuffled


def _scramble_letters(word: str, seed: str) -> list[str]:
    letters = list(word.upper())
    rng = random.Random(seed)
    # Nunca se entrega ya resuelto (salvo palabras de una sola letra repetida).
    for _ in range(10):
        rng.shuffle(letters)
        if ''.join(letters) != word.upper() or len(set(letters)) < 2:
            break
    return letters


# ---------------------------------------------------------------------------
# Versión pública (sin respuestas)
# ---------------------------------------------------------------------------

def public_question(q: dict) -> dict:
    q_type = q.get('type', 'single_choice')
    q_id = str(q.get('id'))
    public = {
        'id': q_id,
        'type': q_type,
        'prompt': q.get('prompt', ''),
        'target_word': q.get('target_word', ''),
    }

    if q_type in OPTION_TYPES:
        public['options'] = [{'id': o.get('id'), 'text': o.get('text')} for o in q.get('options', [])]

    elif q_type == 'order_events':
        public['order_items'] = _stable_shuffle(q.get('order_items', []), q_id)

    elif q_type == 'match_pairs':
        pairs = q.get('pairs', [])
        public['left'] = [{'id': p['left_id'], 'text': p['left']} for p in pairs]
        public['right'] = _stable_shuffle([{'id': p['right_id'], 'text': p['right']} for p in pairs], q_id)

    elif q_type == 'word_scramble':
        public['letters'] = _scramble_letters(q.get('answer', ''), q_id)
        public['hint'] = q.get('hint', '')

    elif q_type == 'build_sentence':
        public['tokens'] = _stable_shuffle(q.get('answer_tokens', []), q_id)
        public['hint'] = q.get('hint', '')

    elif q_type == 'word_hunt':
        public['tokens'] = tokenize(q.get('fragment', ''))
        public['hint'] = q.get('hint', '')

    elif q_type == 'classify':
        public['categories'] = [{'id': c['id'], 'label': c['label']} for c in q.get('categories', [])]
        public['items'] = _stable_shuffle([{'id': i['id'], 'text': i['text']} for i in q.get('items', [])], q_id)

    elif q_type == 'rapid_true_false':
        public['statements'] = [{'id': s['id'], 'text': s['text']} for s in q.get('statements', [])]
        public['time_limit_seconds'] = int(q.get('time_limit_seconds') or 8 * len(public['statements']))

    return public


# ---------------------------------------------------------------------------
# Corrección
# ---------------------------------------------------------------------------

def _fraction_of_mapping(expected: dict, given) -> float:
    if not expected:
        return 0.0
    given = given if isinstance(given, dict) else {}
    hits = sum(1 for key, value in expected.items() if str(given.get(key)) == str(value))
    return hits / len(expected)


def grade(q: dict, answer) -> float:
    """Nota de 0.0 a 1.0 para una respuesta."""
    q_type = q.get('type', 'single_choice')

    if q_type in OPTION_TYPES:
        correct = next((o for o in q.get('options', []) if o.get('is_correct')), None)
        return 1.0 if correct and str(answer) == str(correct.get('id')) else 0.0

    if q_type == 'order_events':
        return 1.0 if list(answer or []) == list(q.get('order_items', [])) else 0.0

    if q_type == 'match_pairs':
        expected = {p['left_id']: p['right_id'] for p in q.get('pairs', [])}
        return _fraction_of_mapping(expected, answer)

    if q_type == 'word_scramble':
        return 1.0 if normalize(answer) == normalize(q.get('answer')) else 0.0

    if q_type == 'build_sentence':
        given = [normalize(t) for t in (answer or [])] if isinstance(answer, list) else []
        return 1.0 if given == [normalize(t) for t in q.get('answer_tokens', [])] else 0.0

    if q_type == 'word_hunt':
        tokens = tokenize(q.get('fragment', ''))
        try:
            index = int(answer)
        except (TypeError, ValueError):
            return 0.0
        if not 0 <= index < len(tokens):
            return 0.0
        return 1.0 if normalize(tokens[index]) == normalize(q.get('answer')) else 0.0

    if q_type == 'classify':
        expected = {i['id']: i['category_id'] for i in q.get('items', [])}
        return _fraction_of_mapping(expected, answer)

    if q_type == 'rapid_true_false':
        given = answer if isinstance(answer, dict) else {}
        statements = q.get('statements', [])
        if not statements:
            return 0.0
        hits = sum(1 for s in statements if isinstance(given.get(s['id']), bool) and given[s['id']] == bool(s.get('is_true')))
        return hits / len(statements)

    return 0.0


def solution(q: dict):
    """La respuesta correcta en una forma que el juego sabe pintar."""
    q_type = q.get('type', 'single_choice')

    if q_type in OPTION_TYPES:
        correct = next((o for o in q.get('options', []) if o.get('is_correct')), {})
        return {'option_id': correct.get('id'), 'text': correct.get('text')}
    if q_type == 'order_events':
        return {'order': q.get('order_items', [])}
    if q_type == 'match_pairs':
        return {'pairs': {p['left_id']: p['right_id'] for p in q.get('pairs', [])}}
    if q_type == 'word_scramble':
        return {'word': q.get('answer', '')}
    if q_type == 'build_sentence':
        return {'sentence': ' '.join(q.get('answer_tokens', []))}
    if q_type == 'word_hunt':
        tokens = tokenize(q.get('fragment', ''))
        target = normalize(q.get('answer'))
        return {'indexes': [i for i, tok in enumerate(tokens) if normalize(tok) == target], 'word': q.get('answer', '')}
    if q_type == 'classify':
        return {'items': {i['id']: i['category_id'] for i in q.get('items', [])}}
    if q_type == 'rapid_true_false':
        return {'statements': {s['id']: bool(s.get('is_true')) for s in q.get('statements', [])}}
    return None


# ---------------------------------------------------------------------------
# Validación (contenido propio y generado por IA)
# ---------------------------------------------------------------------------

def validate(q: dict) -> bool:
    """True si la actividad se puede jugar y corregir sin errores."""
    if not isinstance(q, dict) or not q.get('id') or not q.get('prompt'):
        return False
    q_type = q.get('type')
    try:
        if q_type in OPTION_TYPES:
            options = q.get('options') or []
            return len(options) >= 2 and sum(1 for o in options if o.get('is_correct')) == 1 \
                and all(o.get('id') and o.get('text') for o in options)
        if q_type == 'order_events':
            items = q.get('order_items') or []
            return 3 <= len(items) <= 6 and len(set(items)) == len(items)
        if q_type == 'match_pairs':
            pairs = q.get('pairs') or []
            ids = [p['left_id'] for p in pairs] + [p['right_id'] for p in pairs]
            return 3 <= len(pairs) <= 6 and len(set(ids)) == len(ids) and all(p['left'] and p['right'] for p in pairs)
        if q_type == 'word_scramble':
            answer = q.get('answer') or ''
            return 3 <= len(answer) <= 14 and ' ' not in answer.strip()
        if q_type == 'build_sentence':
            tokens = q.get('answer_tokens') or []
            return 3 <= len(tokens) <= 14
        if q_type == 'word_hunt':
            target = normalize(q.get('answer'))
            return bool(target) and any(normalize(t) == target for t in tokenize(q.get('fragment', '')))
        if q_type == 'classify':
            categories = {c['id'] for c in q.get('categories') or []}
            items = q.get('items') or []
            return 2 <= len(categories) <= 3 and 3 <= len(items) <= 8 \
                and all(i['id'] and i['text'] and i['category_id'] in categories for i in items)
        if q_type == 'rapid_true_false':
            statements = q.get('statements') or []
            return 3 <= len(statements) <= 8 and all(s['id'] and s['text'] and 'is_true' in s for s in statements)
    except (KeyError, TypeError):
        return False
    return False


def activity_kinds(questions: list) -> list[str]:
    """Tipos de actividad de un ejercicio, sin repetir y en orden de aparición."""
    kinds = []
    for q in questions or []:
        kind = 'options' if q.get('type') in OPTION_TYPES else q.get('type')
        if kind and kind not in kinds:
            kinds.append(kind)
    return kinds
