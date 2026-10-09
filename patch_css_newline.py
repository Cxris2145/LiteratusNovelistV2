with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re
css = css.replace('\\n', '\n')

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
