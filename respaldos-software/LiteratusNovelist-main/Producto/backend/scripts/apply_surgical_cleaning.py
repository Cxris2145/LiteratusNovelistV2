import os
import sys
from pathlib import Path

# Add backend root to sys.path
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.db import transaction
from django.db.models import Q
from catalog.models import Chapter, Book
from scripts.surgical_cleaner import clean_chapter

def apply_cleaning():
    print("=== INICIANDO LIMPIEZA QUIRÚRGICA EN BASE DE DATOS ===")
    
    # Query all candidate chapters
    target_chapters = Chapter.objects.filter(
        Q(title__icontains='elejandria') | Q(content_html__icontains='elejandria')
    ).select_related('book')

    total_candidates = target_chapters.count()
    print(f"Total capítulos candidatos a evaluar: {total_candidates}")

    modified_chapters = 0
    modified_titles = 0
    modified_contents = 0
    affected_books = set()

    # Process in atomic transaction
    with transaction.atomic():
        for ch in target_chapters:
            orig_t = ch.title
            orig_h = ch.content_html

            new_t, new_h = clean_chapter(orig_t, orig_h)

            t_changed = (orig_t != new_t)
            h_changed = (orig_h != new_h)

            if t_changed or h_changed:
                update_fields = []
                if t_changed:
                    ch.title = new_t
                    update_fields.append('title')
                    modified_titles += 1
                if h_changed:
                    ch.content_html = new_h
                    update_fields.append('content_html')
                    modified_contents += 1

                ch.save(update_fields=update_fields)
                modified_chapters += 1
                affected_books.add(ch.book)

        print(f"\nGuardando cambios en {modified_chapters} capítulos...")
        print(f"- Títulos sanitizados: {modified_titles}")
        print(f"- Contenidos HTML sanitizados: {modified_contents}")
        print(f"- Libros modificados: {len(affected_books)}")

        # Recount words for affected books
        print("\nRecalculando word_count y page_count para los libros modificados...")
        for b in affected_books:
            b.recount_words(save=True)

    print("=== LIMPIEZA QUIRÚRGICA COMPLETADA CON ÉXITO ===")

if __name__ == '__main__':
    apply_cleaning()
