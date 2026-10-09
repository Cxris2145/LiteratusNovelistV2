with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

banner_css = '''
.lit-ephemeral-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 8px 0 16px 0;
  width: 100%;
}

.lit-ephemeral-text {
  font-family: var(--font-ui, sans-serif);
  font-size: 11.5px;
  color: var(--color-text-secondary, rgba(255, 255, 255, 0.4));
  font-style: italic;
  margin-bottom: 8px;
  text-align: center;
}

.lit-ephemeral-separator {
  width: 80%;
  border-top: 1px dotted var(--glass-border, rgba(255, 255, 255, 0.15));
}
'''

if 'lit-ephemeral-notice' not in css:
    css = css + '\\n' + banner_css

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
