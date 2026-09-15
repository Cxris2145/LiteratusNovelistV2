import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book
from ai_engine.models import AIAvatar

def export_catalog():
    books_qs = Book.objects.prefetch_related('authors', 'genres', 'editions__avatars').order_by('title')
    total_books = books_qs.count()
    all_data = []

    md_lines = [
        '# Catálogo Completo de Libros y Personajes - Literatus Novelist\n',
        f'Este documento contiene el listado completo de **{total_books} obras** registradas en la base de datos de Literatus Novelist, junto con sus respectivos autores, sinopsis, avatares IA y características de cada personaje (rol, capítulo de desbloqueo, descripción y contexto conductual).\n',
        '---\n'
    ]

    total_characters_found = 0

    for idx, book in enumerate(books_qs, 1):
        authors = ', '.join(a.full_name for a in book.authors.all()) or 'Autor Desconocido'
        genres = ', '.join(g.name for g in book.genres.all()) or 'General'
        
        seen_avatars = set()
        characters_data = []
        
        for edition in book.editions.all():
            for av in edition.avatars.all():
                key = (av.name.strip().lower(), av.is_author)
                if key in seen_avatars:
                    continue
                seen_avatars.add(key)
                
                characters_data.append({
                    'name': av.name.strip(),
                    'is_author': av.is_author,
                    'role': 'Autor' if av.is_author else ('Principal' if av.is_major_character else 'Secundario'),
                    'unlock_at_chapter': av.unlock_at_chapter,
                    'description': av.description.strip() if av.description else '',
                    'behavioral_context': av.behavioral_context.strip() if av.behavioral_context else '',
                    'greeting_message': av.greeting_message.strip() if av.greeting_message else '',
                    'kokoro_voice_id': av.kokoro_voice_id
                })
                
        author_avatar = next((c for c in characters_data if c['is_author']), None)
        book_characters = [c for c in characters_data if not c['is_author']]
        total_characters_found += len(book_characters)
        
        book_entry = {
            'index': idx,
            'id': str(book.id),
            'title': book.title,
            'authors': authors,
            'genres': genres,
            'difficulty': book.get_difficulty_level_display(),
            'word_count': book.word_count,
            'page_count': max(1, round(book.word_count / 230)) if book.word_count else 0,
            'is_featured': book.is_featured,
            'author_avatar': author_avatar,
            'characters_count': len(book_characters),
            'characters': book_characters
        }
        all_data.append(book_entry)
        
        # Generar Markdown
        diff = book.get_difficulty_level_display()
        md_lines.append(f'## {idx}. {book.title}')
        md_lines.append(f'- **Autor(es):** {authors}')
        md_lines.append(f'- **Género(s):** {genres} | **Dificultad:** {diff}')
        if book.synopsis:
            synopsis_clean = book.synopsis.strip().replace('\n', ' ')
            if len(synopsis_clean) > 300:
                synopsis_clean = synopsis_clean[:300] + '...'
            md_lines.append(f'- **Sinopsis:** {synopsis_clean}')
        
        if author_avatar:
            desc_auth = f' — *{author_avatar["description"]}*' if author_avatar["description"] else ''
            md_lines.append(f'- **Avatar del Autor:** {author_avatar["name"]} *(Voz: {author_avatar["kokoro_voice_id"]})*{desc_auth}')
                
        if book_characters:
            md_lines.append(f'\n### Personajes ({len(book_characters)}):')
            md_lines.append('| Personaje | Rol | Desbloqueo | Descripción | Contexto / Psicología |')
            md_lines.append('| :--- | :--- | :--- | :--- | :--- |')
            for ch in book_characters:
                desc = ch['description'].replace('|', '/').replace('\n', ' ') or 'Personaje de la obra'
                beh = ch['behavioral_context'].replace('|', '/').replace('\n', ' ') or '-'
                unlock = 'Inicio' if ch['unlock_at_chapter'] == 0 else f'Cap. {ch["unlock_at_chapter"]}'
                md_lines.append(f'| **{ch["name"]}** | {ch["role"]} | {unlock} | {desc} | {beh} |')
        else:
            md_lines.append('\n*No posee personajes secundarios configurados.*')
        md_lines.append('\n---\n')

    # Guardar JSON
    json_path = 'listado_completo_libros_personajes.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)

    # Guardar Markdown
    artifact_md_path = r'C:\Users\lffau\.gemini\antigravity-ide\brain\5eed3d83-4b0f-4fea-a11c-7ec886e0bf64\listado_completo_libros_personajes.md'
    with open(artifact_md_path, 'w', encoding='utf-8') as f:
        f.writelines(line + '\n' for line in md_lines)

    print(f'Procesados exitosamente {len(all_data)} libros y {total_characters_found} personajes.')
    print(f'JSON: {json_path}')
    print(f'Markdown: {artifact_md_path}')

if __name__ == '__main__':
    export_catalog()
