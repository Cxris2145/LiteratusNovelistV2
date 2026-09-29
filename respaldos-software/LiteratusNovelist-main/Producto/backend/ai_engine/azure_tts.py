"""
ai_engine/azure_tts.py — Síntesis de voz con Azure AI Speech (plan gratuito F0).

Dos vías contra el mismo servicio:
- REST (`synthesize_mp3`): devuelve solo el MP3. La usa el chat de personajes.
- WebSocket (`SynthesisSession`): el endpoint que usa el SDK oficial de JavaScript.
  Devuelve el MP3 y el instante exacto de cada palabra, que el lector usa para
  resaltar el texto. No usamos el SDK de Python porque en Linux exige libasound2,
  que el runtime nativo de Render no trae.

Variables de entorno: AZURE_SPEECH_KEY y AZURE_SPEECH_REGION (ver settings.py).
"""
import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import requests
from django.conf import settings
from websockets.exceptions import ConnectionClosed, InvalidStatus, WebSocketException
from websockets.sync.client import connect

OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
TICKS_PER_SECOND = 10_000_000  # Azure mide los tiempos en unidades de 100 ns

AZURE_VOICE_RE = re.compile(r'^[a-z]{2,3}-[A-Z]{2}-\w+Neural$')
DEFAULT_KOKORO_VOICE = 'af_bella'  # valor por defecto de AIAvatar.kokoro_voice_id

# Voces estables (GA) en español para personajes, variadas en país y timbre.
FEMALE_VOICES = [
    'es-CL-CatalinaNeural', 'es-MX-DaliaNeural', 'es-ES-ElviraNeural', 'es-AR-ElenaNeural',
    'es-CO-SalomeNeural', 'es-ES-AbrilNeural', 'es-MX-RenataNeural', 'es-UY-ValentinaNeural',
]
MALE_VOICES = [
    'es-CL-LorenzoNeural', 'es-MX-JorgeNeural', 'es-ES-AlvaroNeural', 'es-AR-TomasNeural',
    'es-CO-GonzaloNeural', 'es-ES-EliasNeural', 'es-MX-CecilioNeural', 'es-UY-MateoNeural',
]

# Palabras con género gramatical claro que aparecen en nombres y descripciones de personajes.
_MALE_WORDS = frozenset("""
    él autor narrador amigo hijo padre hermano esposo marido hombre niño anciano viejo señor don
    rey príncipe caballero capitán doctor profesor médico sacerdote monje fraile soldado guerrero
    héroe villano dios divino poeta escritor filósofo compañero criado sirviente campesino conde
    duque marqués barón emperador tío abuelo nieto sobrino primo novio pastor juez abogado
    científico inventor explorador detective ladrón pirata marinero pescador cazador profeta santo
    mago brujo hechicero gigante enano ogro lobo zorro león gato perro caballo burro ratón gallo
    toro oso cuervo sapo mercader obispo cura rabino jefe general coronel sargento
    alcalde gobernador tirano bandido verdugo viajero hidalgo escudero esclavo
""".split())
_FEMALE_WORDS = frozenset("""
    ella autora narradora amiga hija madre hermana esposa mujer niña anciana vieja señora doña
    reina princesa dama doctora profesora sacerdotisa monja heroína villana diosa divina poetisa
    escritora filósofa compañera criada sirvienta campesina condesa duquesa marquesa baronesa
    emperatriz tía abuela nieta sobrina prima novia pastora jueza abogada científica exploradora
    ladrona profetisa santa maga bruja hechicera hada ninfa virgen musa sirena loba zorra leona
    gata perra yegua paloma golondrina liebre cigarra hormiga viajera esclava madrastra doncella
""".split())
_MALE_PREFIXES = ('el ', 'don ', 'señor ', 'sr. ', 'fray ', 'san ', 'rey ', 'príncipe ', 'sir ',
                  'lord ', 'mr. ', 'monsieur ', 'capitán ', 'padre ', 'tío ', 'doctor ', 'profesor ')
_FEMALE_PREFIXES = ('la ', 'doña ', 'señora ', 'sra. ', 'sor ', 'santa ', 'reina ', 'princesa ',
                    'lady ', 'miss ', 'mrs. ', 'madame ', 'madre ', 'tía ', 'doctora ', 'profesora ')


class AzureTTSError(Exception):
    """La síntesis falló (clave inválida, red, respuesta inesperada)."""


class AzureTTSQuotaError(AzureTTSError):
    """Se agotó el cupo mensual o se superó el límite de solicitudes por minuto."""


@dataclass
class WordTiming:
    text: str
    start: float  # segundos desde el inicio del audio de esa síntesis
    end: float


def is_configured():
    return bool(settings.AZURE_SPEECH_KEY and settings.AZURE_SPEECH_REGION)


def voice_locale(voice):
    """'es-CL-CatalinaNeural' -> 'es-CL'."""
    return '-'.join(voice.split('-')[:2])


def build_ssml(body, voice):
    """Envuelve `body` (texto ya escapado, puede traer etiquetas <break/>) en SSML."""
    return (
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' "
        f"xml:lang='{voice_locale(voice)}'><voice name='{voice}'>{body}</voice></speak>"
    )


def clean_text_for_speech(text):
    """Quita markdown y acotaciones entre corchetes de las respuestas del chat."""
    text = re.sub(r'\*{1,2}(.*?)\*{1,2}', r'\1', text)
    text = re.sub(r'_{1,2}(.*?)_{1,2}', r'\1', text)
    text = re.sub(r'\[.*?\]', '', text)
    text = re.sub(r'^\s*#+\s*', '', text, flags=re.MULTILINE)
    return re.sub(r'\s+', ' ', text).strip()


def guess_gender(name, description):
    """Adivina el género gramatical de un personaje ('male', 'female' o None)."""
    name_l = (name or '').strip().lower()
    if name_l.startswith(_FEMALE_PREFIXES):
        return 'female'
    if name_l.startswith(_MALE_PREFIXES):
        return 'male'

    # La primera palabra con género suele ser el rol ("Hija del rey..."): pesa más.
    score, first_seen = 0, False
    for word in re.findall(r'[a-záéíóúüñ]+', f"{name_l} {(description or '').lower()}"):
        sign = 1 if word in _MALE_WORDS else -1 if word in _FEMALE_WORDS else 0
        if sign:
            score += sign * (1 if first_seen else 3)
            first_seen = True
    if score > 0:
        return 'male'
    if score < 0:
        return 'female'
    return None


def voice_for_avatar(avatar):
    """
    Voz de Azure para un personaje. Prioridad:
    1. Una voz de Azure escrita en `kokoro_voice_id` (ej. 'es-MX-JorgeNeural').
    2. El género de una voz de Kokoro elegida a mano ('em_alex' -> masculina).
    3. El género deducido del nombre y la descripción.
    La voz concreta dentro del grupo se fija por el id, así cada personaje suena siempre igual.
    """
    if avatar is None:
        return settings.AZURE_TTS_NARRATOR_VOICE

    configured = (avatar.kokoro_voice_id or '').strip()
    if AZURE_VOICE_RE.match(configured):
        return configured

    gender = None
    if configured and configured != DEFAULT_KOKORO_VOICE and len(configured) > 1 and configured[1] in 'fm':
        gender = 'female' if configured[1] == 'f' else 'male'
    gender = gender or guess_gender(avatar.name, avatar.description)

    seed = int(hashlib.md5(str(avatar.pk).encode()).hexdigest(), 16)
    if gender is None:
        gender = 'male' if seed % 2 else 'female'
    pool = MALE_VOICES if gender == 'male' else FEMALE_VOICES
    return pool[(seed // 7) % len(pool)]


def _headers(**extra):
    return {
        'Ocp-Apim-Subscription-Key': settings.AZURE_SPEECH_KEY,
        'User-Agent': 'literatus-novelist',
        **extra,
    }


def _status_error(status_code, body=''):
    if status_code == 429 or 'quota' in (body or '').lower():
        return AzureTTSQuotaError('Se agotó el cupo de voz de Azure por ahora.')
    if status_code in (401, 403):
        return AzureTTSError('Azure rechazó la clave o la región configuradas.')
    return AzureTTSError(f'Azure respondió con el estado {status_code}.')


def synthesize_mp3(text, voice, timeout=30):
    """Sintetiza texto plano con REST y devuelve los bytes del MP3."""
    if not is_configured():
        raise AzureTTSError('Azure Speech no está configurado.')

    ssml = build_ssml(_escape(text), voice)
    try:
        response = requests.post(
            f'https://{settings.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1',
            headers=_headers(**{
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
            }),
            data=ssml.encode('utf-8'),
            timeout=timeout,
        )
    except requests.RequestException as e:
        raise AzureTTSError(f'No se pudo conectar con Azure: {e}') from e

    if response.status_code != 200:
        raise _status_error(response.status_code, response.text[:300])
    return response.content


def _escape(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _timestamp():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def _header_value(raw_headers, name):
    prefix = name.lower() + ':'
    for line in raw_headers.split('\r\n'):
        if line.lower().startswith(prefix):
            return line.split(':', 1)[1].strip()
    return ''


def _word_timings(metadata_body):
    try:
        items = json.loads(metadata_body).get('Metadata', [])
    except ValueError:
        return []
    timings = []
    for item in items:
        if item.get('Type') != 'WordBoundary':
            continue
        data = item.get('Data') or {}
        start = data.get('Offset', 0) / TICKS_PER_SECOND
        timings.append(WordTiming(
            text=(data.get('text') or {}).get('Text', ''),
            start=start,
            end=start + data.get('Duration', 0) / TICKS_PER_SECOND,
        ))
    return timings


class SynthesisSession:
    """
    Conexión WebSocket con Azure para sintetizar varios fragmentos seguidos.

        with SynthesisSession() as session:
            mp3_bytes, word_timings = session.synthesize(ssml)

    Cada síntesis admite hasta 10 minutos de audio; los tiempos de cada palabra
    son relativos al inicio de su propio fragmento.
    """

    _SYNTHESIS_CONTEXT = json.dumps({'synthesis': {'audio': {
        'metadataOptions': {
            'wordBoundaryEnabled': True,
            'sentenceBoundaryEnabled': False,
            'punctuationBoundaryEnabled': False,
            'bookmarkEnabled': False,
            'visemeEnabled': False,
        },
        'outputFormat': OUTPUT_FORMAT,
    }}})

    def __init__(self, open_timeout=15, recv_timeout=90):
        self.open_timeout = open_timeout
        self.recv_timeout = recv_timeout
        self._ws = None

    def __enter__(self):
        if not is_configured():
            raise AzureTTSError('Azure Speech no está configurado.')
        url = (
            f'wss://{settings.AZURE_SPEECH_REGION}.tts.speech.microsoft.com'
            f'/cognitiveservices/websocket/v1?X-ConnectionId={uuid.uuid4().hex}'
        )
        try:
            self._ws = connect(url, additional_headers=_headers(), open_timeout=self.open_timeout)
        except InvalidStatus as e:
            raise _status_error(e.response.status_code) from e
        except (OSError, WebSocketException) as e:
            raise AzureTTSError(f'No se pudo conectar con Azure: {e}') from e

        self._send('speech.config', 'application/json', json.dumps({'context': {'system': {
            'name': 'SpeechSDK', 'version': '1.0.0', 'build': 'Python', 'lang': 'Python',
        }}}))
        return self

    def __exit__(self, *exc_info):
        if self._ws is not None:
            try:
                self._ws.close()
            except Exception:
                pass

    def synthesize(self, ssml):
        request_id = uuid.uuid4().hex
        self._send('synthesis.context', 'application/json', self._SYNTHESIS_CONTEXT, request_id)
        self._send('ssml', 'application/ssml+xml', ssml, request_id)

        audio, words = bytearray(), []
        try:
            while True:
                message = self._ws.recv(timeout=self.recv_timeout)
                if isinstance(message, bytes):
                    header_len = int.from_bytes(message[:2], 'big')
                    header = message[2:2 + header_len].decode('utf-8', 'replace')
                    if _header_value(header, 'Path') == 'audio':
                        audio += message[2 + header_len:]
                    continue
                raw_headers, _, body = message.partition('\r\n\r\n')
                path = _header_value(raw_headers, 'Path')
                if path == 'audio.metadata':
                    words.extend(_word_timings(body))
                elif path == 'turn.end':
                    break
        except TimeoutError as e:
            raise AzureTTSError('Azure tardó demasiado en responder.') from e
        except ConnectionClosed as e:
            raise self._closed_error(e) from e

        if not audio:
            raise AzureTTSError('Azure no devolvió audio.')
        return bytes(audio), words

    def _send(self, path, content_type, body, request_id=None):
        headers = [f'X-Timestamp:{_timestamp()}']
        if request_id:
            headers.append(f'X-RequestId:{request_id}')
        headers += [f'Path:{path}', f'Content-Type:{content_type}']
        try:
            self._ws.send('\r\n'.join(headers) + '\r\n\r\n' + body)
        except ConnectionClosed as e:
            raise self._closed_error(e) from e

    @staticmethod
    def _closed_error(error):
        reason = (error.rcvd.reason if error.rcvd else '') or ''
        code = error.rcvd.code if error.rcvd else None
        if code in (1013, 4429) or any(k in reason.lower() for k in ('quota', 'throttl', 'too many')):
            return AzureTTSQuotaError('Se agotó el cupo de voz de Azure por ahora.')
        return AzureTTSError(f'Azure cerró la conexión: {reason or error}')
