"""catalog/management/commands/generate_ai_covers.py

Genera ilustraciones originales por libro con Cloudflare Workers AI (flux-1-schnell,
100% gratis) y compone la portada final Literatus con Pillow (título/autor añadidos
por código, NUNCA por la IA).

Flujo:  Book -> scene prompt -> Cloudflare (ilustración) -> compositor Literatus -> portada final

Ejemplos:
    python manage.py generate_ai_covers --limit 5
    python manage.py generate_ai_covers --batch-size 20
    python manage.py generate_ai_covers --missing-only
    python manage.py generate_ai_covers --book-id la-metamorfosis-kafka-franz
    python manage.py generate_ai_covers --resume
    python manage.py generate_ai_covers --regenerate --book-id frankenstein-mary-shelley
"""

from __future__ import annotations

import json
import shutil
import sys
import time
import uuid as _uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from PIL import Image

from ai_engine.cf_covers import CloudflareCoverGenerator
from catalog.covers.engine import build_cover_context, palette_for, render_literatus_cover
from catalog.covers.scene_prompt import build_scene_prompt
from catalog.models import Book

CHECKPOINT_NAME = "COVER_GENERATION_CHECKPOINT.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Command(BaseCommand):
    help = "Genera ilustraciones IA (Cloudflare, gratis) y portadas Literatus por libro."

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=20)
        parser.add_argument("--limit", type=int, default=None,
                            help="Procesa como máximo N libros en esta ejecución.")
        parser.add_argument("--missing-only", action="store_true",
                            help="Solo libros sin portada IA final válida.")
        parser.add_argument("--book-id", type=str, default=None, help="UUID o slug de un libro.")
        parser.add_argument("--resume", action="store_true",
                            help="Continúa desde el checkpoint (comportamiento por defecto).")
        parser.add_argument("--regenerate", action="store_true",
                            help="Rehace aunque ya exista portada IA / esté 'completed'.")
        parser.add_argument("--provider", choices=["auto", "cloudflare", "pollinations"], default="auto",
                            help="Proveedor de imagen: 'auto' (Cloudflare con fallback a Pollinations), 'cloudflare', o 'pollinations'.")
        parser.add_argument("--steps", type=int, default=4,
                            help="Pasos del modelo (1-8). flux-schnell rinde bien con 4 y "
                                 "consume la mitad de cuota gratis que con 8.")
        parser.add_argument("--sleep", type=float, default=1.0,
                            help="Segundos entre llamadas (cuidar la cuota gratis).")
        parser.add_argument("--no-backup", action="store_true",
                            help="Omite el backup SQLite (solo para --book-id / pruebas).")

    # --------------------------------------------------------------------- #
    def handle(self, *args, **o):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

        from django.conf import settings
        media = Path(settings.MEDIA_ROOT)
        project_root = Path(settings.BASE_DIR).parent.parent
        self.art_dir = media / "book_covers" / "generated" / "art"
        self.final_dir = media / "book_covers" / "generated" / "final"
        self.art_dir.mkdir(parents=True, exist_ok=True)
        self.final_dir.mkdir(parents=True, exist_ok=True)
        self.ckpt_path = project_root / CHECKPOINT_NAME

        gen = CloudflareCoverGenerator()
        if o["provider"] == "cloudflare" and not gen.available():
            raise CommandError("Faltan CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID en .env para proveedor 'cloudflare'")

        ckpt = self._load_ckpt()
        books = self._select_books(o, ckpt)
        if o["limit"]:
            books = books[: o["limit"]]
        total = len(books)
        if not total:
            self.stdout.write("No hay libros pendientes. Nada que hacer.")
            return

        if not o["no_backup"] and not o["book_id"]:
            self._backup_db(project_root, settings)

        ckpt.setdefault("total_books", Book.objects.count())
        ckpt["started_at"] = ckpt.get("started_at") or _now()
        ckpt.setdefault("failed_slugs", [])
        self.stdout.write(f"A procesar en esta ejecución: {total}  (batch-size {o['batch_size']}, proveedor: {o['provider']})")

        done = ok = failed = skipped = 0
        durations: list[float] = []
        stop_reason = None

        for i, book in enumerate(books, 1):
            t0 = time.time()
            status, msg = self._process_book(book, gen, steps=o["steps"], regenerate=o["regenerate"], provider=o["provider"])
            dt = time.time() - t0
            done += 1

            if status == "ok":
                ok += 1
                durations.append(dt)
                prov_str = f" [{msg}]" if msg else ""
                self.stdout.write(f"[{i:04d}/{total:04d}] {book.slug}  OK{prov_str}  ({dt:.1f}s)")
            elif status == "skip":
                skipped += 1
                self.stdout.write(f"[{i:04d}/{total:04d}] {book.slug}  SKIP  ({msg})")
            elif status == "quota":
                stop_reason = "cuota agotada"
                self.stdout.write(self.style.WARNING(
                    f"[{i:04d}/{total:04d}] {book.slug}  CUOTA AGOTADA -> me detengo, reanuda luego"))
                break
            else:
                failed += 1
                if book.slug not in ckpt["failed_slugs"]:
                    ckpt["failed_slugs"].append(book.slug)
                self.stdout.write(self.style.WARNING(
                    f"[{i:04d}/{total:04d}] {book.slug}  FAILED  ({msg})"))

            # checkpoint
            ckpt["processed"] = ckpt.get("processed", 0) + (1 if status != "skip" else 0)
            ckpt["successful"] = ckpt.get("successful", 0) + (1 if status == "ok" else 0)
            ckpt["failed"] = len(ckpt["failed_slugs"])
            ckpt["current_book"] = book.slug
            ckpt["last_book_id"] = str(book.id)
            ckpt["updated_at"] = _now()
            if i % max(1, min(o["batch_size"], 10)) == 0 or i == total:
                self._save_ckpt(ckpt)

            if o["sleep"] and status in ("ok", "failed") and i < total:
                time.sleep(o["sleep"])

        self._save_ckpt(ckpt)
        avg = sum(durations) / len(durations) if durations else 0.0
        self.stdout.write("\n" + "=" * 12 + " RESUMEN PORTADAS IA " + "=" * 12)
        self.stdout.write(f"Total libros (catálogo): {ckpt.get('total_books')}")
        self.stdout.write(f"Procesados esta corrida: {done}")
        self.stdout.write(f"Generadas:               {ok}")
        self.stdout.write(f"Fallidas:                {failed}")
        self.stdout.write(f"Omitidas:                {skipped}")
        self.stdout.write(f"Tiempo promedio/imagen:  {avg:.1f}s")
        self.stdout.write(f"Último libro:            {ckpt.get('current_book')}")
        self.stdout.write(f"Acumulado OK (checkpoint): {ckpt.get('successful', 0)} / {ckpt.get('total_books')}")
        if stop_reason:
            self.stdout.write(self.style.WARNING(f"\nDetenido: {stop_reason}. "
                                                 f"Vuelve a lanzar el comando para continuar."))
        self.stdout.write(f"Checkpoint: {self.ckpt_path}")

    # --------------------------------------------------------------------- #
    def _process_book(self, book, gen, *, steps, regenerate, provider="auto"):
        final_path = self.final_dir / f"{book.slug}.webp"
        rel_final = f"book_covers/generated/final/{book.slug}.webp"

        if not regenerate and final_path.exists() and final_path.stat().st_size > 5000:
            try:
                with Image.open(final_path) as im:
                    if im.size == (600, 900):
                        if (book.cover_image.name or "") != rel_final:
                            Book.objects.filter(pk=book.pk).update(cover_image=rel_final)
                        return "skip", "ya existe portada IA"
            except Exception:
                pass

        authors = ", ".join(a.full_name for a in book.authors.all())
        genres = ", ".join(g.name for g in book.genres.all())
        prompt = build_scene_prompt(title=book.title, authors=authors, genres=genres,
                                    synopsis=book.synopsis or "")

        ctx = build_cover_context(book)
        res = gen.generate_with_retry(prompt, steps=steps, retries=3, provider=provider, seed=ctx["seed"])
        if not res.ok:
            return ("quota", res.error) if res.quota else ("failed", f"gen: {res.error}")

        # QC ilustración
        try:
            art = Image.open(BytesIO(res.image))
            art.load()
        except Exception as e:
            return "failed", f"ilustración ilegible: {e}"
        if min(art.size) < 512:
            return "failed", f"ilustración pequeña {art.size}"
        lo, hi = art.convert("L").getextrema()
        if hi - lo < 10:
            return "failed", "ilustración casi de color sólido"

        art_path = self.art_dir / f"{book.slug}_art.jpg"
        try:
            art_path.write_bytes(res.image)
        except OSError as e:
            return "failed", f"no se pudo guardar arte: {e}"

        # Compositor Literatus
        try:
            final = render_literatus_cover(
                title=ctx["title"], authors=ctx["authors"], book_code=ctx["book_code"],
                seed=ctx["seed"], symbol=ctx["symbol"],
                palette=palette_for(ctx["seed"], ctx.get("palette_family")),
                art_background=art.convert("RGB"), with_medallion=False)
        except Exception as e:
            return "failed", f"compositor: {e}"

        # QC final
        if final.size != (600, 900):
            return "failed", f"portada final {final.size} != 600x900"
        try:
            final.save(final_path, "WEBP", quality=88, method=6)
        except OSError as e:
            return "failed", f"no se pudo guardar portada: {e}"
        if final_path.stat().st_size < 5000:
            return "failed", "portada final demasiado pequeña"

        with transaction.atomic():
            Book.objects.filter(pk=book.pk).update(cover_image=rel_final)
        book.cover_image = rel_final
        return "ok", res.provider

    # --------------------------------------------------------------------- #
    def _select_books(self, o, ckpt):
        qs = Book.objects.prefetch_related("authors", "genres").order_by("slug")
        if o["book_id"]:
            val = str(o["book_id"]).strip()
            cond = None
            try:
                cond = Book.objects.filter(id=_uuid.UUID(val))
            except (ValueError, TypeError):
                cond = None
            books = list(qs.filter(slug=val)) or (list(cond) if cond is not None else [])
            if not books:
                raise CommandError(f"No se encontró el libro: {val}")
            return books

        books = list(qs)
        if o["regenerate"]:
            return books

        completed = set(ckpt.get("completed_slugs", []))
        if o["missing_only"] or o["resume"] or True:  # por defecto, saltar los ya hechos
            out = []
            for b in books:
                fp = self.final_dir / f"{b.slug}.webp"
                if b.slug in completed and fp.exists():
                    continue
                if fp.exists() and fp.stat().st_size > 5000:
                    continue
                out.append(b)
            return out
        return books

    def _load_ckpt(self) -> dict:
        if self.ckpt_path.exists():
            try:
                return json.loads(self.ckpt_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return {"processed": 0, "successful": 0, "failed": 0, "failed_slugs": [],
                "completed_slugs": []}

    def _save_ckpt(self, ckpt: dict):
        # mantiene la lista de completados para reanudar sin re-escanear disco
        done = set(ckpt.get("completed_slugs", []))
        for p in self.final_dir.glob("*.webp"):
            done.add(p.stem)
        ckpt["completed_slugs"] = sorted(done)
        ckpt["successful"] = len(ckpt["completed_slugs"])
        self.ckpt_path.write_text(json.dumps(ckpt, ensure_ascii=False, indent=2), encoding="utf-8")

    def _backup_db(self, project_root, settings):
        name = settings.DATABASES["default"].get("NAME")
        if not name:
            return
        src = Path(name)
        if not src.is_absolute():
            src = Path(settings.BASE_DIR) / src
        if src.exists() and src.suffix.lower() in {".sqlite3", ".sqlite", ".db"}:
            bdir = Path(settings.BASE_DIR) / "backups"
            bdir.mkdir(exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            dst = bdir / f"db_before_ai_covers_{ts}.sqlite3"
            shutil.copy2(src, dst)
            self.stdout.write(f"Backup BD: {dst}")
