"""
catalog/management/commands/generate_covers.py

Genera portadas con IA (pollinations.ai — gratis, sin API key) para cada
subcarpeta <slug>/ que no tenga `cover.jpg`. Es scripts .../Automatizaciones/
generar_portadas_ia.py convertido en comando, con rutas por parámetro.

Los prompts salen de un JSON con objetos {slug, title, author, prompt}. Si un
slug no está en el JSON se arma un prompt genérico ("oil painting of <título>").

Esto SOLO escribe archivos cover.jpg en disco. Para subirlos a Supabase y
enlazarlos en la base usa después:  python manage.py upload_covers_supabase

Uso:
    python manage.py generate_covers --source ../../books
    python manage.py generate_covers --source ../../books --prompts "../../Automatizaciones/Creacion de Portadas_basicas/books_to_generate.json"
    python manage.py generate_covers --source ../../books --limit 10 --overwrite
"""

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

GEN_URL = "https://image.pollinations.ai/prompt/{prompt}?width=800&height=800&nologo=true&seed={seed}"


class Command(BaseCommand):
    help = "Genera cover.jpg con IA (pollinations.ai) para libros sin portada."

    def add_arguments(self, parser):
        parser.add_argument("--source", required=True, help="Carpeta con subcarpetas <slug>/")
        parser.add_argument("--prompts", default=None, help="JSON [{slug,title,author,prompt}] con prompts.")
        parser.add_argument("--limit", type=int, default=0, help="Genera como máximo N portadas.")
        parser.add_argument("--overwrite", action="store_true", help="Regenera aunque ya exista cover.jpg.")
        parser.add_argument("--delay", type=float, default=1.0, help="Segundos entre peticiones.")

    def handle(self, *args, **opts):
        src = Path(opts["source"]).expanduser().resolve()
        if not src.is_dir():
            raise CommandError(f"--source no existe: {src}")
        w = self.stdout.write

        prompt_map = {}
        if opts["prompts"]:
            pf = Path(opts["prompts"]).expanduser()
            if not pf.exists():
                raise CommandError(f"--prompts no existe: {pf}")
            for item in json.loads(pf.read_text(encoding="utf-8")):
                if item.get("slug"):
                    prompt_map[item["slug"]] = item

        folders = sorted(f for f in src.iterdir() if f.is_dir())
        targets = [f for f in folders if opts["overwrite"] or not (f / "cover.jpg").exists()]
        if opts["limit"]:
            targets = targets[: opts["limit"]]
        w(f"Carpetas: {len(folders)} | sin portada: {len(targets)}")

        ok = fail = 0
        for i, folder in enumerate(targets, 1):
            slug = folder.name
            info = prompt_map.get(slug)
            if info and info.get("prompt"):
                prompt = info["prompt"]
                title = info.get("title", slug)
            else:
                title = slug.replace("-", " ").title()
                prompt = (
                    f"A masterpiece oil painting of {slug.replace('-', ' ')}. "
                    "Cinematic lighting, rich textures, fine art style, atmospheric. "
                    "STRICTLY NO TEXT, NO LETTERS, NO SIGNATURES, NO WORDS."
                )
            url = GEN_URL.format(prompt=urllib.parse.quote(prompt), seed=i * 13)
            w(f"[{i}/{len(targets)}] {title}")
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = resp.read()
                if len(data) < 1000:
                    raise RuntimeError(f"respuesta muy pequeña ({len(data)} bytes)")
                (folder / "cover.jpg").write_bytes(data)
                ok += 1
                time.sleep(opts["delay"])
            except Exception as exc:  # noqa: BLE001
                fail += 1
                w(f"   ! {exc}")

        w(self.style.SUCCESS(f"\nGeneradas {ok}, fallidas {fail}."))
