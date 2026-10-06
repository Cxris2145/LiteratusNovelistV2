with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/library/reader/reader.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
ts = re.sub(
    r"this\.currentAudioMode = savedMode as AudioMode;",
    "this.currentAudioMode = (savedMode === 'kokoro' ? 'wasm' : savedMode) as AudioMode;",
    ts
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/library/reader/reader.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
