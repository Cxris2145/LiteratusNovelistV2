with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

ts = ts.replace('''  newConversation(): void {
    if (this.isEphemeral) this.assistant.setEphemeralMode(false);
    this.assistant.startNewConversation();
  }
    this.assistant.startNewConversation();
  }''', '''  newConversation(): void {
    if (this.isEphemeral) this.assistant.setEphemeralMode(false);
    this.assistant.startNewConversation();
  }''')

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
