from django.db import migrations
from django.db.models import Q


def classify_adult_books(apps, schema_editor):
    Book = apps.get_model('catalog', 'Book')
    # Copia congelada de los criterios: las migraciones no dependen de código mutable.
    adult_slugs = [
        'historia-de-aline-y-valcour-marques-de-sade',
        'la-historia-secreta-de-isabel-de-baviera-marques-de-sade',
        'juliette-o-las-prosperidades-del-vicio-marques-de-sade',
        'justine-o-los-infortunios-de-la-virtud-marques-de-sade',
        'los-120-dias-de-sodoma-marques-de-sade',
    ]
    adult_titles = [
        'Historia de Aline y Valcour', 'Historia Secreta de Isabel de Baviera',
        'Juliette o las prosperidades del vicio', 'Justine, o los infortunios de la virtud',
        'Los 120 días de Sodoma',
    ]
    db = schema_editor.connection.alias
    books = Book.objects.using(db)
    ids = books.filter(Q(slug__in=adult_slugs) | Q(title__in=adult_titles)
                       | Q(genres__slug__icontains='erotic')).values('pk')
    books.filter(pk__in=ids, min_age__lt=18).update(min_age=18)


class Migration(migrations.Migration):
    dependencies = [('catalog', '0026_booksummary')]
    # Revertir el código no desclasifica obras para adultos.
    operations = [migrations.RunPython(classify_adult_books, migrations.RunPython.noop)]
