with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

# Remove Enigma button
html = re.sub(
    r"\s*<button mat-menu-item routerLink=\"/games/enigma\">[\s\S]*?<span>El Enigma del Tintero</span>\s*</button>",
    "",
    html
)

# Remove Interrogatorio button
html = re.sub(
    r"\s*<button mat-menu-item routerLink=\"/games/interrogatorio\">[\s\S]*?<span>Interrogatorio a Ciegas</span>\s*</button>",
    "",
    html
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
