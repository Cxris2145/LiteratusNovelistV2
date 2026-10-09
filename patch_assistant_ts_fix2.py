with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/assistant.service.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
ts = re.sub(
    r"this\.api\.post<AssistantMessage>\(\s*(.*?)/chat/ephemeral/(.*?),\s*\{",
    r"this.api.post<AssistantMessage>(`${this.BASE}/assistant/chat/ephemeral/`, {",
    ts
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/assistant.service.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
