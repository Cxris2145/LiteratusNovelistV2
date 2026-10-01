"""
learning/ai_generator.py — Generador de Comprensión Lectora y Preguntas con IA.
Multi-provider: Google Gemini (google.genai SDK) con failover a DeepSeek.
"""

import os
import json
import re
import zlib
from google import genai
from google.genai import types
from django.conf import settings
from catalog.models import Book, Chapter
from . import games

# Clásicos revisados para la Senda: el catálogo completo incluye obras que no son
# para todo público, así que la IA solo toma fragmentos de esta lista.
SAFE_CLASSIC_SLUGS = [
    'la-metamorfosis-kafka-franz',
    'orgullo-y-prejuicio-jane-austen',
    'segunda-parte-del-ingenioso-caballero-don-quijote-de-la-mancha-cervantes-miguel',
    'la-odisea-homero',
    'la-vida-de-lazarillo-de-tormes-anonimo',
    'leyendas-gustavo-adolfo-becquer',
    'la-isla-del-tesoro-robert-louis-stevenson',
    'viaje-al-centro-de-la-tierra-verne-julio',
    'la-vuelta-al-mundo-en-ochenta-dias-verne-julio',
    'veinte-mil-leguas-de-viaje-submarino-verne-julio',
    'robinson-crusoe-defoe-daniel',
    'mujercitas-alcott-louisa-may',
    'las-aventuras-de-alicia-en-el-pais-de-las-maravillas-carroll-lewis',
    'peter-pan-y-wendy-j-m-barrie',
    'oliver-twist-charles-dickens',
    'marianela-benito-perez-galdos',
    'la-llamada-de-lo-salvaje-jack-london',
    'heidi-johanna-spyri',
    'las-aventuras-de-pinocho-carlo-collodi',
]


def _pick(seed: str, count: int) -> int:
    """Índice estable a partir de una semilla (el mismo nivel elige el mismo libro)."""
    return zlib.crc32(seed.encode('utf-8')) % count if count else 0


class ReadingComprehensionAIGenerator:
    """
    Genera pasajes de lectura paginados y baterías de preguntas de comprensión
    a partir de obras del catálogo de Literatus o mediante micro-relatos pedagógicos.
    """

    def __init__(self):
        self.gemini_key_1 = getattr(settings, 'GOOGLE_API_KEY', os.environ.get('GOOGLE_API_KEY'))
        self.gemini_key_2 = getattr(settings, 'GOOGLE_API_KEY_2', os.environ.get('GOOGLE_API_KEY_2'))
        self.deepseek_key = getattr(settings, 'DEEPSEEK_API_KEY', os.environ.get('DEEPSEEK_API_KEY'))

    def generate_exercise(self, difficulty: str = 'facil', unit_focus: str = 'comprension_basica',
                          book_id: str = None, seed: str = '') -> dict:
        """
        Genera un ejercicio completo: pasaje, preguntas de comprensión y juegos. La semilla
        (el id del nivel) hace que cada nivel tome un libro y capítulo distintos.
        """
        # 1. Obtener fragmento de libro real si es posible
        excerpt_data = self._get_book_excerpt(book_id, difficulty, seed)

        # 2. Construir prompt pedagógico para la IA
        system_prompt = self._build_system_prompt(difficulty, unit_focus)
        user_prompt = self._build_user_prompt(excerpt_data, difficulty, unit_focus)

        # 3. Llamar a la IA
        raw_json = self._call_ai(system_prompt, user_prompt)

        try:
            parsed = json.loads(raw_json)
        except Exception:
            # Limpiar markdown formatting si vino con ```json
            cleaned = re.sub(r'```(?:json)?\s*', '', raw_json).strip('` \n')
            parsed = json.loads(cleaned)

        # Garantizar metadatos del libro
        if excerpt_data and excerpt_data.get('book_title'):
            parsed['book_title'] = excerpt_data.get('book_title', parsed.get('book_title', 'Obra Clásica'))
            parsed['author_name'] = excerpt_data.get('author_name', parsed.get('author_name', 'Autor Clásico'))
            parsed['source_type'] = 'classic_book'
        else:
            parsed['source_type'] = 'pedagogic_original'

        parsed['questions'] = self._clean_questions(parsed.get('questions', []))
        return parsed

    @staticmethod
    def _clean_questions(questions: list) -> list:
        """
        Ajusta lo que devuelve la IA al formato de games.py y descarta lo que no se
        pueda jugar o corregir (una actividad rota no debe llegar al lector).
        """
        cleaned, used_ids = [], set()
        for index, q in enumerate(questions if isinstance(questions, list) else []):
            if not isinstance(q, dict):
                continue
            q = dict(q)
            q_id = str(q.get('id') or f'q{index + 1}')
            while q_id in used_ids:
                q_id = f'{q_id}_{index}'
            q['id'] = q_id

            if q.get('type') == 'match_pairs':
                q['pairs'] = [
                    games.make_pair(q_id, i, str(p.get('left', '')), str(p.get('right', '')))
                    for i, p in enumerate(q.get('pairs') or []) if isinstance(p, dict)
                ]
            elif q.get('type') == 'classify':
                categories = q.get('categories') or []
                ids = {str(c.get('id')) for c in categories if isinstance(c, dict)}
                q['items'] = [
                    {'id': f'{q_id}_i{i}', 'text': str(item.get('text', '')), 'category_id': str(item.get('category_id'))}
                    for i, item in enumerate(q.get('items') or [])
                    if isinstance(item, dict) and str(item.get('category_id')) in ids
                ]
            elif q.get('type') == 'rapid_true_false':
                q['statements'] = [
                    {'id': f'{q_id}_s{i}', 'text': str(s.get('text', '')), 'is_true': bool(s.get('is_true'))}
                    for i, s in enumerate(q.get('statements') or []) if isinstance(s, dict)
                ]
            elif q.get('type') == 'build_sentence' and not q.get('answer_tokens') and q.get('answer'):
                q['answer_tokens'] = str(q['answer']).split()

            used_ids.add(q_id)
            if games.validate(q):
                cleaned.append(q)
        return cleaned

    def _get_book_excerpt(self, book_id: str = None, difficulty: str = 'facil', seed: str = '') -> dict:
        """
        Busca un capítulo con buen texto en la base de datos de Literatus.
        """
        try:
            if book_id:
                book = Book.objects.filter(pk=book_id).first()
            else:
                books = list(Book.objects.filter(slug__in=SAFE_CLASSIC_SLUGS, chapters__isnull=False)
                             .distinct().order_by('slug'))
                book = books[_pick(seed or 'senda', len(books))] if books else None

            if not book:
                return {}

            chapters = list(book.chapters.exclude(content_html='').order_by('order')[:12])
            chapter = chapters[_pick(f'{seed}:capitulo', len(chapters))] if chapters else None
            if not chapter:
                return {}

            # Extraer texto plano del HTML
            raw_text = re.sub(r'<[^>]+>', ' ', chapter.content_html)
            # Normalizar espacios
            clean_text = ' '.join(raw_text.split())

            # Definir extensión según dificultad
            word_limits = {
                'facil': 220,
                'intermedio': 450,
                'dificil': 750
            }
            limit = word_limits.get(difficulty, 300)
            words = clean_text.split()[:limit]
            
            # Cortar en el último punto para no dejar oraciones incompletas
            excerpt = ' '.join(words)
            last_period = excerpt.rfind('.')
            if last_period > 100:
                excerpt = excerpt[:last_period + 1]

            author_name = book.author.full_name if getattr(book, 'author', None) else 'Autor Clásico'

            return {
                'book_id': str(book.id),
                'book_title': book.title,
                'author_name': author_name,
                'chapter_title': chapter.title,
                'excerpt': excerpt
            }
        except Exception:
            return {}

    def _build_system_prompt(self, difficulty: str, unit_focus: str) -> str:
        return f"""Eres el Diseñador Pedagógico Principal de Literatus Novelist, una prestigiosa plataforma de literatura y comprensión lectora.
Tu misión es generar una experiencia de lectura interactiva y formativa de nivel '{difficulty.upper()}', enfocada en '{unit_focus}'.

DIRECTRICES DE CONTENIDO:
1. Divide el texto en páginas de lectura cómodas y legibles:
   - FÁCIL: 1 página (150 - 250 palabras).
   - INTERMEDIO: 1 a 2 páginas (200 - 300 palabras por página).
   - DIFÍCIL: 2 a 3 páginas (250 - 350 palabras por página).

2. Genera exactamente (preguntas + juegos en la misma lista "questions"):
   - FÁCIL: 3 preguntas y 2 juegos.
   - INTERMEDIO: 3 preguntas y 3 juegos.
   - DIFÍCIL: 4 preguntas y 3 juegos.

3. TIPOS DE PREGUNTAS (debes variar los tipos):
   - 'context_vocabulary': Significado de una palabra del texto según el contexto.
   - 'synonym_replacement': Elegir un sinónimo que no altere el sentido.
   - 'single_choice': Opción múltiple sobre idea principal, causas o acciones.
   - 'character_role': Identificar protagonista, antagonista o secundario.
   - 'true_false': Afirmación directa o inferida (2 opciones).
   - 'fill_blank': Completar una oración clave del pasaje.
   - 'inference_prediction': Deducir intenciones, emociones o consecuencias implícitas.

   TIPOS DE JUEGOS (elige distintos entre sí, siempre sobre el texto):
   - 'order_events': ordenar 4 sucesos. Campo "order_items" con el orden correcto.
   - 'match_pairs': unir 4 parejas (palabra del texto ↔ significado, personaje ↔ acción).
     Campo "pairs": [{{"left": "...", "right": "..."}}].
   - 'word_scramble': anagrama de UNA palabra clave del texto (sin espacios, 4 a 12 letras).
     Campos "answer" (la palabra) y "hint" (pista breve).
   - 'build_sentence': reconstruir una oración del texto de 5 a 12 palabras.
     Campo "answer_tokens": la oración partida en palabras, en orden y con su puntuación.
   - 'word_hunt': encontrar una palabra dentro de un fragmento copiado del texto.
     Campos "fragment" (2 o 3 oraciones literales), "answer" (la palabra, tal como aparece)
     y "hint" (su significado). El "prompt" pide tocar la palabra que significa la pista.
   - 'classify': clasificar 6 elementos en 2 categorías (p. ej. hecho/opinión, personaje/lugar).
     Campos "categories": [{{"id": "c1", "label": "..."}}] e "items": [{{"text": "...", "category_id": "c1"}}].
   - 'rapid_true_false': 5 afirmaciones breves sobre el texto para responder contra el reloj.
     Campo "statements": [{{"text": "...", "is_true": true}}].

4. CALIDAD DIDÁCTICA:
   - Las preguntas deben basarse estrictamente en el texto mostrado.
   - Para cada pregunta proporciona una 'explanation' concisa y pedagógica que enseñe por qué es correcta.
   - En preguntas de opciones, incluye 4 opciones (excepto en true_false que son 2: 'Verdadero' y 'Falso'), asegurándote de que solo UNA tenga "is_correct": true.

DEBES RESPONDER EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO CON ESTA ESTRUCTURA EXACTA:
{{
  "title": "Título del Pasaje",
  "book_title": "Nombre del Libro",
  "author_name": "Nombre del Autor",
  "pages": [
    "Página 1: texto...",
    "Página 2: texto..."
  ],
  "questions": [
    {{
      "id": "q1",
      "type": "context_vocabulary",
      "prompt": "¿Qué significa la palabra 'taciturno' en el texto?",
      "target_word": "taciturno",
      "options": [
        {{"id": "a", "text": "Opción A", "is_correct": false}},
        {{"id": "b", "text": "Opción B", "is_correct": true}},
        {{"id": "c", "text": "Opción C", "is_correct": false}},
        {{"id": "d", "text": "Opción D", "is_correct": false}}
      ],
      "explanation": "Explicación educativa de la respuesta correcta..."
    }},
    {{
      "id": "q2",
      "type": "order_events",
      "prompt": "Ordena cronológicamente los siguientes sucesos:",
      "order_items": [
        "Primer suceso",
        "Segundo suceso",
        "Tercer suceso",
        "Cuarto suceso"
      ],
      "explanation": "Explicación del orden cronológico de los acontecimientos..."
    }}
  ]
}}"""

    def _build_user_prompt(self, excerpt_data: dict, difficulty: str, unit_focus: str) -> str:
        if excerpt_data and excerpt_data.get('excerpt'):
            return f"""Usa el siguiente pasaje real de la obra "{excerpt_data.get('book_title')}" de {excerpt_data.get('author_name')}:

\"\"\"
{excerpt_data.get('excerpt')}
\"\"\"

Genera la experiencia didáctica paginada y las preguntas para dificultad '{difficulty}' con enfoque en '{unit_focus}'. Respeta el texto del autor y genera las preguntas sobre este fragmento."""
        else:
            return f"""Genera un fragmento narrativo original de alta calidad literaria (estilo clásico, fábula, misterio o costumbrista) y las preguntas correspondientes para dificultad '{difficulty}' con enfoque pedagógico en '{unit_focus}'."""

    def _call_ai(self, system_prompt: str, user_prompt: str) -> str:
        """
        Ejecuta la llamada a la IA con failover: Gemini Key 1 -> Gemini Key 2 -> DeepSeek.
        """
        # 1. Intentar Gemini Key 1
        if self.gemini_key_1:
            try:
                return self._call_gemini(system_prompt, user_prompt, self.gemini_key_1)
            except Exception as e:
                print(f"[AIGenerator] Gemini Key 1 failed: {e}")

        # 2. Intentar Gemini Key 2
        if self.gemini_key_2:
            try:
                return self._call_gemini(system_prompt, user_prompt, self.gemini_key_2)
            except Exception as e:
                print(f"[AIGenerator] Gemini Key 2 failed: {e}")

        # 3. Intentar DeepSeek
        if self.deepseek_key:
            try:
                return self._call_deepseek(system_prompt, user_prompt)
            except Exception as e:
                print(f"[AIGenerator] DeepSeek failed: {e}")

        raise RuntimeError("Todos los proveedores de IA fallaron al generar el ejercicio.")

    def _call_gemini(self, system_prompt: str, user_prompt: str, api_key: str) -> str:
        client = genai.Client(api_key=api_key)
        models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]
        last_err = None

        for model_name in models_to_try:
            try:
                config = types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.4,
                    response_mime_type="application/json"
                )
                response = client.models.generate_content(
                    model=model_name,
                    contents=[types.Content(role="user", parts=[types.Part.from_text(text=user_prompt)])],
                    config=config
                )
                return response.text
            except Exception as e:
                last_err = e
                continue
        raise last_err

    def _call_deepseek(self, system_prompt: str, user_prompt: str) -> str:
        import requests
        url = "https://api.deepseek.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.deepseek_key}"
        }
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.4
        }
        res = requests.post(url, headers=headers, json=payload, timeout=30)
        res.raise_for_status()
        data = res.json()
        return data['choices'][0]['message']['content']
