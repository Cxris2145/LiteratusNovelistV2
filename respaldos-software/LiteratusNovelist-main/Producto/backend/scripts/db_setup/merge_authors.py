import os
import sys
import django
from difflib import SequenceMatcher
import unicodedata

# Configurar Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Author, Book

def normalize_name(name):
    # Remover tildes y caracteres especiales, pasar a minúsculas
    name = unicodedata.normalize('NFKD', name).encode('ASCII', 'ignore').decode('utf-8')
    name = name.lower()
    # Remover puntos y comas
    name = name.replace('.', ' ').replace(',', ' ')
    # Remover espacios dobles
    return ' '.join(name.split())

def main():
    authors = list(Author.objects.all())
    used = set()
    groups = []

    for a in authors:
        if a.id in used:
            continue
        
        similars = [a]
        a_norm = normalize_name(a.full_name)
        a_words = set(a_norm.split())
        
        for b in authors:
            if a.id == b.id or b.id in used:
                continue
                
            b_norm = normalize_name(b.full_name)
            b_words = set(b_norm.split())
            
            # Fuzzy match
            ratio = SequenceMatcher(None, a_norm, b_norm).ratio()
            
            # Condición 1: Muy alta similitud (ej. errores de tipeo como Shakesperare)
            if ratio > 0.88:
                similars.append(b)
            # Condición 2: Apellidos conocidos
            elif 'lovecraft' in a_norm and 'lovecraft' in b_norm:
                similars.append(b)
            elif 'dostoievski' in a_norm and 'dostoievski' in b_norm:
                similars.append(b)
            elif 'tolstoi' in a_norm and 'tolstoi' in b_norm:
                similars.append(b)

        if len(similars) > 1:
            groups.append(similars)
            for s in similars:
                used.add(s.id)

    print(f"Se encontraron {len(groups)} grupos de autores duplicados.")
    merged_count = 0

    for group in groups:
        print(f"\\n--- Grupo a fusionar ---")
        for idx, s in enumerate(group):
            books_count = s.books.count()
            print(f"  {idx + 1}. {s.full_name} (ID: {s.id}) - Libros: {books_count} - Foto: {'Si' if s.photo else 'No'}")
        
        primary = None
        for s in group:
            if not primary:
                primary = s
            else:
                score_s = (1 if s.photo else 0, s.books.count(), len(s.full_name))
                score_p = (1 if primary.photo else 0, primary.books.count(), len(primary.full_name))
                if score_s > score_p:
                    primary = s
        
        print(f"-> Autor principal elegido: {primary.full_name}")
        
        # Fusionar
        for s in group:
            if s.id != primary.id:
                # Transferir libros
                books = s.books.all()
                for book in books:
                    book.authors.remove(s)
                    book.authors.add(primary)
                print(f"  -> Libros de {s.full_name} transferidos a {primary.full_name}")
                
                # Borrar el duplicado
                s.delete()
                merged_count += 1
                print(f"  -> Eliminado: {s.full_name}")

    print(f"\\nProceso finalizado! Se eliminaron {merged_count} autores duplicados y se unificaron sus libros.")

if __name__ == "__main__":
    main()
