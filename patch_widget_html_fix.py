with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

button_html = '''
        <button type="button" class="lit-icon-btn" [class.active]="isEphemeral" (click)="toggleEphemeral()" title="Modo efímero (sin guardar)" aria-label="Modo efímero">
          <span class="material-symbols-rounded">visibility_off</span>
        </button>
'''

if 'visibility_off' not in html:
    html = re.sub(
        r"(<button type=\"button\" class=\"lit-icon-btn\" \(click\)=\"newConversation\(\)\")",
        button_html.strip() + r"\n        \1",
        html
    )

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
