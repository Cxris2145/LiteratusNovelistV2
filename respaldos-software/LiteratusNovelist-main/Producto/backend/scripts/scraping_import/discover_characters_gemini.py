"""
discover_characters_gemini.py

Port de `auto_discover_characters.py` que usa **Google Gemini** en lugar de
DeepSeek (cuya cuenta quedo sin saldo). Mantiene el mismo contrato:

  - crea filas AIAvatar (personajes + opcionalmente el avatar del autor)
  - vuelca los prompts visuales en json_data/characters_to_generate.json
  - es reanudable: solo procesa libros que aun no tienen ningun AIAvatar

Uso (desde .../Producto/backend):

    ./.venv/Scripts/python.exe scripts/scraping_import/discover_characters_gemini.py --limit 2 --dry-run
    ./.venv/Scripts/python.exe scripts/scraping_import/discover_characters_gemini.py --limit 10
    ./.venv/Scripts/python.exe scripts/scraping_import/discover_characters_gemini.py          # tanda completa

Flags principales:
    --limit N          procesa como maximo N libros pendientes
    --dry-run          llama a la IA pero NO escribe en la base de datos
    --model NOMBRE     modelo Gemini (default: gemini-2.5-flash)
    --sleep SEG        pausa entre libros (default: 4.0)  -> respeta el rate limit del free tier
    --no-author        no crea el avatar del autor
    --min-synopsis N   si la sinopsis tiene < N chars, adjunta un extracto del primer capitulo (default: 120)
    --excerpt-chars N  tamanio del extracto de capitulo (default: 2500)
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.db import transaction  # noqa: E402
from django.db.models import Exists, OuterRef  # noqa: E402

from catalog.models import Book, Chapter  # noqa: E402
from ai_engine.models import AIAvatar  # noqa: E402

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROGRESS_FILE = BACKEND_DIR / "json_data" / "characters_to_generate.json"
FAILED_FILE = BACKEND_DIR / "json_data" / "characters_failed_gemini.json"

FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-flash-latest"]


# --------------------------------------------------------------------------- #
#  Gemini client con rotacion de llaves
# --------------------------------------------------------------------------- #
class GeminiCaller:
    def __init__(self, model):
        self.model = model
        self.models_to_try = [model] + [m for m in FALLBACK_MODELS if m != model]
        keys = [
            getattr(settings, "GOOGLE_API_KEY", None) or os.environ.get("GOOGLE_API_KEY"),
            getattr(settings, "GOOGLE_API_KEY_2", None) or os.environ.get("GOOGLE_API_KEY_2"),
        ]
        self.keys = [k for k in keys if k]
        if not self.keys:
            raise SystemExit("No hay GOOGLE_API_KEY ni GOOGLE_API_KEY_2 en el entorno / .env")
        self.key_idx = 0
        # Health-check: descarta llaves que no pueden usar el modelo objetivo.
        good = []
        for i, k in enumerate(self.keys, 1):
            try:
                cli = genai.Client(api_key=k)
                cli.models.generate_content(model=model, contents="ok")
                good.append(cli)
                print(f"[i] llave Gemini #{i}: OK")
            except Exception as e:
                print(f"[i] llave Gemini #{i}: DESCARTADA ({repr(e)[:90]})")
        if not good:
            raise SystemExit(f"Ninguna llave Gemini puede usar el modelo {model}.")
        self.clients = good
        print(f"[i] {len(self.clients)} llave(s) util(es). Modelo: {model}")

    def _rotate_key(self):
        if len(self.clients) > 1:
            self.key_idx = (self.key_idx + 1) % len(self.clients)
            print(f"  [rot] cambiando a la llave Gemini #{self.key_idx + 1}")

    def generate_json(self, prompt_text, max_retries=4):
        """Devuelve (obj, status). status: 'ok' | 'fail' | 'quota'."""
        config = types.GenerateContentConfig(
            temperature=0.7,
            response_mime_type="application/json",
            max_output_tokens=16384,
        )
        attempt = 0
        quota_hits = 0
        while attempt < max_retries:
            attempt += 1
            client = self.clients[self.key_idx]
            model_name = self.models_to_try[min(attempt - 1, len(self.models_to_try) - 1)]
            try:
                resp = client.models.generate_content(
                    model=model_name,
                    contents=prompt_text,
                    config=config,
                )
                raw = (resp.text or "").strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                return json.loads(raw), "ok"
            except json.JSONDecodeError as e:
                print(f"  [warn] JSON invalido (intento {attempt}): {e}")
                time.sleep(3)
            except Exception as e:
                msg = str(e)
                is_quota = "RESOURCE_EXHAUSTED" in msg or "429" in msg or "quota" in msg.lower()
                if is_quota:
                    quota_hits += 1
                    # Si hay 2da llave, prueba con ella una vez antes de rendirse.
                    if len(self.clients) > 1 and quota_hits <= len(self.clients):
                        print(f"  [quota] llave #{self.key_idx + 1} agotada. Rotando...")
                        self._rotate_key()
                        time.sleep(5)
                        continue
                    print("  [quota] limite diario alcanzado en todas las llaves.")
                    return None, "quota"
                print(f"  [warn] error API (intento {attempt}): {msg[:200]}")
                time.sleep(5)
        return None, "fail"


# --------------------------------------------------------------------------- #
#  DeepSeek client (mismo interfaz .generate_json -> (obj, status))
# --------------------------------------------------------------------------- #
class DeepSeekCaller:
    URL = "https://api.deepseek.com/chat/completions"

    def __init__(self, model="deepseek-chat"):
        import requests  # local

        self._requests = requests
        self.model = model
        self.key = getattr(settings, "DEEPSEEK_API_KEY", None) or os.environ.get("DEEPSEEK_API_KEY")
        if not self.key:
            raise SystemExit("No hay DEEPSEEK_API_KEY en el entorno / .env")
        # health-check
        try:
            r = self._requests.post(
                self.URL,
                headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": "ok"}], "max_tokens": 3},
                timeout=30,
            )
            if r.status_code == 402:
                raise SystemExit("DeepSeek: saldo insuficiente (HTTP 402). Recarga la cuenta.")
            r.raise_for_status()
            print(f"[i] DeepSeek OK. Modelo: {model}", flush=True)
        except SystemExit:
            raise
        except Exception as e:
            raise SystemExit(f"DeepSeek no responde: {repr(e)[:150]}")

    def generate_json(self, prompt_text, max_retries=4):
        headers = {"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "Eres un experto literario y psicologo de personajes. Responde SOLO con JSON valido."},
                {"role": "user", "content": prompt_text},
            ],
            "temperature": 0.7,
            "max_tokens": 3500,
            "response_format": {"type": "json_object"},
        }
        for attempt in range(1, max_retries + 1):
            try:
                r = self._requests.post(self.URL, headers=headers, json=payload, timeout=120)
                if r.status_code == 402:
                    print("  [saldo] DeepSeek sin saldo (HTTP 402).", flush=True)
                    return None, "quota"
                if r.status_code == 429:
                    wait = 10 * attempt
                    print(f"  [429] rate limit, espero {wait}s...", flush=True)
                    time.sleep(wait)
                    continue
                r.raise_for_status()
                raw = r.json()["choices"][0]["message"]["content"].strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                return json.loads(raw), "ok"
            except json.JSONDecodeError as e:
                print(f"  [warn] JSON invalido (intento {attempt}): {e}", flush=True)
                time.sleep(3)
            except Exception as e:
                print(f"  [warn] error API (intento {attempt}): {repr(e)[:160]}", flush=True)
                time.sleep(5)
        return None, "fail"


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #
def strip_html(html):
    if not html:
        return ""
    if BeautifulSoup:
        return BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
    return re.sub(r"<[^>]+>", " ", html)


def get_excerpt(book, n_chars):
    ch = (
        Chapter.objects.filter(book=book, is_active=True)
        .order_by("order")
        .first()
    )
    if not ch:
        return ""
    return strip_html(ch.content_html)[:n_chars]


def author_name(book):
    a = book.authors.first()
    if not a:
        return "Anonimo"
    for attr in ("full_name", "name", "display_name"):
        v = getattr(a, attr, None)
        if v:
            return v
    return str(a)


def build_prompt(book, want_author, min_syn, excerpt_chars):
    synopsis = (book.synopsis or "").strip()
    context = f"Sinopsis: {synopsis}" if len(synopsis) >= min_syn else ""
    if len(synopsis) < min_syn:
        exc = get_excerpt(book, excerpt_chars)
        if exc:
            context = f"Sinopsis: {synopsis or '(no disponible)'}\n\nExtracto del inicio de la obra:\n\"\"\"\n{exc}\n\"\"\""

    author_block = ""
    if want_author:
        author_block = (
            f' Incluye tambien UNA entrada para el AUTOR real ("{author_name(book)}") '
            f'con "is_author": true, como si conversara sobre su obra.'
        )

    return f"""Experto literario. Obra: "{book.title}" de {author_name(book)}.
{context}

Da los 4-6 personajes MAS importantes (protagonista, antagonista, y secundarios clave; narrador si tiene voz propia).{author_block}

Cada objeto con estas claves, BREVE:
- "name": nombre.
- "description": rol en la historia, 1 frase.
- "system_prompt": personalidad en 1ra persona (tono, epoca, actitud). 2-3 frases.
- "behavioral_context": deseo o miedo principal. 1 frase.
- "sample_dialogues": 1-2 frases en su voz.
- "greeting_message": su saludo al lector, 1 frase.
- "visual_prompt": retrato fisico para Stable Diffusion, EN INGLES, 1 frase.
- "is_major": true/false.
- "is_author": true solo para la entrada del autor.

Responde SOLO JSON: {{"characters": [ {{...}} ]}}"""


def parse_characters(payload):
    """Acepta {"characters":[...]}, o directamente una lista."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("characters", "results", "personajes", "data"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def load_json(path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            print(f"  [warn] {path.name} corrupto, se reinicia.")
    return default


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# --------------------------------------------------------------------------- #
#  Main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description="Genera el catalogo de personajes con Gemini.")
    ap.add_argument("--limit", type=int, default=0, help="max libros a procesar (0 = todos)")
    ap.add_argument("--dry-run", action="store_true", help="no escribe en la BD")
    ap.add_argument("--provider", choices=["gemini", "deepseek"], default="gemini")
    ap.add_argument("--model", default="", help="modelo (default: segun provider)")
    ap.add_argument("--sleep", type=float, default=4.0, help="pausa entre libros (s)")
    ap.add_argument("--no-author", action="store_true", help="no crear avatar del autor")
    ap.add_argument("--min-synopsis", type=int, default=120)
    ap.add_argument("--excerpt-chars", type=int, default=1200)
    args = ap.parse_args()

    print("[i] consultando libros pendientes...", flush=True)
    has_avatar = AIAvatar.objects.filter(edition__book=OuterRef("pk"))
    qs = Book.objects.annotate(_has=Exists(has_avatar)).filter(_has=False).order_by("title")
    if args.limit:
        qs = qs[: args.limit]
    pending = list(qs)

    total = len(pending)
    if total == 0:
        print("\nTodos los libros ya tienen personajes. Nada que hacer.")
        return

    print(f"Libros pendientes: {total}  provider={args.provider}  (dry_run={args.dry_run})\n", flush=True)

    if args.provider == "deepseek":
        caller = DeepSeekCaller(args.model or "deepseek-chat")
    else:
        caller = GeminiCaller(args.model or "gemini-2.5-flash")
    visual_tasks = load_json(PROGRESS_FILE, [])
    failed = load_json(FAILED_FILE, [])
    known_failed = {f["slug"] for f in failed if isinstance(f, dict) and "slug" in f}

    ok_books = 0
    ko_books = 0
    n_chars = 0
    t0 = time.time()

    for i, book in enumerate(pending, 1):
        print(f"[{i}/{total}] {book.title}")
        edition = book.editions.first()
        if not edition:
            print("  [skip] sin edicion asociada")
            ko_books += 1
            continue

        payload, status = caller.generate_json(
            build_prompt(book, not args.no_author, args.min_synopsis, args.excerpt_chars)
        )

        if status == "quota":
            print("\n[STOP] Cuota diaria de Gemini agotada. Progreso guardado.")
            print("       Vuelve a lanzar el mismo comando manana; retoma donde quedo.")
            break

        chars = parse_characters(payload)
        if not chars:
            print("  [fail] la IA no devolvio personajes")
            ko_books += 1
            if book.slug not in known_failed:
                failed.append({"slug": book.slug, "title": book.title})
                save_json(FAILED_FILE, failed)
            time.sleep(args.sleep)
            continue

        created_here = 0
        with transaction.atomic():
            for ch in chars:
                name = (ch.get("name") or "").strip()[:250]
                if not name:
                    continue
                if AIAvatar.objects.filter(edition=edition, name=name).exists():
                    continue
                if args.dry_run:
                    print(f"    (dry) {name}  is_author={bool(ch.get('is_author'))}")
                    created_here += 1
                    continue
                avatar = AIAvatar.objects.create(
                    edition=edition,
                    name=name,
                    description=ch.get("description", "")[:5000],
                    system_prompt=ch.get("system_prompt") or f"Eres {name}.",
                    behavioral_context=ch.get("behavioral_context", ""),
                    sample_dialogues=ch.get("sample_dialogues", ""),
                    greeting_message=ch.get("greeting_message") or "Hola, viajero.",
                    is_major_character=bool(ch.get("is_major", True)),
                    is_author=bool(ch.get("is_author", False)),
                    unlock_at_chapter=0,
                )
                visual_tasks.append(
                    {
                        "id": str(avatar.id),
                        "name": avatar.name,
                        "book": book.title,
                        "prompt": ch.get("visual_prompt") or f"Portrait of {avatar.name}, literary character",
                    }
                )
                created_here += 1
                print(f"    + {name}{'  [autor]' if avatar.is_author else ''}")

        if created_here:
            ok_books += 1
            n_chars += created_here
            if not args.dry_run:
                save_json(PROGRESS_FILE, visual_tasks)
        else:
            ko_books += 1

        time.sleep(args.sleep)

    mins = (time.time() - t0) / 60
    print("\n" + "=" * 48)
    print("  REPORTE  discover_characters_gemini")
    print("=" * 48)
    print(f"  tiempo           : {mins:.1f} min")
    print(f"  libros con exito : {ok_books}")
    print(f"  libros con error : {ko_books}")
    print(f"  personajes creados: {n_chars}")
    print(f"  progreso visual  : {PROGRESS_FILE}")
    if failed:
        print(f"  fallidos         : {FAILED_FILE} ({len(failed)})  -> re-ejecuta el script para reintentar")
    print("=" * 48)


if __name__ == "__main__":
    main()
