"""
Arma el ejercicio (LearningExercise) de cada nivel a partir de las lecturas y los bancos.

- Lectura (niveles 1, 2 y 4): el texto, sus preguntas y juegos sobre ese mismo texto
  (caza la palabra, ordena la historia o reconstruye la frase, vocabulario) más un juego
  del tema de la unidad.
- Cofre (nivel 3): sala de juegos del tema, sin lectura.
- Prueba (nivel 5): conceptos del tema, vocabulario de las lecturas de la unidad y juegos.

Todo es determinista: la misma unidad y nivel producen siempre el mismo ejercicio.
"""

import copy
import random
import re

from .. import games
from .banks import BANKS as _BANKS_1
from .banks_2 import BANKS_2
from .readings_1 import READINGS as _R1
from .readings_2 import READINGS as _R2
from .readings_3 import READINGS as _R3
from .readings_4 import READINGS as _R4
from .readings_5 import READINGS as _R5
from .readings_6 import READINGS as _R6
from .units import EXAM, READING, UNITS, unit_by_number

BANKS = {**_BANKS_1, **BANKS_2}
READINGS = {**_R1, **_R2, **_R3, **_R4, **_R5, **_R6}

_SENTENCE_END = re.compile(r'(?<=[.!?…»])\s+')

# Significados de todas las palabras de vocabulario: sirven de distractores. Sin punto
# final, para que ninguna opción se distinga de las demás por la puntuación.
_DEFINITION_POOL = sorted({d.rstrip('.') for r in READINGS.values() for _, d in r['vocab']}
                          | {d.rstrip('.') for _, d in BANKS['vocabulario']['pairs']})


def _rng(*parts) -> random.Random:
    return random.Random('|'.join(str(p) for p in parts))


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:]


def _sentences(text: str) -> list[str]:
    out = []
    for line in text.split('\n'):
        out.extend(s.strip() for s in _SENTENCE_END.split(line) if s.strip())
    return out


# ── Preguntas ───────────────────────────────────────────────────────────────

def _option_question(q_id: str, spec: dict, rng: random.Random) -> dict:
    if spec['type'] == 'true_false':
        return {
            'id': q_id, 'type': 'true_false', 'prompt': spec['prompt'],
            'options': [{'id': 'true', 'text': 'Verdadero', 'is_correct': spec['value']},
                        {'id': 'false', 'text': 'Falso', 'is_correct': not spec['value']}],
            'explanation': spec['explanation'],
        }
    choices = [(text, index == 0) for index, text in enumerate(spec['choices'])]
    rng.shuffle(choices)
    return {
        'id': q_id, 'type': spec['type'], 'prompt': spec['prompt'],
        'options': [{'id': 'abcd'[i], 'text': text, 'is_correct': ok} for i, (text, ok) in enumerate(choices)],
        'explanation': spec['explanation'],
    }


def _vocab_question(q_id: str, word: str, definition: str, rng: random.Random, prompt: str = '') -> dict:
    definition = definition.rstrip('.')
    distractors = [d for d in _DEFINITION_POOL if games.normalize(d) != games.normalize(definition)]
    rng.shuffle(distractors)
    question = _option_question(q_id, {
        'type': 'context_vocabulary',
        'prompt': prompt or f'En el texto aparece «{word}». ¿Qué significa?',
        'choices': [definition] + distractors[:3],
        'explanation': f'«{word}» significa: {_lower_first(definition)}.',
    }, rng)
    question['target_word'] = word
    return question


def _word_hunt(q_id: str, text: str, word: str, definition: str) -> dict | None:
    """Fragmento del texto donde está la palabra; se toca la que significa la pista."""
    sentences = _sentences(text)
    target = games.normalize(word)
    for index, sentence in enumerate(sentences):
        if any(games.normalize(tok) == target for tok in games.tokenize(sentence)):
            fragment = sentence
            if len(games.tokenize(sentence)) < 10 and index + 1 < len(sentences):
                fragment = f'{sentence} {sentences[index + 1]}'
            return {
                'id': q_id, 'type': 'word_hunt',
                'prompt': f'Caza la palabra: toca en el fragmento la palabra que significa «{_lower_first(definition)}».',
                'fragment': fragment, 'answer': word,
                'hint': f'Tiene {len(word)} letras.',
                'explanation': f'«{word}» significa: {_lower_first(definition)}.',
            }
    return None


def _order_events(q_id: str, events: list[str], explanation: str = '') -> dict:
    return {
        'id': q_id, 'type': 'order_events',
        'prompt': 'Ordena la historia: pon los sucesos en el orden en que ocurrieron.',
        'order_items': list(events),
        'explanation': explanation or 'Este es el orden en que ocurren los hechos del texto.',
    }


def _build_sentence(q_id: str, sentence: str, prompt: str) -> dict:
    tokens = sentence.split()
    return {
        'id': q_id, 'type': 'build_sentence', 'prompt': prompt,
        'answer_tokens': tokens,
        'hint': f'Empieza con «{tokens[0]}».',
        'explanation': f'La frase correcta es: «{sentence}»',
    }


def _pick_sentence(text: str, rng: random.Random) -> str | None:
    """Una oración del texto buena para reconstruir: 6 a 12 palabras, sin diálogo."""
    candidates = [s for s in _sentences(text)
                  if 6 <= len(s.split()) <= 12 and not re.search(r'[—«»()"]', s) and s[:1].isupper()]
    return rng.choice(candidates) if candidates else None


# ── Juegos del banco temático ───────────────────────────────────────────────

def _match(q_id: str, bank: dict, rng: random.Random, count: int) -> dict:
    pairs = rng.sample(bank['pairs'], count)
    return {
        'id': q_id, 'type': 'match_pairs', 'prompt': bank['pairs_prompt'],
        'pairs': [games.make_pair(q_id, i, left, right) for i, (left, right) in enumerate(pairs)],
        'explanation': 'Cada concepto tiene su pareja exacta: repásalas en la solución.',
    }


def _classify(q_id: str, bank: dict, rng: random.Random) -> dict:
    spec = bank['classify']
    items = list(spec['items'])
    rng.shuffle(items)
    categories = [{'id': f'{q_id}_c{i}', 'label': label} for i, label in enumerate(spec['categories'])]
    return {
        'id': q_id, 'type': 'classify', 'prompt': spec['prompt'],
        'categories': categories,
        'items': [{'id': f'{q_id}_i{j}', 'text': text, 'category_id': categories[cat]['id']}
                  for j, (text, cat) in enumerate(items)],
        'explanation': spec['explanation'],
    }


def _rapid(q_id: str, bank: dict, rng: random.Random, count: int) -> dict:
    trues = [s for s in bank['true_false'] if s[1]]
    falses = [s for s in bank['true_false'] if not s[1]]
    n_false = max(1, min(len(falses), count // 2))
    picked = rng.sample(falses, n_false) + rng.sample(trues, count - n_false)
    rng.shuffle(picked)
    return {
        'id': q_id, 'type': 'rapid_true_false',
        'prompt': 'Relámpago: ¿verdadero o falso? Responde antes de que se acabe el tiempo.',
        'statements': [{'id': f'{q_id}_s{i}', 'text': text, 'is_true': value} for i, (text, value) in enumerate(picked)],
        'time_limit_seconds': 7 * count,
        'explanation': 'Revisa en la solución cuáles afirmaciones eran verdaderas.',
    }


def _scramble(q_id: str, bank: dict, rng: random.Random) -> dict:
    word, hint = rng.choice(bank['scramble'])
    return {
        'id': q_id, 'type': 'word_scramble',
        'prompt': 'Anagrama: ordena las letras para formar la palabra.',
        'answer': word, 'hint': hint,
        'explanation': f'La palabra es «{word}»: {_lower_first(hint)}.',
    }


def _term_question(q_id: str, pair: tuple[str, str], bank: dict, rng: random.Random) -> dict:
    term, definition = pair
    others = [t for t, _ in bank['pairs'] if t != term]
    rng.shuffle(others)
    return _option_question(q_id, {
        'type': 'single_choice',
        'prompt': f'¿Qué respuesta corresponde a esta descripción? «{definition}»',
        'choices': [term] + others[:3],
        'explanation': f'{term}: {_lower_first(definition)}',
    }, rng)


# ── Niveles ─────────────────────────────────────────────────────────────────

def _short_title(unit_def: dict | None, unit_number: int) -> str:
    return unit_def['title'].split('—')[-1].strip() if unit_def else f'Unidad {unit_number}'


def _reading_exercise(unit_number: int, level_number: int, theme: str) -> dict:
    text = READINGS[(unit_number, level_number)]
    bank = BANKS[theme]
    rng = _rng('lectura', unit_number, level_number)
    prefix = f'u{unit_number}_l{level_number}'
    full_text = '\n'.join(text['pages'])

    questions = copy.deepcopy(text['raw_questions'])
    questions += [_option_question(f'{prefix}_q{i}', spec, rng) for i, spec in enumerate(text['questions'], 1)]

    word, definition = text['vocab'][0]
    hunt = _word_hunt(f'{prefix}_caza', full_text, word, definition)
    if hunt:
        questions.append(hunt)

    if text['events']:
        questions.append(_order_events(f'{prefix}_orden', text['events'], text['events_explanation']))
    else:
        sentence = text['sentence'] or _pick_sentence(full_text, rng)
        if sentence:
            questions.append(_build_sentence(f'{prefix}_frase', sentence,
                                             'Reconstruye la frase del texto tocando las palabras en orden.'))

    if len(text['vocab']) > 1:
        questions.append(_vocab_question(f'{prefix}_voc', *text['vocab'][1], rng))

    # Un juego del tema de la unidad, distinto según el nivel.
    if level_number == 1:
        questions.append(_match(f'{prefix}_parejas', bank, rng, 4))
    elif level_number == 2:
        questions.append(_classify(f'{prefix}_clasifica', bank, rng))
    else:
        questions.append(_rapid(f'{prefix}_rayo', bank, rng, 5))

    return {
        'title': text['title'], 'author_name': text['author'], 'source_type': text['source_type'],
        'content_pages': text['pages'], 'questions_data': questions,
    }


def _games_exercise(unit_number: int, level_number: int, theme: str, unit_def: dict | None) -> dict:
    bank = BANKS[theme]
    rng = _rng('juegos', unit_number, level_number)
    prefix = f'u{unit_number}_l{level_number}'
    questions = [
        _match(f'{prefix}_parejas', bank, rng, 5),
        _scramble(f'{prefix}_anagrama', bank, rng),
        _classify(f'{prefix}_clasifica', bank, rng),
        _rapid(f'{prefix}_rayo', bank, rng, 6),
        _build_sentence(f'{prefix}_frase', rng.choice(bank['sentences']),
                        'Reconstruye la frase tocando las palabras en orden.'),
    ]
    return {
        'title': f'Sala de juegos · {_short_title(unit_def, unit_number)}',
        'author_name': 'Literatus', 'source_type': 'pedagogic_original',
        'content_pages': [], 'questions_data': questions,
    }


def _exam_exercise(unit_number: int, level_number: int, theme: str, unit_def: dict | None) -> dict:
    bank = BANKS[theme]
    rng = _rng('prueba', unit_number, level_number)
    prefix = f'u{unit_number}_l{level_number}'

    unit_vocab = [v for (u, _), r in sorted(READINGS.items()) if u == unit_number for v in r['vocab']]
    if len(unit_vocab) < 2:
        unit_vocab = [v for r in READINGS.values() for v in r['vocab']]
    vocab = rng.sample(unit_vocab, 2)
    concepts = rng.sample(bank['pairs'], 2)

    questions = [
        _term_question(f'{prefix}_concepto1', concepts[0], bank, rng),
        _vocab_question(f'{prefix}_voc1', *vocab[0], rng,
                        prompt=f'En esta unidad leíste «{vocab[0][0]}». ¿Qué significa?'),
        _match(f'{prefix}_parejas', bank, rng, 5),
        _classify(f'{prefix}_clasifica', bank, rng),
        _vocab_question(f'{prefix}_voc2', *vocab[1], rng,
                        prompt=f'En esta unidad leíste «{vocab[1][0]}». ¿Qué significa?'),
        _rapid(f'{prefix}_rayo', bank, rng, 6),
        _scramble(f'{prefix}_anagrama', bank, rng),
        _term_question(f'{prefix}_concepto2', concepts[1], bank, rng),
    ]
    return {
        'title': f'Prueba de maestría · {_short_title(unit_def, unit_number)}',
        'author_name': 'Literatus', 'source_type': 'pedagogic_original',
        'content_pages': [], 'questions_data': questions,
    }


def build_exercise(unit_def: dict, level_def: dict) -> dict:
    """Ejercicio de un nivel del mapa (content/units.py)."""
    unit_number, level_number = unit_def['unit_number'], level_def['level_number']
    theme = unit_def['theme']
    if level_def['kind'] == READING and (unit_number, level_number) in READINGS:
        return _reading_exercise(unit_number, level_number, theme)
    if level_def['kind'] == EXAM:
        return _exam_exercise(unit_number, level_number, theme, unit_def)
    return _games_exercise(unit_number, level_number, theme, unit_def)


def build_fallback_exercise(level) -> dict:
    """
    Ejercicio para un LearningLevel cualquiera cuando la IA no responde: usa el
    contenido propio si el nivel está en el mapa y, si no, juegos del tema más cercano.
    """
    unit_number, level_number = level.unit.unit_number, level.level_number
    unit_def = unit_by_number(unit_number)
    theme = unit_def['theme'] if unit_def else 'maestria'
    if (unit_number, level_number) in READINGS and not (level.is_exam or level.is_chest):
        return _reading_exercise(unit_number, level_number, theme)
    if level.is_exam:
        return _exam_exercise(unit_number, level_number, theme, unit_def)
    return _games_exercise(unit_number, level_number, theme, unit_def)


def all_exercises():
    """(unidad, nivel, ejercicio) de todo el mapa: para la siembra y las pruebas."""
    for unit_def in UNITS:
        for level_def in unit_def['levels']:
            yield unit_def, level_def, build_exercise(unit_def, level_def)




def build_skip_test(target_number: int, skipped_numbers: list[int], seed: str) -> dict:
    """
    Prueba de salto: examen muy difícil con el material de TODAS las unidades que se
    saltan. Cada intento (semilla distinta) arma otro examen, así que no se memoriza.
      - 2 × Une las parejas de 6, con conceptos de unidades distintas mezclados
      - 2 × Clasifica (de dos unidades distintas si las hay)
      - 2 × Relámpago de 8 afirmaciones con 4 segundos por afirmación
      - 2 × Anagrama con las palabras más largas
      - 3 × vocabulario de las lecturas saltadas
      - 2 × conceptos por su definición
      - 1 × Reconstruye la frase
    """
    rng = _rng('salto', target_number, seed)
    prefix = f'salto{target_number}'
    themes = []
    for number in skipped_numbers:
        unit_def = unit_by_number(number)
        theme = unit_def['theme'] if unit_def else 'maestria'
        if theme not in themes:
            themes.append(theme)
    themes = themes or ['maestria']

    # Conceptos sin repetir (algunos, como «Metáfora», aparecen en varios temas).
    concepts, seen = [], set()
    for theme in themes:
        for left, right in BANKS[theme]['pairs']:
            key = games.normalize(left)
            if key not in seen:
                seen.add(key)
                concepts.append((theme, left, right))

    questions = []
    # Con material de una sola unidad no se repite el mismo juego dos veces:
    # los huecos se llenan con más vocabulario y conceptos.
    missing = 0

    n_match = 2 if len(concepts) >= 10 else 1
    missing += 2 - n_match
    for k in range(n_match):
        picked = rng.sample(concepts, min(6, len(concepts)))
        q_id = f'{prefix}_parejas{k}'
        questions.append({
            'id': q_id, 'type': 'match_pairs',
            'prompt': 'Une cada concepto con su definición (mezcla de varias unidades).',
            'pairs': [games.make_pair(q_id, i, left, right) for i, (_, left, right) in enumerate(picked)],
            'explanation': 'Repasa en la solución las parejas de cada unidad.',
        })

    classify_themes = rng.sample(themes, min(2, len(themes)))
    for k, theme in enumerate(classify_themes):
        questions.append(_classify(f'{prefix}_clasifica{k}', BANKS[theme], rng))

    statements, seen_statements = [], set()
    for theme in themes:
        for text, value in BANKS[theme]['true_false']:
            if text not in seen_statements:
                seen_statements.add(text)
                statements.append((text, value))
    n_rapid = 2 if len(statements) >= 12 else 1
    missing += 2 - n_rapid
    for k in range(n_rapid):
        rapid = _rapid(f'{prefix}_rayo{k}', {'true_false': statements}, rng, min(8, len(statements)))
        rapid['prompt'] = 'Relámpago difícil: 4 segundos por afirmación. ¿Verdadero o falso?'
        rapid['time_limit_seconds'] = 4 * len(rapid['statements'])
        questions.append(rapid)

    words = sorted({w for theme in themes for w in BANKS[theme]['scramble']}, key=lambda w: -len(w[0]))
    for k, (word, hint) in enumerate(rng.sample(words[:6], min(2, len(words)))):
        questions.append({
            'id': f'{prefix}_anagrama{k}', 'type': 'word_scramble',
            'prompt': 'Anagrama: ordena las letras para formar la palabra.',
            'answer': word, 'hint': hint,
            'explanation': f'La palabra es «{word}»: {_lower_first(hint)}.',
        })

    vocab = [v for (u, _), r in sorted(READINGS.items()) if u in skipped_numbers for v in r['vocab']]
    vocab = vocab or [v for r in READINGS.values() for v in r['vocab']]
    missing += 2 - len(classify_themes)
    extra_vocab = (missing + 1) // 2
    for k, (word, definition) in enumerate(rng.sample(vocab, min(3 + extra_vocab, len(vocab)))):
        questions.append(_vocab_question(f'{prefix}_voc{k}', word, definition, rng,
                                         prompt=f'¿Qué significa «{word}»?'))

    for k, (theme, left, right) in enumerate(rng.sample(concepts, min(2 + missing - extra_vocab, len(concepts)))):
        questions.append(_term_question(f'{prefix}_concepto{k}', (left, right), BANKS[theme], rng))

    sentences = [s for theme in themes for s in BANKS[theme]['sentences']]
    questions.append(_build_sentence(f'{prefix}_frase', rng.choice(sentences),
                                     'Reconstruye la frase tocando las palabras en orden.'))

    rng.shuffle(questions)
    return {'title': f'Prueba de salto · Unidad {target_number}', 'questions_data': questions}
