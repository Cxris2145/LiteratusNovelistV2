"""
catalog/management/commands/rebuild_catalog.py

Orquestador: reconstruye el catálogo desde cero en la base actual.

Pasos:
    1. import_epubs        -> libros, capítulos, autores, ediciones, géneros
    2. import_api_backup   -> sinopsis, portadas, tags, bios  (si hay respaldo)

No sube portadas a Supabase ni genera portadas nuevas: esos son pasos
opcionales aparte (generate_covers / upload_covers_supabase). Ver REBUILD.md.

Uso:
    python manage.py rebuild_catalog
    python manage.py rebuild_catalog --source ../../books --backup backups/live_api
    python manage.py rebuild_catalog --limit 30        # ensayo rápido
"""

from pathlib import Path

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db.models import Q

from catalog.models import Author, Book, Chapter, Genre


class Command(BaseCommand):
    help = "Reconstruye el catálogo completo: EPUBs + respaldo de la API vieja."

    def add_arguments(self, parser):
        parser.add_argument("--source", default=None, help="Carpeta de EPUBs (pasa a import_epubs).")
        parser.add_argument("--categories", default=None)
        parser.add_argument("--backup", default="backups/live_api", help="Carpeta del respaldo de la API.")
        parser.add_argument("--limit", type=int, default=0)
        parser.add_argument("--skip-existing", action="store_true")

    def handle(self, *args, **opts):
        w = self.stdout.write
        w(self.style.MIGRATE_HEADING("\n=== 1/2  import_epubs ==="))
        call_command(
            "import_epubs",
            source=opts["source"],
            categories=opts["categories"],
            limit=opts["limit"],
            skip_existing=opts["skip_existing"],
        )

        backup_dir = Path(opts["backup"])
        if (backup_dir / "books.json").exists():
            w(self.style.MIGRATE_HEADING("\n=== 2/2  import_api_backup ==="))
            call_command("import_api_backup", dir=str(backup_dir))
        else:
            w(self.style.WARNING(
                f"\n=== 2/2  omitido: no hay respaldo en {backup_dir}/books.json ===\n"
                "   Genéralo con: python manage.py backup_live_api"
            ))

        w(self.style.SUCCESS("\n--- Catálogo reconstruido ---"))
        w(f"  Libros:    {Book.objects.count()}")
        w(f"  Capítulos: {Chapter.objects.count()}")
        w(f"  Autores:   {Author.objects.count()}")
        w(f"  Géneros:   {Genre.objects.count()}")
        w(f"  Sin portada: {Book.objects.filter(Q(cover_image='') | Q(cover_image__isnull=True)).count()}")
        w("\nSiguiente (opcional): generate_covers / upload_covers_supabase. Ver REBUILD.md")
