with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

button_html = '''
        <button type="button" class="lit-icon-btn" [class.active]="isEphemeral" (click)="toggleEphemeral()" title="Modo efímero (sin guardar)" aria-label="Modo efímero">
          <span class="material-symbols-rounded">visibility_off</span>
        </button>
'''

if 'visibility_off' not in html:
    html = html.replace('''<button type="button" class="lit-icon-btn" (click)="newConversation()" title="Nueva conversacin" aria-label="Nueva conversacin">''', button_html + '''        <button type="button" class="lit-icon-btn" (click)="newConversation()" title="Nueva conversacin" aria-label="Nueva conversacin">''')

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
