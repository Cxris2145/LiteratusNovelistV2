with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re

mobile_560_how = '''  .device {
      transform: scale(0.65);
    }
'''

if 'transform: scale(0.65)' not in css:
    css = re.sub(
        r"@media \(max-width: 560px\) \{",
        "@media (max-width: 560px) {\\n" + mobile_560_how,
        css
    )

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
