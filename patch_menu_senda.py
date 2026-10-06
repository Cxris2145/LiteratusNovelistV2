with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

# Remove Senda button
html = re.sub(
    r"\s*<button mat-menu-item routerLink=\"/learn\">[\s\S]*?<span>La Senda del Lector</span>\s*</button>",
    "",
    html
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
