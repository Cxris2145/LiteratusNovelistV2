with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
# We need to replace the badly formatted string
bad_str = "Este contenido requiere ser mayor de  años. Por favor, actualiza tu fecha de nacimiento en tu perfil."
good_str = "`Este contenido requiere ser mayor de ${this.book.min_age} años. Por favor, actualiza tu fecha de nacimiento en tu perfil.`"
ts = ts.replace(bad_str, good_str)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
