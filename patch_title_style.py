with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re
css = re.sub(
    r"\.prediction-group-title \{[\s\S]*?\}",
    ".prediction-group-title {\\n  display: block;\\n  font-family: var(--font-ui);\\n  font-size: 12px;\\n  font-weight: 600;\\n  color: var(--color-text-secondary, #C9BEB0);\\n  padding: 8px 16px;\\n  background: var(--glass-border, rgba(255,255,255,0.05));\\n  border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.1));\\n  text-align: center;\\n}",
    css
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
