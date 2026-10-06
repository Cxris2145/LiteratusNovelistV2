with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

import re

# Add min_age to BookListSerializer
ser_py = re.sub(
    r"(fields = \['id', 'title', 'slug', 'synopsis', 'is_featured', 'cover_image', 'genres', 'tags', 'price', \n'author_name', 'ai_character_count', 'word_count', 'page_count')\]",
    r"\1, 'min_age']",
    ser_py
)

# Add min_age to BookDetailSerializer
ser_py = re.sub(
    r"('word_count', 'created_at'\])",
    r"'word_count', 'created_at', 'min_age']",
    ser_py
)

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/serializers.py', 'w', encoding='utf-8') as f:
    f.write(ser_py)
