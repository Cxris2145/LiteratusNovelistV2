with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

if '.restricted-btn' not in css:
    css += '''
.restricted-btn {
  background: rgba(180, 50, 50, 0.2);
  color: #ffb4b4;
  border-color: rgba(180, 50, 50, 0.4);
  cursor: not-allowed;
}
.restricted-btn:hover {
  background: rgba(180, 50, 50, 0.3);
  box-shadow: none;
}
'''
    with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.css', 'w', encoding='utf-8') as f:
        f.write(css)
