with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

ts = re.sub(
    r"this\.apiService\.get<any>\(catalog/books/\?search=&page_size=5\)\.pipe\(",
    r"this.apiService.get<any>(`catalog/books/?search=${query.trim()}&page_size=5`).pipe(",
    ts
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
