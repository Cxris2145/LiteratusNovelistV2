with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re

# Adjust how-stage height and device scaling
mobile_how = '''    .how-stage {
      order: 0;
      z-index: 3;
      top: calc(var(--header-h, var(--navbar-h, 172px)) + 8px);
      height: min(32svh, 260px);
      padding-bottom: 12px;
      background: var(--home-bg);
    }
  
    .device {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      max-height: none;
      border-radius: 18px;
      transform: scale(0.75);
      transform-origin: top center;
    }
'''

css = re.sub(
    r"\.how-stage \{\s*order: 0;\s*z-index: 3;\s*top:[^}]+\}\s*\.device \{\s*[^}]+\}",
    mobile_how.strip(),
    css
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
