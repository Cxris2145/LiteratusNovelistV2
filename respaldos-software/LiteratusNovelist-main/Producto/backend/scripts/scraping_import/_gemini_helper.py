"""
_gemini_helper.py  -  cliente Gemini compartido por los scripts de personajes.

- carga GOOGLE_API_KEY y GOOGLE_API_KEY_2 desde settings / entorno
- health-check: descarta llaves que no pueden usar el modelo objetivo
- generate_json(): devuelve (obj_parseado, status)  con status in {"ok","fail","quota"}
- rota de llave cuando una se queda sin cuota (429 / RESOURCE_EXHAUSTED)
"""
import json
import os
import time

from django.conf import settings
from google import genai
from google.genai import types

FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-2.5-flash"]


class GeminiCaller:
    def __init__(self, model, health_check=True):
        self.model = model
        self.models_to_try = [model] + [m for m in FALLBACK_MODELS if m != model]
        raw = [
            getattr(settings, "GOOGLE_API_KEY", None) or os.environ.get("GOOGLE_API_KEY"),
            getattr(settings, "GOOGLE_API_KEY_2", None) or os.environ.get("GOOGLE_API_KEY_2"),
        ]
        keys = [k for k in raw if k]
        if not keys:
            raise SystemExit("No hay GOOGLE_API_KEY ni GOOGLE_API_KEY_2 en el entorno / .env")

        self.clients = []
        for i, k in enumerate(keys, 1):
            cli = genai.Client(api_key=k)
            if not health_check:
                self.clients.append(cli)
                continue
            try:
                cli.models.generate_content(model=model, contents="ok")
                self.clients.append(cli)
                print(f"[i] llave Gemini #{i}: OK", flush=True)
            except Exception as e:
                print(f"[i] llave Gemini #{i}: DESCARTADA ({repr(e)[:90]})", flush=True)
        if not self.clients:
            raise SystemExit(f"Ninguna llave Gemini puede usar el modelo {model}.")
        self.key_idx = 0
        print(f"[i] {len(self.clients)} llave(s) util(es). Modelo: {model}", flush=True)

    def _rotate(self):
        if len(self.clients) > 1:
            self.key_idx = (self.key_idx + 1) % len(self.clients)
            print(f"  [rot] -> llave Gemini #{self.key_idx + 1}", flush=True)

    def generate_json(self, prompt_text, max_retries=5, max_output_tokens=16384):
        """Devuelve (obj, status). status: 'ok' | 'fail' | 'quota'."""
        config = types.GenerateContentConfig(
            temperature=0.7,
            response_mime_type="application/json",
            max_output_tokens=max_output_tokens,
        )
        quota_hits = 0
        for attempt in range(1, max_retries + 1):
            client = self.clients[self.key_idx]
            model_name = self.models_to_try[min(attempt - 1, len(self.models_to_try) - 1)]
            try:
                resp = client.models.generate_content(
                    model=model_name, contents=prompt_text, config=config
                )
                raw = (resp.text or "").strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                return json.loads(raw), "ok"
            except json.JSONDecodeError as e:
                print(f"  [warn] JSON invalido (intento {attempt}): {e}", flush=True)
                time.sleep(2)
            except Exception as e:
                msg = str(e)
                if "RESOURCE_EXHAUSTED" in msg or "429" in msg or "quota" in msg.lower():
                    quota_hits += 1
                    if len(self.clients) > 1 and quota_hits <= len(self.clients):
                        print(f"  [quota] llave #{self.key_idx + 1} agotada. Rotando...", flush=True)
                        self._rotate()
                        time.sleep(3)
                        continue
                    print("  [quota] limite diario alcanzado en todas las llaves.", flush=True)
                    return None, "quota"
                if "503" in msg or "UNAVAILABLE" in msg or "overloaded" in msg.lower():
                    wait = 15 * attempt
                    print(f"  [503] modelo saturado (intento {attempt}). Espero {wait}s...", flush=True)
                    time.sleep(wait)
                    continue
                print(f"  [warn] error API (intento {attempt}): {msg[:160]}", flush=True)
                time.sleep(4)
        return None, "fail"
