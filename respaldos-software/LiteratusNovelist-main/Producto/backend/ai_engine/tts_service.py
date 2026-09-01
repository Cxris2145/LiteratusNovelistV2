import requests
import os
import base64


class TTSService:
    """
    Servicio de integración con ElevenLabs para Texto-a-Voz (TTS).

    Estrategia de dos niveles:
    1. Intenta el endpoint /with-timestamps (planes de pago) → alineación perfecta.
    2. Si falla (plan gratuito), usa el endpoint estándar → timestamps estimados.
    """

    URL_WITH_TS = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"
    URL_SIMPLE  = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

    # Lista de voice_ids a probar en orden (actualizada 2025)
    # Si el primero da 404, se prueba el siguiente automáticamente.
    FALLBACK_VOICE_IDS = [
        "J8BF9c7OgbHiqagCNoEj",  # Carito - Conversational (voz de tu cuenta ✅)
        "cgSgspJ2msm6clMCkdW9",  # Jessica
        "FGY2WhTYpPnrIDTdsKH5",  # Laura
        "TX3LPaxmHKxFdv7VOQHJ",  # Liam
        "XB0fDUnXU5powFXDhCwa",  # Charlotte
        "Xb7hH8MSUJpSbSDYk0k2",  # Alice
        "nPczCjzI2devNBz1zQrb",  # Brian
        "onwK4e9ZLuTAKqWW03F9",  # Daniel
    ]

    # Velocidad de habla estimada (chars/segundo ≈ 5 chars/palabra × 2.5 palabras/seg)
    CHARS_PER_SECOND = 12.5

    def __init__(self):
        self.api_key = os.environ.get('ELEVENLABS_API_KEY', 'PLACEHOLDER_KEY')

    def _headers(self):
        return {
            "Content-Type": "application/json",
            "xi-api-key": self.api_key,
        }

    def _payload(self, text: str) -> dict:
        clean = text.strip()[:4000]
        return {
            "text": clean,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.8,
                "style": 0.0,
                "use_speaker_boost": True,
            },
        }

    def generate_audio(self, text: str, voice_id: str = None):
        """
        Genera audio para el texto dado.
        Retorna: (audio_base64: str, alignment: dict)
        """
        if self.api_key == 'PLACEHOLDER_KEY':
            return self._mock(text)

        # Construir lista de voces a intentar
        ids_to_try = []
        if voice_id:
            ids_to_try.append(voice_id)
        ids_to_try.extend(self.FALLBACK_VOICE_IDS)

        payload = self._payload(text)
        headers = self._headers()
        clean_text = payload["text"]

        # ── Nivel 1: Intentar con timestamps (plan de pago) ─────────────
        for vid in ids_to_try:
            url = self.URL_WITH_TS.format(voice_id=vid)
            try:
                r = requests.post(url, json=payload, headers=headers, timeout=30)
                if r.status_code == 200:
                    data = r.json()
                    print(f"ElevenLabs /with-timestamps OK con voz {vid}")
                    return data.get('audio_base64'), data.get('alignment')
                if r.status_code == 402:
                    raise Exception("ELEVENLABS_PLAN_REQUIRED")
                if r.status_code == 404:
                    print(f"Voz {vid} no encontrada en /with-timestamps, probando siguiente...")
                    continue
                print(f"ElevenLabs /with-timestamps error {r.status_code}: {r.text[:200]}")
                break
            except requests.exceptions.RequestException as e:
                print(f"Error de red /with-timestamps: {e}")
                break

        # ── Nivel 2: Endpoint estándar gratuito ─────────────────────────
        for vid in ids_to_try:
            url = self.URL_SIMPLE.format(voice_id=vid)
            try:
                r = requests.post(url, json=payload, headers=headers, timeout=30)
                if r.status_code == 200:
                    audio_b64 = base64.b64encode(r.content).decode('utf-8')
                    alignment = self._estimate_alignment(clean_text)
                    print(f"ElevenLabs /simple OK con voz {vid} (timestamps estimados)")
                    return audio_b64, alignment
                if r.status_code == 402:
                    raise Exception("ELEVENLABS_PLAN_REQUIRED")
                if r.status_code == 404:
                    print(f"Voz {vid} no encontrada en /simple, probando siguiente...")
                    continue
                # Error no-404 → levantar excepción legible
                try:
                    msg = r.json().get('detail', {}).get('message', r.text[:300])
                except Exception:
                    msg = r.text[:300]
                raise Exception(f"ElevenLabs Error {r.status_code}: {msg}")
            except requests.exceptions.RequestException as e:
                raise Exception(f"Error de conexión con ElevenLabs: {e}")

        raise Exception(
            "No se encontró ninguna voz disponible en tu cuenta de ElevenLabs. "
            "Entra a elevenlabs.io → Voice Lab y añade una voz a tu biblioteca."
        )

    def _estimate_alignment(self, text: str) -> dict:
        """Timestamps aproximados a velocidad de habla normal."""
        chars = list(text)
        n = len(chars)
        spc = 1.0 / self.CHARS_PER_SECOND
        return {
            "characters": chars,
            "character_start_times_seconds": [i * spc for i in range(n)],
            "character_end_times_seconds":   [(i + 1) * spc for i in range(n)],
        }

    def _mock(self, text: str):
        """Respuesta simulada para desarrollo sin API Key."""
        mock_b64 = (
            "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA"
            "//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAA"
        )
        return mock_b64, self._estimate_alignment(text)
