with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

import re

# Add min_age to BookListSerializer
# Current fields line: fields = ['id', 'title', 'slug', 'synopsis', 'is_featured', 'cover_image', 'genres', 'tags', 'price', 'author_name', 'ai_character_count', 'word_count', 'page_count']
ser_py = re.sub(
    r"'author_name', 'ai_character_count', 'word_count', 'page_count'\]",
    r"'author_name', 'ai_character_count', 'word_count', 'page_count', 'min_age']",
    ser_py
)

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/serializers.py', 'w', encoding='utf-8') as f:
    f.write(ser_py)
