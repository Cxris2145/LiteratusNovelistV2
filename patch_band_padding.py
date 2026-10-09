with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re

# Fix .band padding clamp
css = re.sub(
    r"padding: clamp\(80px, 10vw, 140px\) var\(--home-gutter\);",
    "padding: clamp(48px, 10vw, 140px) var(--home-gutter);",
    css
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
