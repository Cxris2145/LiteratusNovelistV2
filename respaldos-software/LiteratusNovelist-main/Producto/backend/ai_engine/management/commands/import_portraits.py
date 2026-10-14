"""Validate, copy and optionally publish explicitly mapped portraits."""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from ai_engine.portraits import PortraitError, import_manifest


class Command(BaseCommand):
    help = "Valida retratos por UUID (dry-run por defecto); --apply enlaza tras guardar y verificar."

    def add_arguments(self, parser):
        parser.add_argument("manifest")
        parser.add_argument("--images-root", required=True)
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument("--apply", action="store_true")
        mode.add_argument("--dry-run", action="store_true")
        parser.add_argument("--expected-database-fingerprint")
        parser.add_argument("--upload", action="store_true", help="Sube a Supabase y verifica su contenido público.")
        parser.add_argument("--replace", action="store_true", help="Permite reemplazar el enlace de retratos existentes.")
        parser.add_argument("--report", help="Guarda estados separados de copia, subida y enlace para reanudar.")

    def handle(self, *args, **options):
        try:
            manifest = json.loads(Path(options["manifest"]).read_text(encoding="utf-8"))
            report = import_manifest(manifest, options["images_root"], apply=options["apply"],
                                     expected_fingerprint=options["expected_database_fingerprint"],
                                     upload=options["upload"], replace=options["replace"])
            if options["report"]:
                output = Path(options["report"])
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except (PortraitError, ValueError, OSError) as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(json.dumps(report, ensure_ascii=False, indent=2))
        if report["counts"].get("failed"):
            raise CommandError(f"{report['counts']['failed']} retratos fallaron. Las filas sin éxito no se enlazaron.")
