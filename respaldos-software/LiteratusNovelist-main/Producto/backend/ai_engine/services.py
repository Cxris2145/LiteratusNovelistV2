import os
import re
import requests
import json
from google import genai
from google.genai import types
from django.conf import settings
from django.db.models import Q
from .models import ChatMessage

class AIService:
    """
    Orquestador de IA con soporte Multi-Provider y Failover.
    Gemini (2 keys) -> DeepSeek.
    """
    def __init__(self, avatar, session):
        self.avatar = avatar
        self.session = session
        
        # API Keys
        self.gemini_key_1 = getattr(settings, 'GOOGLE_API_KEY', os.environ.get('GOOGLE_API_KEY'))
        self.gemini_key_2 = getattr(settings, 'GOOGLE_API_KEY_2', os.environ.get('GOOGLE_API_KEY_2'))
        self.deepseek_key = getattr(settings, 'DEEPSEEK_API_KEY', os.environ.get('DEEPSEEK_API_KEY'))

    def generate_reply(self, new_message_content):
        """
        Intenta generar una respuesta recorriendo los proveedores disponibles.
        """
        # 1. Intentar Gemini Key 1 (2 Ink)
        if self.gemini_key_1:
            try:
                text = self._call_gemini(new_message_content, self.gemini_key_1)
                return {"text": text, "provider": "gemini", "cost": 2, "status": "ok"}
            except Exception as e:
                print(f"Gemini Key 1 failed: {e}")

        # 2. Intentar Gemini Key 2 (2 Ink) - Failover
        if self.gemini_key_2:
            try:
                text = self._call_gemini(new_message_content, self.gemini_key_2)
                return {"text": text, "provider": "gemini", "cost": 2, "status": "ok"}
            except Exception as e:
                print(f"Gemini Key 2 failed: {e}")

        # 3. Intentar DeepSeek (1 Ink) - Backup
        if self.deepseek_key:
            try:
                text = self._call_deepseek(new_message_content)
                return {"text": text, "provider": "deepseek", "cost": 1, "status": "warning"}
            except Exception as e:
                print(f"DeepSeek failed: {e}")

        # Si todo falla
        return {
            "text": "Lo siento, mi conexión con el mundo espiritual está débil ahora mismo. (Error de API)",
            "provider": "none",
            "cost": 0,
            "status": "error"
        }

    def _call_gemini(self, content, api_key):
        client = genai.Client(api_key=api_key)
        
        # Lista de modelos ACTUALIZADA para 2026 basada en el diagnóstico
        models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]
        last_err = None

        for model_name in models_to_try:
            try:
                system_prompt = self._build_system_prompt()
                history = self._format_history()
                config = types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=float(self.avatar.temperature)
                )
                
                response = client.models.generate_content(
                    model=model_name,
                    contents=history + [types.Content(role="user", parts=[types.Part.from_text(text=content)])],
                    config=config
                )
                return response.text
            except Exception as e:
                last_err = e
                print(f"Attempt with {model_name} failed: {e}")
                continue
        
        # Si todos los modelos de esta llave fallan, lanzamos la última excepción
        raise last_err

    def _call_deepseek(self, content):
        # DeepSeek Chat API (OpenAI Compatible)
        url = "https://api.deepseek.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.deepseek_key}"
        }
        
        # Reconstruir historial para DeepSeek
        messages = [{"role": "system", "content": self._build_system_prompt()}]
        for msg in self._format_history(limit=8): # Menos historial para ahorrar
            role = "user" if msg.role == "user" else "assistant"
            # Extraer texto de la estructura Content de Gemini si viene de _format_history
            msg_text = msg.parts[0].text if hasattr(msg, 'parts') else str(msg)
            messages.append({"role": role, "content": msg_text})
        
        messages.append({"role": "user", "content": content})

        payload = {
            "model": "deepseek-chat",
            "messages": messages,
            "temperature": float(self.avatar.temperature),
            "max_tokens": 512 # Limitar para ahorrar
        }

        response = requests.post(url, headers=headers, json=payload, timeout=20)
        response.raise_for_status()
        return response.json()['choices'][0]['message']['content']

    def _build_system_prompt(self):
        base_prompt = f"Eres {self.avatar.name}. \n\nDirectrices:\n{self.avatar.system_prompt}\n"
        if self.avatar.behavioral_context:
            base_prompt += f"\nContexto emocional:\n{self.avatar.behavioral_context}\n"
        
        base_prompt += "\nREGLA: No digas que eres IA. Mantén la inmersión total."
            
        return base_prompt

    def _format_history(self, limit=10):
        history_qs = self.session.messages.order_by('-created_at')[:limit]
        messages = reversed(list(history_qs))
        
        gemini_history = []
        for msg in messages:
            g_role = "user" if msg.role == ChatMessage.RoleChoices.USER else "model"
            gemini_history.append(
                types.Content(
                    role=g_role,
                    parts=[types.Part.from_text(text=msg.content)]
                )
            )
        return gemini_history


ASSISTANT_SYSTEM_PROMPT = """Eres el Asistente de Literatus Novelist, un guía mágico que vive dentro de la plataforma de lectura Literatus Novelist y ayuda a los usuarios a usarla.

SOLO puedes responder preguntas relacionadas con Literatus Novelist, por ejemplo:
- Cómo usar las funciones y pantallas de la app
- El catálogo de libros y las categorías/géneros
- La biblioteca personal del usuario y su progreso de lectura
- La lectura, los capítulos y las herramientas de accesibilidad (lectura asistida, TDAH, etc.)
- Los personajes con IA y cómo chatear con ellos
- La narración por voz/audio de los libros
- La Tinta (la moneda interna de la app: qué es, cómo se consigue, cómo se gasta)
- Compras dentro de Literatus
- La configuración de la cuenta y el perfil
- Cómo moverse entre las distintas secciones de la plataforma

Si te preguntan algo SIN relación con Literatus Novelist (clima, noticias, tareas de otra app, temas personales ajenos a la plataforma, etc.), respóndeles en 1-2 frases que solo puedes ayudar con temas de Literatus Novelist, sin intentar responder la pregunta externa ni dar el dato de todos modos.

Responde siempre en español, de forma cálida, breve y clara (2-4 frases salvo que te pidan una explicación paso a paso). No digas que eres un modelo de lenguaje ni menciones proveedores de IA; simplemente eres "el Asistente de Literatus".

IMPORTANTE sobre libros concretos: NO conoces de memoria el catálogo real de Literatus (cambia constantemente). Nunca afirmes ni niegues por tu cuenta que un libro existe en la plataforma. Guíate ÚNICAMENTE por los resultados de "Búsqueda en el catálogo real" que se te entreguen más abajo en este mensaje: si un libro aparece ahí, coméntalo con esa información; si el usuario pregunta por un título y no aparece ningún resultado, dile honestamente que no lo encuentras en el catálogo (no inventes que sí está, ni que definitivamente no existe si no se hizo una búsqueda).{section_context}{catalog_context}"""


class AssistantAIService:
    """
    Orquestador de IA para el Asistente global de la plataforma (guía de uso).

    Deliberadamente separado de AIService: AIService está acoplado a un AIAvatar
    (system_prompt/temperatura/edición propios de un personaje de ficción), y
    forzar aquí un avatar falso ensuciaría esa tabla. Replica el mismo patrón de
    resiliencia multi-proveedor (Gemini key 1 -> key 2 -> DeepSeek) con un
    system prompt fijo, restringido a temas de la plataforma.
    """
    def __init__(self, conversation):
        self.conversation = conversation

        self.gemini_key_1 = getattr(settings, 'GOOGLE_API_KEY', os.environ.get('GOOGLE_API_KEY'))
        self.gemini_key_2 = getattr(settings, 'GOOGLE_API_KEY_2', os.environ.get('GOOGLE_API_KEY_2'))
        self.deepseek_key = getattr(settings, 'DEEPSEEK_API_KEY', os.environ.get('DEEPSEEK_API_KEY'))

    def generate_reply(self, new_message_content, section=''):
        if self.gemini_key_1:
            try:
                return self._call_gemini(new_message_content, section, self.gemini_key_1)
            except Exception as e:
                print(f"[Assistant] Gemini Key 1 failed: {e}")

        if self.gemini_key_2:
            try:
                return self._call_gemini(new_message_content, section, self.gemini_key_2)
            except Exception as e:
                print(f"[Assistant] Gemini Key 2 failed: {e}")

        if self.deepseek_key:
            try:
                return self._call_deepseek(new_message_content, section)
            except Exception as e:
                print(f"[Assistant] DeepSeek failed: {e}")

        return "Ahora mismo no logro conectar con mi magia. Intenta de nuevo en un momento."

    def _call_gemini(self, content, section, api_key):
        client = genai.Client(api_key=api_key)
        models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]
        last_err = None
        system_prompt = self._build_system_prompt(section, content)

        for model_name in models_to_try:
            try:
                config = types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.4
                )
                response = client.models.generate_content(
                    model=model_name,
                    contents=self._format_history() + [types.Content(role="user", parts=[types.Part.from_text(text=content)])],
                    config=config
                )
                return response.text
            except Exception as e:
                last_err = e
                continue

        raise last_err

    def _call_deepseek(self, content, section):
        url = "https://api.deepseek.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.deepseek_key}"
        }

        messages = [{"role": "system", "content": self._build_system_prompt(section, content)}]
        for msg in self._format_history(limit=8):
            role = "user" if msg.role == "user" else "assistant"
            msg_text = msg.parts[0].text if hasattr(msg, 'parts') else str(msg)
            messages.append({"role": role, "content": msg_text})
        messages.append({"role": "user", "content": content})

        payload = {
            "model": "deepseek-chat",
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": 400
        }

        response = requests.post(url, headers=headers, json=payload, timeout=20)
        response.raise_for_status()
        return response.json()['choices'][0]['message']['content']

    def _build_system_prompt(self, section='', user_message=''):
        section_context = f"\n\nContexto actual: el usuario está ahora mismo en la sección \"{section}\" de la app." if section else ""
        catalog_context = self._search_catalog_snippets(user_message)
        return ASSISTANT_SYSTEM_PROMPT.format(section_context=section_context, catalog_context=catalog_context)

    # Palabras demasiado genéricas para usarlas como criterio de búsqueda de título
    # (ruido de la propia pregunta del usuario, no del libro que busca).
    _SEARCH_STOPWORDS = {
        'para', 'como', 'este', 'esta', 'estos', 'estas', 'sobre', 'donde',
        'cual', 'cuales', 'quien', 'quiere', 'quieres', 'puedo', 'puedes',
        'trata', 'libro', 'libros', 'existe', 'busco', 'quisiera', 'gustaria',
        'interesa', 'catalogo', 'plataforma', 'literatus', 'hola', 'gracias',
        'alguno', 'alguna', 'tienen', 'tienes', 'sabes', 'dime', 'cuentame',
    }

    def _search_catalog_snippets(self, message, limit=5):
        """
        Ancla la respuesta del LLM en el catálogo REAL de libros: sin esto, el
        modelo termina adivinando (o alucinando) si un título existe o no.
        Extrae palabras significativas del mensaje y busca coincidencias de
        título reales; el resultado (o su ausencia) se inyecta en el system
        prompt para que la respuesta sobre disponibilidad sea siempre veraz.
        """
        if not message:
            return ''

        from catalog.models import Book

        words = re.findall(r"[A-Za-zÀ-ÿ]{4,}", message)
        terms = [w for w in words if w.lower() not in self._SEARCH_STOPWORDS]
        if not terms:
            return ''

        query = Q()
        for term in terms[:6]:
            query |= Q(title__icontains=term)

        matches = list(
            Book.objects.filter(query, is_published=True)
            .prefetch_related('genres', 'book_authors__author')
            .distinct()[:limit]
        )

        if not matches:
            return (
                "\n\nBúsqueda en el catálogo real: no se encontró ningún libro que "
                "coincida con lo que menciona el usuario."
            )

        lines = []
        for b in matches:
            main_author = next(
                (ba.author.full_name for ba in b.book_authors.all() if ba.role == 'author'),
                None
            )
            genres = ', '.join(g.name for g in b.genres.all()[:3]) or 'sin categoría asignada'
            synopsis = (b.synopsis[:180] + '…') if b.synopsis and len(b.synopsis) > 180 else (b.synopsis or '')
            lines.append(f'- "{b.title}" de {main_author or "autor desconocido"} ({genres}): {synopsis}')

        return (
            "\n\nBúsqueda en el catálogo real (usa ÚNICAMENTE estos libros reales para "
            "confirmar disponibilidad; no asumas que existen otros títulos fuera de "
            "esta lista):\n" + "\n".join(lines)
        )

    def _format_history(self, limit=10):
        history_qs = self.conversation.messages.order_by('-created_at')[:limit]
        messages = reversed(list(history_qs))

        gemini_history = []
        for msg in messages:
            g_role = "user" if msg.role == "user" else "model"
            gemini_history.append(
                types.Content(
                    role=g_role,
                    parts=[types.Part.from_text(text=msg.content)]
                )
            )
        return gemini_history

