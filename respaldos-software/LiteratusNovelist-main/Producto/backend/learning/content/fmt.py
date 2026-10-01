"""
Atajos para escribir las lecturas sin repetir la estructura JSON de cada pregunta.
El constructor (builder.py) baraja las opciones y les pone id.
"""


def mc(kind: str, prompt: str, options: list[str], explanation: str) -> dict:
    """Pregunta de opción única. La PRIMERA opción es la correcta."""
    return {'type': kind, 'prompt': prompt, 'choices': options, 'explanation': explanation}


def tf(statement: str, value: bool, explanation: str) -> dict:
    """Verdadero o falso."""
    return {'type': 'true_false', 'prompt': statement, 'value': value, 'explanation': explanation}


def reading(title: str, pages: list[str], questions: list[dict], vocab: list[tuple[str, str]],
            events: list[str] | None = None, events_explanation: str = '', sentence: str = '',
            author: str = 'Taller Literatus', source_type: str = 'pedagogic_original',
            raw_questions: list[dict] | None = None) -> dict:
    """
    Una lectura de nivel.
    - vocab: palabras que aparecen tal cual en el texto, con su significado (juegos de vocabulario).
    - events: sucesos en el orden en que ocurren (juego "Ordena la historia").
    - sentence: oración para "Reconstruye la frase"; si falta, se toma una del texto.
    - raw_questions: preguntas ya en formato final (para conservar contenido existente).
    """
    return {
        'title': title, 'pages': pages, 'questions': questions, 'vocab': vocab,
        'events': events or [], 'events_explanation': events_explanation, 'sentence': sentence,
        'author': author, 'source_type': source_type, 'raw_questions': raw_questions or [],
    }
