"""Export real catalog UUIDs for offline portrait generation and curation."""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from ai_engine.models import AIAvatar
from ai_engine.portraits import PortraitError, export_manifest


class Command(BaseCommand):
    help = "Exporta un manifiesto privado de retratos sin generar imágenes ni modificar la base."

    def add_arguments(self, parser):
        parser.add_argument("--output", required=True)
        parser.add_argument("--profiles", help="JSON de rasgos visuales aprobado, por UUID o identity_key.")
        parser.add_argument("--avatar", action="append", default=[], help="UUID opcional; se puede repetir.")

    def handle(self, *args, **options):
        try:
            profiles = json.loads(Path(options["profiles"]).read_text(encoding="utf-8")) if options["profiles"] else {}
            avatars = AIAvatar.objects.all()
            if options["avatar"]:
                avatars = avatars.filter(pk__in=options["avatar"])
            manifest = export_manifest(avatars, profiles)
            output = Path(options["output"])
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except (PortraitError, ValueError, OSError) as exc:
            raise CommandError(str(exc)) from exc
        identities = {item["identity_key"] for item in manifest["avatars"]}
        self.stdout.write(f"Exportados {len(manifest['avatars'])} avatares, {len(identities)} identidades. Manifiesto: {output}")
        self.stdout.write(f"database_fingerprint: {manifest['database_fingerprint']}")
        self.stdout.write("El manifiesto contiene contexto narrativo privado: no lo publiques ni lo envíes íntegro al generador.")
