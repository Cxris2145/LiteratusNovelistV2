with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re
css = re.sub(
    r"padding:\s*8px\s*16px\s*4px\s*16px;",
    "padding: 12px 16px 4px 20px;",
    css
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
