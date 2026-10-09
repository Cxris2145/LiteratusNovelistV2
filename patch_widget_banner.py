with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

banner_html = '''
      <div class="lit-ephemeral-notice" *ngIf="isEphemeral">
        <span class="lit-ephemeral-text">Has entrado en modo efímero</span>
        <div class="lit-ephemeral-separator"></div>
      </div>
'''

if 'lit-ephemeral-notice' not in html:
    html = html.replace('''<div class="lit-messages" #messagesEl *ngIf="!isHistoryOpen">''', '''<div class="lit-messages" #messagesEl *ngIf="!isHistoryOpen">''' + banner_html)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
