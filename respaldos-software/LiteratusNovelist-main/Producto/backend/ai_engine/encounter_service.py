"""
Encuentro de personajes: el lector conversa con dos personajes a la vez y ellos también entre sí.

Cada respuesta es una llamada aparte (un personaje por vez), así que el cobro y la idempotencia
siguen siendo los del chat medido. Quien habla ve lo que dijo el otro como turnos del "usuario"
con su nombre delante; lo suyo va como "assistant".
"""
import json
import re
from django.conf import settings
from .metered_service import MeteredAIService

HISTORY_SIZE = 12


def reader_name(user):
    name = (getattr(user, 'first_name', '') or getattr(user, 'username', '') or '').strip()
    return name or 'el lector'


def book_of(avatar):
    edition = getattr(avatar, 'edition', None)
    return getattr(edition, 'book', None)


def _label(name):
    # «Nombre:», «**Nombre**:» o «_Nombre_:» al comienzo de una línea.
    return r'[*_]*' + re.escape(name) + r'[*_]*\s*:\s*[*_]*'


def clean_reply(text, speaker, others):
    """Quita el nombre propio al inicio y corta si el modelo siguió escribiendo por los demás."""
    text = re.sub(r'^\s*' + _label(speaker), '', text, count=1, flags=re.IGNORECASE)
    for name in others:
        match = re.search(r'\n\s*' + _label(name), text, flags=re.IGNORECASE)
        if match:
            text = text[:match.start()]
    return text.strip()


class EncounterAIService(MeteredAIService):
    def __init__(self, speaker, other, session):
        # self.avatar es quien habla: su persona, su temperatura y su progreso de lectura (antispoiler).
        super().__init__(speaker, session)
        self.other = other
        self.reader = reader_name(session.user)

    def _encounter_context(self):
        speaker, other, reader = self.avatar, self.other, self.reader
        own_book, other_book = book_of(speaker), book_of(other)
        same_book = own_book is not None and other_book is not None and own_book.pk == other_book.pk
        origin = (f', de tu misma historia («{own_book.title}»)' if same_book
                  else f', que viene de «{other_book.title}»' if other_book else '')
        lines = [f'\nENCUENTRO: estás en una conversación a tres con {reader} (quien lee) y con {other.name}{origin}.']
        if same_book:
            lines.append(f'- {other.name} y tú se conocen según la historia; respeta hasta dónde va la lectura de {reader}.')
        else:
            lines.append(f'- {other.name} y tú no se conocen: trátalo como a alguien que acabas de conocer. '
                         'No cuentes ni inventes detalles de su historia; si te interesa, pregúntale.')
        lines += [
            f'- Habla solo como {speaker.name}. No escribas lo que dicen {other.name} ni {reader}, y no pongas tu nombre al inicio.',
            '- Reacciona a lo último que se dijo y haz avanzar la conversación: pregunta, discrepa o cuenta algo tuyo. '
            f'Puedes dirigirte a {other.name}, a {reader} o a ambos.',
            '- Sé breve: de una a tres frases (unas 70 palabras como máximo).',
        ]
        if self.session.topic:
            lines.append(f'- Tema del encuentro: {self.session.topic}.')
        return '\n'.join(lines) + '\n'

    def prepare(self, message=''):
        names = {self.avatar.pk: self.avatar.name, self.other.pk: self.other.name}
        recent = self.session.messages.exclude(role='system').order_by('-created_at')[:HISTORY_SIZE]
        turns = []
        for msg in reversed(list(recent)):
            if msg.role == 'user':
                turns.append(('user', f'{self.reader}: {msg.content}'))
            elif msg.speaker_id == self.avatar.pk:
                turns.append(('assistant', msg.content))
            else:
                turns.append(('user', f'{names.get(msg.speaker_id, self.other.name)}: {msg.content}'))
        cue = f'(Ahora habla {self.avatar.name}.)'
        turns.append(('user', f'{self.reader}: {message}\n\n{cue}' if message else cue))
        # Gemini y DeepSeek esperan turnos alternados que empiecen por el usuario.
        merged = []
        for role, text in turns:
            if merged and merged[-1]['role'] == role:
                merged[-1]['content'] += '\n\n' + text
            else:
                merged.append({'role': role, 'content': text})
        if merged[0]['role'] != 'user':
            merged.insert(0, {'role': 'user', 'content': '(Comienza el encuentro.)'})
        self.messages = [{'role': 'system', 'content': self._build_system_prompt() + self._encounter_context()}, *merged]
        # Mismo tope que MeteredAIService.prepare: se cobra solo el uso real del proveedor.
        return len(json.dumps(self.messages, ensure_ascii=False).encode('utf-8')) + 256 + settings.AI_MAX_OUTPUT_TOKENS

    def generate_metered(self):
        result = super().generate_metered()
        text = clean_reply(result['text'], self.avatar.name, [self.other.name, self.reader])
        if text:
            result['text'] = text
        return result
