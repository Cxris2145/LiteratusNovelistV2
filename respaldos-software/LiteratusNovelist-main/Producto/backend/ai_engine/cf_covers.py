"""Generador de ilustraciones de portada 100% gratis vía Cloudflare Workers AI
con fallback automático a Pollinations.ai (Flux/Turbo).

Modelo Cloudflare por defecto: @cf/black-forest-labs/flux-1-schnell.
Fallback gratuito: Pollinations.ai (sin API key requerida, ilimitado).

Claves SOLO desde settings/env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
CF_IMAGE_MODEL. Nunca hardcodeadas.
"""

from __future__ import annotations

import base64
import os
import random
import time
import urllib.parse
from dataclasses import dataclass

import requests
from django.conf import settings

DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell"


def _cfg(name: str, default=None):
    return getattr(settings, name, None) or os.environ.get(name, default)


@dataclass
class ImgResult:
    ok: bool
    image: bytes | None = None
    error: str = ""
    quota: bool = False          # True si el error es por cuota agotada
    neurons: float = 0.0
    provider: str = ""           # "cloudflare", "pollinations", etc.


class CloudflareCoverGenerator:
    def __init__(self):
        self.token = _cfg("CLOUDFLARE_API_TOKEN")
        self.account = _cfg("CLOUDFLARE_ACCOUNT_ID")
        self.model = _cfg("CF_IMAGE_MODEL", DEFAULT_MODEL)
        self.base = (
            f"https://api.cloudflare.com/client/v4/accounts/{self.account}/ai/run/"
            f"{self.model}"
        )
        self._cf_quota_exhausted = False

    def available(self) -> bool:
        return bool(self.token and self.account)

    def generate(self, prompt: str, *, steps: int = 8, timeout: int = 100,
                 provider: str = "auto", seed: int | None = None) -> ImgResult:
        """Genera imagen usando Cloudflare con fallback automático a Pollinations si hay cuota agotada o si se fuerza."""
        if provider == "pollinations" or (provider == "auto" and (self._cf_quota_exhausted or not self.available())):
            return self.generate_pollinations(prompt, seed=seed, timeout=timeout)

        # Intento primario con Cloudflare
        payload = {"prompt": prompt[:2000], "steps": max(1, min(int(steps), 8))}
        try:
            r = requests.post(
                self.base,
                headers={"Authorization": f"Bearer {self.token}",
                         "Content-Type": "application/json"},
                json=payload,
                timeout=timeout,
            )
        except requests.RequestException as e:
            if provider == "auto":
                return self.generate_pollinations(prompt, seed=seed, timeout=timeout)
            return ImgResult(False, error=f"red: {e}")

        if r.status_code == 429:
            self._cf_quota_exhausted = True
            if provider == "auto":
                return self.generate_pollinations(prompt, seed=seed, timeout=timeout)
            return ImgResult(False, error="429 cuota Workers AI agotada", quota=True, provider="cloudflare")

        try:
            d = r.json()
        except ValueError:
            if provider == "auto":
                return self.generate_pollinations(prompt, seed=seed, timeout=timeout)
            return ImgResult(False, error=f"HTTP {r.status_code}: respuesta no JSON", provider="cloudflare")

        if not d.get("success"):
            errs = d.get("errors") or []
            msg = "; ".join(str(e.get("message", e)) for e in errs) or f"HTTP {r.status_code}"
            quota = any("neuron" in str(e).lower() or "quota" in str(e).lower()
                        or e.get("code") == 3040 for e in errs)
            if quota:
                self._cf_quota_exhausted = True
            if provider == "auto":
                return self.generate_pollinations(prompt, seed=seed, timeout=timeout)
            return ImgResult(False, error=msg, quota=quota, provider="cloudflare")

        res = d.get("result") or {}
        b64 = res.get("image")
        if not b64:
            if provider == "auto":
                return self.generate_pollinations(prompt, seed=seed, timeout=timeout)
            return ImgResult(False, error="respuesta sin campo 'image'", provider="cloudflare")
        try:
            raw = base64.b64decode(b64)
        except Exception as e:
            return ImgResult(False, error=f"base64 inválido: {e}", provider="cloudflare")

        neurons = 0.0
        try:
            neurons = float((res.get("usage") or {}).get("neurons") or 0)
        except (TypeError, ValueError):
            pass

        if len(raw) < 2000 or raw[:3] not in (b"\xff\xd8\xff", b"\x89PN", b"RIF"):
            if provider == "auto":
                return self.generate_pollinations(prompt, seed=seed, timeout=timeout)
            return ImgResult(False, error=f"imagen inválida ({len(raw)} bytes)", provider="cloudflare")

        return ImgResult(True, image=raw, neurons=neurons, provider="cloudflare")

    def generate_pollinations(self, prompt: str, seed: int | None = None,
                              timeout: int = 75) -> ImgResult:
        """Generación gratuita vía Pollinations.ai (Flux/Turbo)."""
        if seed is None:
            seed = random.randint(1, 99999999)

        clean_prompt = prompt[:1200]
        encoded = urllib.parse.quote(clean_prompt)

        # Probar con model=flux primero, y fallback a turbo si es necesario
        for model in ("flux", "turbo"):
            url = (
                f"https://image.pollinations.ai/prompt/{encoded}"
                f"?width=600&height=900&model={model}&nologo=true&seed={seed}"
            )
            try:
                r = requests.get(
                    url,
                    headers={"User-Agent": "LiteratusNovelist/2.0"},
                    timeout=timeout,
                )
                if r.status_code == 200 and len(r.content) >= 2000:
                    raw = r.content
                    if raw[:3] in (b"\xff\xd8\xff", b"\x89PN", b"RIF"):
                        return ImgResult(True, image=raw, provider=f"pollinations ({model})")
            except requests.RequestException:
                continue

        return ImgResult(False, error="Pollinations no respondió o devolvió imagen inválida", provider="pollinations")

    def generate_with_retry(self, prompt: str, *, steps: int = 8, retries: int = 3,
                            backoff: float = 4.0, provider: str = "auto",
                            seed: int | None = None) -> ImgResult:
        last = ImgResult(False, error="sin intentos")
        for attempt in range(retries):
            last = self.generate(prompt, steps=steps, provider=provider, seed=seed)
            if last.ok:
                return last
            if last.quota and provider == "cloudflare":
                return last
            time.sleep(backoff * (attempt + 1))
        return last

