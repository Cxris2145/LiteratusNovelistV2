"""
catalog/management/commands/normalize_cover_paths.py

Corrige Book.cover_image / Genre.cover_image que quedaron con una URL absoluta
(o con el prefijo de MEDIA_URL) guardada dentro del campo. Django ya antepone
MEDIA_URL al construir la URL pública, así que en el campo solo debe quedar la
ruta relativa dentro del bucket (p. ej. "book_covers/mi-libro.jpg").

Uso:
    python manage.py normalize_cover_paths            # reporte (dry-run)
    python manage.py normalize_cover_paths --apply
"""

import re

from django.core.management.base import BaseCommand

from catalog.models import Book, Genre

# .../storage/v1/object/public/<bucket>/   ->  se recorta hasta aquí
_PUBLIC_RE = re.compile(r"^https?://[^/]+/storage/v1/object/public/[^/]+/", re.IGNORECASE)


def _to_relative(value: str) -> str:
    if not value:
        return value
    v = value.strip()
    v = _PUBLIC_RE.sub("", v)          # quita host + .../public/<bucket>/
    v = re.sub(r"^https?%3A/+", "", v, flags=re.IGNORECASE)  # restos ya codificados
    v = _PUBLIC_RE.sub("", v)          # por si venía doblado
    v = v.lstrip("/")
    return v


class Command(BaseCommand):
    help = "Deja Book/Genre.cover_image como ruta relativa dentro del bucket."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Escribe los cambios.")

    def handle(self, *args, **opts):
        w = self.stdout.write
        changed = 0
        for Model, field in ((Book, "cover_image"), (Genre, "cover_image")):
            qs = Model.objects.exclude(**{field: ""}).exclude(**{f"{field}__isnull": True})
            for obj in qs.iterator():
                old = getattr(obj, field).name
                new = _to_relative(old)
                if new != old:
                    changed += 1
                    if changed <= 6:
                        w(f"  {Model.__name__} {obj.pk}\n    {old}\n -> {new}")
                    if opts["apply"]:
                        setattr(obj, field, new)
                        obj.save(update_fields=[field])
        verb = "corregidos" if opts["apply"] else "se corregirían"
        w(self.style.SUCCESS(f"\n{verb}: {changed} registros"))
        if not opts["apply"]:
            w(self.style.WARNING("dry-run: repite con --apply"))
        else:
            b = Book.objects.exclude(cover_image="").first()
            if b:
                w(f"ejemplo URL final: {b.cover_image.url}")
