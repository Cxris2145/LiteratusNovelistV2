with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/community/tavern-scene/tavern-scene.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re

# Add max-width constraint to .ts-stage
stage_css = '''  .ts-stage {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    width: 100%;
    /* Limita el ancho basndose en la altura para que las proporciones cqw no exploten en pantallas muy anchas */
    max-width: calc(var(--th-stage-height, 560px) * 1.85);
    margin: 0 auto;
    height: var(--th-stage-height, 560px);
    background: transparent;
  }'''

css = re.sub(
    r"\.ts-stage\s*\{[^}]+\}",
    stage_css.strip(),
    css,
    count=1
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/community/tavern-scene/tavern-scene.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
