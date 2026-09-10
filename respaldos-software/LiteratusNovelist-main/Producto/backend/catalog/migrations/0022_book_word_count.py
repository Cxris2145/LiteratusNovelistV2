# Generated for LiteratusNovelist — recuento exacto de palabras/páginas por libro.

import re

from django.db import migrations, models

_TAG_RE = re.compile(r"<[^>]+>")


def backfill_word_count(apps, schema_editor):
    """Calcula word_count para todos los libros existentes a partir del HTML
    de sus capítulos (texto plano, sin etiquetas)."""
    Book = apps.get_model("catalog", "Book")
    Chapter = apps.get_model("catalog", "Chapter")

    pending = []
    for book_id in Book.objects.values_list("id", flat=True).iterator(chunk_size=300):
        total = 0
        chapters = (
            Chapter.objects
            .filter(book_id=book_id)
            .values_list("content_html", flat=True)
            .iterator(chunk_size=100)
        )
        for html in chapters:
            if html:
                total += len(_TAG_RE.sub(" ", html).split())
        if total:
            pending.append(Book(id=book_id, word_count=total))
        if len(pending) >= 300:
            Book.objects.bulk_update(pending, ["word_count"])
            pending.clear()
    if pending:
        Book.objects.bulk_update(pending, ["word_count"])


def noop_reverse(apps, schema_editor):
    """La columna se elimina en la migración inversa; no hay nada que revertir."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0021_alter_genre_cover_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="book",
            name="word_count",
            field=models.PositiveIntegerField(
                default=0,
                help_text="Nº total de palabras del libro (suma de capítulos, sin HTML).",
            ),
        ),
        migrations.RunPython(backfill_word_count, noop_reverse),
    ]
