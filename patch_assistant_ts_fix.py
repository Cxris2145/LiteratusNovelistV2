with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/assistant.service.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

ts = ts.replace(\"this.api.post<AssistantMessage>(\/chat/ephemeral/, {\", \"this.api.post<AssistantMessage>(\/assistant/chat/ephemeral/, {\")

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/assistant.service.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
