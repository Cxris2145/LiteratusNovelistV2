"""
FASE 1 - recap_characters.py

Extrae SOLO los nombres y roles de los personajes de cada libro (mas el autor),
en lotes, para gastar el minimo de tokens. No toca la base de datos: vuelca todo
a json_data/characters_recap.json.

    {
      "<slug>": {
        "title": "...",
        "author": "Nombre del autor",
        "characters": [
          {"name": "...", "role": "una linea", "is_major": true},
          ...
        ]
      },
      ...
    }

Uso (desde .../Producto/backend):

    ./.venv/Scripts/python.exe -u scripts/scraping_import/recap_characters.py --limit 30      # ensayo
    ./.venv/Scripts/python.exe -u scripts/scraping_import/recap_characters.py                 # todo

Reanudable: salta libros que ya estan en el JSON o que ya tienen AIAvatar.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.db.models import Exists, OuterRef  # noqa: E402

from catalog.models import Book  # noqa: E402
from ai_engine.models import AIAvatar  # noqa: E402

from scripts.scraping_import._gemini_helper import GeminiCaller  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[2]
OUT_FILE = BACKEND_DIR / "json_data" / "characters_recap.json"


def author_name(book):
    a = book.authors.first()
    if not a:
        return "Anonimo"
    for attr in ("full_name", "name", "display_name"):
        v = getattr(a, attr, None)
        if v:
            return v
    return str(a)


def build_prompt(batch):
    lines = []
    for i, b in enumerate(batch):
        syn = (b.synopsis or "").strip().replace("\n", " ")
        if len(syn) > 240:
            syn = syn[:240] + "..."
        lines.append(f'[{i}] "{b.title}" - autor: {author_name(b)}. Sinopsis: {syn or "(no disponible)"}')
    listado = "\n".join(lines)
    return f"""Eres un experto en literatura. Para CADA obra de la lista identifica sus personajes relevantes
(protagonistas, antagonistas, secundarios importantes, narrador con voz propia). Minimo 2, maximo 6 por obra.
NO escribas biografias ni dialogos: solo nombre y un rol de UNA linea.

Devuelve UNICAMENTE este JSON:
{{"books": [
  {{"i": 0, "characters": [
    {{"name": "Nombre", "role": "rol en una linea", "is_major": true}}
  ]}}
]}}

OBRAS:
{listado}"""


def load_json(path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            print(f"  [warn] {path.name} corrupto, se reinicia.", flush=True)
    return default


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=6, help="libros por llamada (default 6)")
    ap.add_argument("--limit", type=int, default=0, help="max libros a procesar (0 = todos)")
    ap.add_argument("--sleep", type=float, default=2.0)
    ap.add_argument("--model", default="gemini-3.6-flash")
    args = ap.parse_args()

    recap = load_json(OUT_FILE, {})

    print("[i] consultando libros pendientes...", flush=True)
    has_av = AIAvatar.objects.filter(edition__book=OuterRef("pk"))
    qs = Book.objects.annotate(_h=Exists(has_av)).filter(_h=False).order_by("title")
    pending = [b for b in qs if b.slug not in recap]
    if args.limit:
        pending = pending[: args.limit]

    total = len(pending)
    if total == 0:
        print("Nada pendiente. Recap completo.", flush=True)
        return
    print(f"Libros a recapitular: {total}  (lotes de {args.batch})\n", flush=True)

    caller = GeminiCaller(args.model)
    done = 0
    chars_total = 0
    t0 = time.time()

    for start in range(0, total, args.batch):
        batch = pending[start : start + args.batch]
        titles = ", ".join(b.title[:30] for b in batch)
        print(f"[{start + 1}-{start + len(batch)}/{total}] {titles}", flush=True)

        payload, status = caller.generate_json(build_prompt(batch), max_output_tokens=8192)
        if status == "quota":
            print("\n[STOP] Cuota diaria agotada. Progreso guardado. Relanza manana.", flush=True)
            break
        if not payload or "books" not in payload:
            print("  [fail] lote sin respuesta util, se omite", flush=True)
            time.sleep(args.sleep)
            continue

        by_i = {item.get("i"): item for item in payload["books"] if isinstance(item, dict)}
        for i, book in enumerate(batch):
            item = by_i.get(i)
            chars = (item or {}).get("characters") or []
            clean = []
            for c in chars:
                nm = (c.get("name") or "").strip()
                if nm:
                    clean.append(
                        {
                            "name": nm[:250],
                            "role": (c.get("role") or "").strip()[:400],
                            "is_major": bool(c.get("is_major", True)),
                        }
                    )
            recap[book.slug] = {
                "title": book.title,
                "author": author_name(book),
                "characters": clean,
            }
            done += 1
            chars_total += len(clean)
            print(f"    {book.title[:45]:45} -> {len(clean)} personajes", flush=True)

        save_json(OUT_FILE, recap)
        time.sleep(args.sleep)

    mins = (time.time() - t0) / 60
    print("\n" + "=" * 46, flush=True)
    print(f"  recap: {done} libros nuevos, {chars_total} personajes, {mins:.1f} min", flush=True)
    print(f"  archivo: {OUT_FILE}", flush=True)
    print(f"  total en recap: {len(recap)} libros", flush=True)
    print("=" * 46, flush=True)


if __name__ == "__main__":
    main()
