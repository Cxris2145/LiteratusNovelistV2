with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

group_css = '''
.prediction-group-title {
  display: block;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-primary-text);
  padding: 8px 16px 4px 16px;
  letter-spacing: 0.05em;
  opacity: 0.8;
}
'''

if 'prediction-group-title' not in css:
    css = css + '\\n' + group_css

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
