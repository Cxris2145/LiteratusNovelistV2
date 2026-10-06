with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/models.py', 'r', encoding='utf-8') as f:
    cat_py = f.read()

import re
if 'min_age = ' not in cat_py:
    cat_py = re.sub(
        r"(synopsis = models.TextField\(blank=True, default=''\).*)",
        r"\1\n    min_age = models.PositiveSmallIntegerField(default=0, help_text='Edad mínima recomendada para leer la obra (0 = para todo público).')",
        cat_py
    )
    with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/models.py', 'w', encoding='utf-8') as f:
        f.write(cat_py)
    print("Added min_age to Book")
