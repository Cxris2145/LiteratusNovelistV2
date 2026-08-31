"""catalog/management/commands/standardize_library.py

Estandariza portada (colección Literatus) y sinopsis (60-120 palabras, español,
anclada al contenido real) de los libros del catálogo.

Ejemplos:
    python manage.py standardize_library                     # solo pendientes
    python manage.py standardize_library --all
    python manage.py standardize_library --covers-only
    python manage.py standardize_library --synopsis-only
    python manage.py standardize_library --all --synopsis-only --local-synopsis
    python manage.py standardize_library --book-id la-metamorfosis-kafka-franz --dry-run
    python manage.py standardize_library --slugs-file standardize_pilot.txt --preview-dir ./_preview
    python manage.py standardize_library --art-dir ./arte_portadas --covers-only --dry-run --preview-dir ./_preview
    python manage.py standardize_library --all --regenerate --batch-size 40
"""

from __future__ import annotations

import sys
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from catalog.standardization import SUPPORTED_ART_EXTENSIONS, standardize_library


class Command(BaseCommand):
    help = "Genera sinopsis y portadas estandarizadas para la biblioteca Literatus."

    def add_arguments(self, parser):
        parser.add_argument("--all", action="store_true",
                            help="Procesa todos los libros (por defecto: solo los pendientes).")
        parser.add_argument("--covers-only", action="store_true", help="Solo regenera portadas.")
        parser.add_argument("--synopsis-only", action="store_true", help="Solo genera sinopsis.")
        parser.add_argument("--book-id", type=str, default=None,
                            help="Un solo libro por UUID o slug.")
        parser.add_argument("--slugs-file", type=str, default=None,
                            help="Ruta a un .txt con un slug por línea.")
        parser.add_argument("--regenerate", action="store_true",
                            help="Ignora el estado / contenido existente y rehace.")
        parser.add_argument("--dry-run", action="store_true",
                            help="No escribe: ni BD, ni archivos, ni metadata. Igual llama a la IA.")
        parser.add_argument("--offline", action="store_true",
                            help="No llama a la IA: portadas procedurales, sinopsis solo QC.")
        parser.add_argument(
            "--local-synopsis", action="store_true",
            help=("Genera sinopsis sin IA a partir de capítulos y EPUB locales; "
                  "usa metadatos solo cuando la fuente textual es insuficiente."),
        )
        parser.add_argument("--limit", type=int, default=None)
        parser.add_argument("--batch-size", type=int, default=40)
        parser.add_argument("--sleep", type=float, default=1.5,
                            help="Segundos entre libros (respeta límites de la API).")
        parser.add_argument("--preview-dir", type=str, default=None,
                            help="Con --dry-run: escribe una vista previa .webp de cada portada.")
        parser.add_argument(
            "--art-dir", type=str, default=None,
            help=("Carpeta con ilustraciones 2:3 nombradas <slug>.png|jpg|jpeg|webp. "
                  "Sustituye la generación de imagen y fuerza la recomposición de esas portadas."),
        )
        parser.add_argument("--font-set", choices=["auto", "windows", "portable"], default="auto")
        parser.add_argument("--no-backup", action="store_true",
                            help="Omite el backup SQLite (solo válido con --dry-run).")

    def handle(self, *args, **o):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

        if o["covers_only"] and o["synopsis_only"]:
            raise CommandError("--covers-only y --synopsis-only son excluyentes.")
        if o["no_backup"] and not o["dry_run"]:
            raise CommandError("--no-backup solo se permite junto con --dry-run.")
        if o["art_dir"] and o["synopsis_only"]:
            raise CommandError("--art-dir requiere procesar portadas; no es compatible con --synopsis-only.")
        if o["local_synopsis"] and o["offline"]:
            raise CommandError("--local-synopsis y --offline son excluyentes.")

        do_cover = not o["synopsis_only"]
        do_synopsis = not o["covers_only"]

        selector = {"all": o["all"]}
        if o["book_id"]:
            selector["book_id"] = o["book_id"]
        if o["slugs_file"]:
            p = Path(o["slugs_file"])
            if not p.exists():
                p = Path(".") / o["slugs_file"]
            if not p.exists():
                raise CommandError(f"No se encontró el archivo de slugs: {o['slugs_file']}")
            selector["slugs"] = [ln.strip() for ln in p.read_text(encoding="utf-8").splitlines()
                                 if ln.strip() and not ln.startswith("#")]

        art_dir = None
        if o["art_dir"]:
            art_dir = Path(o["art_dir"]).expanduser()
            if not art_dir.is_absolute():
                art_dir = Path.cwd() / art_dir
            art_dir = art_dir.resolve()
            if not art_dir.is_dir():
                raise CommandError(f"No se encontró la carpeta de arte: {art_dir}")
            art_slugs = sorted({
                p.stem for p in art_dir.iterdir()
                if p.is_file() and p.suffix.lower() in SUPPORTED_ART_EXTENSIONS
            })
            if not art_slugs:
                raise CommandError(f"La carpeta no contiene imágenes compatibles: {art_dir}")
            if not (o["all"] or o["book_id"] or o["slugs_file"]):
                selector["slugs"] = art_slugs

        preview_dir = Path(o["preview_dir"]) if o["preview_dir"] else None

        try:
            result = standardize_library(
                selector=selector,
                do_cover=do_cover,
                do_synopsis=do_synopsis,
                regenerate=o["regenerate"] or art_dir is not None,
                dry_run=o["dry_run"],
                offline=o["offline"],
                local_synopsis=o["local_synopsis"],
                limit=o["limit"],
                batch_size=o["batch_size"],
                sleep=o["sleep"],
                preview_dir=preview_dir,
                font_set=o["font_set"],
                make_backup=not o["no_backup"],
                art_dir=art_dir,
                progress=lambda line: self.stdout.write(line),
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        c = result["counters"]
        self.stdout.write("\n" + "=" * 12 + " RESUMEN ESTANDARIZACIÓN " + "=" * 12)
        self.stdout.write(f"Total procesados:      {c['done']}/{c['total']}")
        self.stdout.write(f"Sinopsis creadas:      {c['synopsis_generated']}")
        self.stdout.write(f"Sinopsis conservadas:  {c['synopsis_kept']}")
        self.stdout.write(f"Sinopsis fallidas:     {c['synopsis_failed']}")
        self.stdout.write(f"Portadas ilustradas:   {c['covers_generated']}")
        self.stdout.write(f"  desde arte local:    {c.get('covers_local_art', 0)}")
        self.stdout.write(f"Portadas procedurales: {c['covers_fallback']}")
        self.stdout.write(f"Portadas conservadas:  {c['covers_kept']}")
        self.stdout.write(f"Portadas fallidas:     {c['covers_failed']}")
        self.stdout.write(f"Requieren revisión:    {c['needs_review']}")
        cover_audit = result.get("cover_audit")
        if cover_audit:
            cc = cover_audit["counts"]
            self.stdout.write(
                f"Auditoría colección:   WEBP {cc.get('webp', 0)}/{cc.get('books', 0)}, "
                f"600x900 {cc.get('target_size', 0)}/{cc.get('books', 0)}, "
                f"duplicados exactos {len(cover_audit['exact_duplicate_groups'])}, "
                f"visuales {len(cover_audit['perceptual_duplicate_groups'])}"
            )
        if result.get("report"):
            self.stdout.write(f"\nInforme:    {result['report']}")
        self.stdout.write(f"Checkpoint: {result['checkpoint']}")
