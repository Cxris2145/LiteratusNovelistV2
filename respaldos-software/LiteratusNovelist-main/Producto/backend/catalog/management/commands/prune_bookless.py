"""
catalog/management/commands/prune_bookless.py

Detecta libros SIN capítulos y los elimina.

Por defecto NO borra nada: imprime un reporte (dry-run). Para aplicar el borrado
hay que pasar --apply.

Criterio conservador (elegido por el equipo): un libro sin capítulos solo se
elimina si además NO tiene ninguna Edition con archivo descargable y NO está en
la biblioteca de ningún usuario (UserInventory). Esos casos se pueden incluir con
--include-with-files / --include-owned.

El borrado es LÓGICO por defecto (is_active=False, deleted_at=now), coherente con
el patrón Soft Delete de core.models. Con --hard se hace DELETE físico en cascada.

Ejemplos:
    python manage.py prune_bookless                 # solo reporte
    python manage.py prune_bookless --apply         # soft-delete conservador
    python manage.py prune_bookless --apply --hard  # borrado físico
    python manage.py prune_bookless --apply --include-with-files --include-owned
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from catalog.models import Book, Edition


class Command(BaseCommand):
    help = "Elimina libros que no tienen capítulos. Dry-run por defecto; usa --apply para borrar."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Ejecuta el borrado. Sin este flag solo se imprime el reporte.",
        )
        parser.add_argument(
            "--hard", action="store_true",
            help="Borrado físico (DELETE en cascada) en vez de soft delete.",
        )
        parser.add_argument(
            "--include-with-files", action="store_true",
            help="También borra libros sin capítulos que tengan una Edition con archivo.",
        )
        parser.add_argument(
            "--include-owned", action="store_true",
            help="También borra libros sin capítulos que estén en la biblioteca de algún usuario.",
        )
        parser.add_argument(
            "--limit", type=int, default=0,
            help="Procesa como máximo N libros a borrar (0 = sin límite).",
        )
        parser.add_argument(
            "--list", action="store_true",
            help="Lista el slug de TODOS los libros a borrar (no solo los primeros 50).",
        )

    def handle(self, *args, **opts):
        total = Book.objects.count()

        bookless_qs = Book.objects.annotate(n_ch=Count("chapters")).filter(n_ch=0)
        bookless_count = bookless_qs.count()

        # Conjuntos de protección
        try:
            from library.models import UserInventory
            owned_ids = set(
                UserInventory.objects.values_list("edition__book_id", flat=True)
            )
        except Exception:  # pragma: no cover - por si library no está disponible
            owned_ids = set()

        with_file_ids = set(
            Edition.objects.exclude(file="").exclude(file__isnull=True)
            .values_list("book_id", flat=True)
        )

        deletable, skipped_owned, skipped_file = [], [], []
        for book in bookless_qs.only("id", "slug", "title").iterator():
            is_owned = book.id in owned_ids
            has_file = book.id in with_file_ids
            if is_owned and not opts["include_owned"]:
                skipped_owned.append(book)
                continue
            if has_file and not opts["include_with_files"]:
                skipped_file.append(book)
                continue
            deletable.append(book)

        if opts["limit"]:
            deletable = deletable[: opts["limit"]]

        # ---- Reporte -------------------------------------------------------
        w = self.stdout.write
        w("")
        w(f"  Total de libros activos ......... {total}")
        w(f"  Libros SIN capítulos ........... {bookless_count}")
        w(f"    · protegidos (comprados) ..... {len(skipped_owned)}")
        w(f"    · protegidos (con archivo) ... {len(skipped_file)}")
        w(self.style.WARNING(f"    · a ELIMINAR ................. {len(deletable)}"))
        w(f"  Quedarían después del borrado .. {total - len(deletable)}")
        w("")

        preview = deletable if opts["list"] else deletable[:50]
        for book in preview:
            w(f"    - {book.slug}")
        if not opts["list"] and len(deletable) > 50:
            w(f"    ... y {len(deletable) - 50} más (usa --list para verlos todos)")
        w("")

        if not deletable:
            w(self.style.SUCCESS("No hay libros para borrar. Nada que hacer."))
            return

        if not opts["apply"]:
            w(self.style.WARNING(
                "DRY-RUN: no se borró nada. Repite el comando con --apply para confirmar."
            ))
            return

        # ---- Borrado -----------------------------------------------------
        ids = [b.id for b in deletable]
        with transaction.atomic():
            if opts["hard"]:
                deleted, per_model = Book.all_objects.filter(id__in=ids).delete()
                w(self.style.SUCCESS(f"Borrado físico: {deleted} registros -> {per_model}"))
            else:
                now = timezone.now()
                updated = Book.objects.filter(id__in=ids).update(
                    is_active=False, deleted_at=now, updated_at=now
                )
                w(self.style.SUCCESS(f"Soft-delete aplicado a {updated} libros."))

        w(self.style.SUCCESS(f"Libros activos restantes: {Book.objects.count()}"))
