import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Author

def build_prompt(author):
    parts = [author.full_name]
    
    if author.nationality:
        parts.append(f"{author.nationality.lower()} author and writer")
    else:
        parts.append("author and writer")
        
    if author.birth_year:
        if author.birth_year < 1900:
            parts.append(f"19th century historical portrait, born {author.birth_year}")
        else:
            parts.append(f"20th century portrait, born {author.birth_year}")
            
    # Opcional: si tuviéramos algo en bio, pero para evitar deformaciones
    # es mejor mantenerlo corto y enfocado en la persona.
    return ", ".join(parts)

def main():
    authors = Author.objects.all()
    tasks = []
    
    for author in authors:
        tasks.append({
            "slug": author.slug,
            "title": author.full_name, # Mantenemos key "title" o "name" por compatibilidad si es que tu script imprime "title"
            "prompt": build_prompt(author)
        })
        
    output_file = 'json_data/authors_to_generate.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(tasks, f, ensure_ascii=False, indent=2)
        
    print(f"Exito! Se genero el archivo {output_file} con {len(tasks)} autores listos para Colab.")

if __name__ == "__main__":
    main()
