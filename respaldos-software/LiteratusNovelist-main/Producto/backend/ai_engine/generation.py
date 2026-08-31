"""Helpers de generación con IA para tareas por lotes (sinopsis + ilustración de portada).

Espeja el patrón de failover multi-proveedor de ``ai_engine.services.AIService``
(Gemini clave 1 -> Gemini clave 2 -> DeepSeek para texto), pero como funciones
libres, sin acoplarse a ``avatar``/``session``.

Claves: SOLO desde ``django.conf.settings`` u ``os.environ``. Nunca hardcodeadas.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import requests
from django.conf import settings

try:
    from google import genai
    from google.genai import types
except Exception:  # pragma: no cover - el SDK está en requirements
    genai = None
    types = None


TEXT_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"


def image_model() -> str:
    return getattr(settings, "GEMINI_IMAGE_MODEL", None) or os.environ.get(
        "GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"
    )


@dataclass
class GenResult:
    ok: bool
    value: "str | bytes | None"
    provider: str          # gemini_1 | gemini_2 | deepseek | none
    model: str
    error: str = ""


def _gemini_keys() -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for tag, attr in (("gemini_1", "GOOGLE_API_KEY"), ("gemini_2", "GOOGLE_API_KEY_2")):
        key = getattr(settings, attr, None) or os.environ.get(attr)
        if key:
            out.append((tag, key))
    return out


def _deepseek_key() -> str | None:
    return getattr(settings, "DEEPSEEK_API_KEY", None) or os.environ.get("DEEPSEEK_API_KEY")


def providers_available() -> dict:
    return {
        "gemini_keys": [t for t, _ in _gemini_keys()],
        "deepseek": bool(_deepseek_key()),
        "image_model": image_model(),
        "sdk": genai is not None,
    }


# --------------------------------------------------------------------------- #
# Texto (sinopsis)                                                            #
# --------------------------------------------------------------------------- #
def generate_text(
    prompt: str,
    *,
    system_instruction: str,
    temperature: float = 0.7,
    max_output_tokens: int = 400,
    timeout: int = 45,
) -> GenResult:
    """Gemini clave1 -> clave2 (ciclando TEXT_MODELS) -> DeepSeek. Devuelve texto limpio."""
    last_err = "sin proveedores configurados"

    if genai is not None:
        for tag, key in _gemini_keys():
            try:
                client = genai.Client(api_key=key)
            except Exception as e:  # pragma: no cover
                last_err = f"{tag}/client: {e}"
                continue
            for model in TEXT_MODELS:
                try:
                    cfg = types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=temperature,
                        max_output_tokens=max_output_tokens,
                    )
                    resp = client.models.generate_content(
                        model=model,
                        contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
                        config=cfg,
                    )
                    text = (getattr(resp, "text", None) or "").strip()
                    if text:
                        return GenResult(True, text, tag, model)
                    last_err = f"{tag}/{model}: respuesta vacía"
                except Exception as e:
                    last_err = f"{tag}/{model}: {e}"

    dk = _deepseek_key()
    if dk:
        try:
            r = requests.post(
                DEEPSEEK_URL,
                headers={"Authorization": f"Bearer {dk}", "Content-Type": "application/json"},
                json={
                    "model": "deepseek-chat",
                    "temperature": temperature,
                    "max_tokens": max_output_tokens,
                    "messages": [
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": prompt},
                    ],
                },
                timeout=timeout,
            )
            r.raise_for_status()
            text = (r.json()["choices"][0]["message"]["content"] or "").strip()
            if text:
                return GenResult(True, text, "deepseek", "deepseek-chat")
            last_err = "deepseek: respuesta vacía"
        except Exception as e:
            last_err = f"deepseek: {e}"

    return GenResult(False, None, "none", "", last_err)


# --------------------------------------------------------------------------- #
# Imagen (ilustración de portada)                                             #
# --------------------------------------------------------------------------- #
def _extract_image_bytes(resp) -> bytes | None:
    """Recorre las partes de la respuesta de google-genai buscando datos de imagen."""
    try:
        candidates = getattr(resp, "candidates", None) or []
        for cand in candidates:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", None) or []
            for part in parts:
                inline = getattr(part, "inline_data", None) or getattr(part, "inlineData", None)
                data = getattr(inline, "data", None) if inline else None
                if data:
                    return data if isinstance(data, (bytes, bytearray)) else bytes(data)
    except Exception:
        return None
    return None


def generate_cover_image(prompt: str, *, aspect_ratio: str = "2:3", timeout: int = 90) -> GenResult:
    """``gemini-2.5-flash-image`` en clave1 -> clave2. Devuelve bytes de imagen (PNG/JPEG).

    Sin respaldo DeepSeek (no genera imágenes): ``ok=False`` -> el llamador usa la
    ruta procedural.
    """
    if genai is None:
        return GenResult(False, None, "none", image_model(), "SDK google-genai no disponible")

    model = image_model()
    last_err = "sin claves Gemini configuradas"
    for tag, key in _gemini_keys():
        try:
            client = genai.Client(api_key=key)
            try:
                cfg = types.GenerateContentConfig(response_modalities=["IMAGE"])
            except Exception:
                cfg = types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
            resp = client.models.generate_content(model=model, contents=[prompt], config=cfg)
            data = _extract_image_bytes(resp)
            if data:
                return GenResult(True, data, tag, model)
            last_err = f"{tag}: la respuesta no contenía imagen"
        except Exception as e:
            last_err = f"{tag}: {e}"
    return GenResult(False, None, "none", model, last_err)
