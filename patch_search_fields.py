with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/views.py', 'r', encoding='utf-8') as f:
    views_py = f.read()

import re

# Change search_fields to use ^
views_py = re.sub(
    r"search_fields = \['title', 'synopsis', 'book_authors__author__full_name', 'genres__name'\]",
    r"search_fields = ['^title', '^book_authors__author__full_name', '^genres__name']",
    views_py
)

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/views.py', 'w', encoding='utf-8') as f:
    f.write(views_py)
