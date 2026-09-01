"""
ai_engine/kokoro_service.py — Servicio TTS con Kokoro-82M via Hugging Face Space.

Arquitectura:
    Llama al endpoint /v1/audio/speech del microservicio Kokoro FastAPI
    desplegado en Hugging Face Spaces (CPU gratuito, 16 GB RAM).
    Retorna audio MP3 codificado en base64, compatible con el frontend existente.

Variables de entorno requeridas:
    KOKORO_API_URL — URL base del HF Space (sin slash final).
                     Ejemplo: https://tu-usuario-kokoro-fastapi.hf.space
"""

import requests
import os
import base64
import re


# Mapa de voces disponibles en Kokoro para referencia rápida
KOKORO_VOICES = {
    # Voces femeninas (af_ = American Female)
    'af_bella': 'Bella — expresiva y cálida',
    'af_nicole': 'Nicole — clara y natural',
    'af_sarah': 'Sarah — suave y pausada',
    'af_sky': 'Sky — joven y enérgica',
    'af_heart': 'Heart — emotiva',
    # Voces masculinas (em_ = English Male, funciona bien en español)
    'em_alex': 'Alex — grave y autoritario',
    'em_santa': 'Santa — cálido y pausado',
    'em_ryan': 'Ryan — neutral y profesional',
}

DEFAULT_VOICE = 'af_bella'


class KokoroTTSService:
    """
    Servicio de integración con Kokoro-82M via API REST.

    Estrategia de robustez:
    1. Intenta con la voz asignada al personaje.
    2. Si falla, intenta con la voz por defecto (af_bella).
    3. Si el Space está despierto, la latencia es ~1-2s por frase corta.
    """

    def __init__(self):
        self.api_url = os.environ.get('KOKORO_API_URL', '').rstrip('/')
        self.timeout = 20  # 20s — el Space puede tardar en arrancar

    def is_available(self) -> bool:
        """Verifica si el servicio está configurado."""
        return bool(self.api_url)

    def generate_audio_base64(self, text: str, voice_id: str = DEFAULT_VOICE) -> str:
        """
        Genera audio para el texto dado.
        Retorna: audio MP3 codificado en base64.
        Lanza: Exception si el servicio no está disponible o falla.
        """
        if not self.is_available():
            raise Exception(
                "KOKORO_API_URL no configurada. "
                "Añade la variable de entorno en Render apuntando a tu HF Space."
            )

        clean_text = self._clean_text(text)
        if not clean_text:
            return ''

        # Truncar a 500 chars para evitar latencias altas
        if len(clean_text) > 500:
            clean_text = clean_text[:497] + '...'

        payload = {
            "model": "kokoro",
            "input": clean_text,
            "voice": voice_id,
            "response_format": "mp3",
            "speed": 1.0,
        }

        # Intentar con la voz asignada, luego con la de defecto
        voices_to_try = [voice_id]
        if voice_id != DEFAULT_VOICE:
            voices_to_try.append(DEFAULT_VOICE)

        last_error = None
        for voice in voices_to_try:
            payload['voice'] = voice
            try:
                response = requests.post(
                    f"{self.api_url}/v1/audio/speech",
                    json=payload,
                    timeout=self.timeout,
                )

                if response.status_code == 200:
                    audio_b64 = base64.b64encode(response.content).decode('utf-8')
                    print(f"Kokoro TTS OK — voz: {voice}, chars: {len(clean_text)}")
                    return audio_b64

                last_error = Exception(
                    f"Kokoro HTTP {response.status_code}: {response.text[:200]}"
                )
                print(f"Kokoro TTS falló con voz {voice}: {last_error}")

            except requests.exceptions.Timeout:
                last_error = Exception(
                    "Kokoro TTS timeout — el Space puede estar iniciando (cold start). "
                    "Espera 30s y vuelve a intentar."
                )
                break
            except requests.exceptions.ConnectionError as e:
                last_error = Exception(f"No se pudo conectar con el Space de Kokoro: {e}")
                break
            except requests.exceptions.RequestException as e:
                last_error = Exception(f"Error de red con Kokoro: {e}")
                break

        raise last_error or Exception("Kokoro TTS falló por razón desconocida.")

    def _clean_text(self, text: str) -> str:
        """Limpia el texto antes de enviarlo: elimina markdown y caracteres inútiles."""
        # Eliminar markdown bold/italic
        text = re.sub(r'\*{1,2}(.*?)\*{1,2}', r'\1', text)
        text = re.sub(r'_{1,2}(.*?)_{1,2}', r'\1', text)
        # Eliminar texto entre corchetes (narración de acción como *[pausa]*)
        text = re.sub(r'\[.*?\]', '', text)
        # Eliminar líneas que empiecen con # (títulos markdown)
        text = re.sub(r'^\s*#+\s*', '', text, flags=re.MULTILINE)
        # Normalizar espacios
        text = re.sub(r'\s+', ' ', text).strip()
        return text
