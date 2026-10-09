with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

dropdown_css = '''
/* Predicciones de Búsqueda */
.nav-search-form {
  position: relative;
}

.search-predictions-dropdown {
  position: absolute;
  top: 110%;
  left: 0;
  right: 0;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  box-shadow: 0 8px 32px var(--color-shadow);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 1000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.prediction-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s ease;
  border-bottom: 1px solid var(--color-border);
}

.prediction-item:last-child {
  border-bottom: none;
}

.prediction-item:hover {
  background: var(--color-hover);
}

.prediction-cover {
  width: 32px;
  height: 48px;
  border-radius: 4px;
  object-fit: cover;
}

.prediction-cover-placeholder {
  width: 32px;
  height: 48px;
  border-radius: 4px;
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.prediction-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.prediction-title {
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 14px;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prediction-author {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-muted);
}

.prediction-item.all-results {
  justify-content: center;
  padding: 12px;
  font-weight: 500;
  color: var(--color-primary-text);
  font-size: 13px;
}
'''

if 'search-predictions-dropdown' not in css:
    css = css + '\\n' + dropdown_css

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
