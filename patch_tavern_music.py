with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/community/tavern-music/tavern-music.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re

# Update .tm-player to be hidden
hidden_player = '''/* El iframe se oculta visualmente para funcionar como reproductor de audio */
.tm-player { 
  position: absolute; 
  width: 0; 
  height: 0; 
  opacity: 0; 
  pointer-events: none; 
  border: 0; 
}'''

css = re.sub(
    r"/\* El v[^\n]*\n\.tm-player \{[^}]+\}",
    hidden_player,
    css
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/community/tavern-music/tavern-music.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
