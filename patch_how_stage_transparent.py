with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re

mobile_how = '''    .how-stage {
      order: 0;
      z-index: 3;
      top: calc(var(--header-h, var(--navbar-h, 172px)) + 8px);
      height: 250px;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      background: transparent;
      pointer-events: none;
    }
  
    .device {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      max-height: none;
      border-radius: 18px;
      transform: scale(0.70);
      transform-origin: top center;
      pointer-events: auto;
      box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.9);
    }
'''

css = re.sub(
    r"\.how-stage \{\s*order: 0;\s*z-index: 3;\s*top:[^}]+\}\s*\.device \{\s*[^}]+\}",
    mobile_how.strip(),
    css
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
