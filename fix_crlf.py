with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'rb') as f:
    content = f.read()

content = content.replace(b'\r\r\n', b'\n').replace(b'\r\n', b'\n')

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'wb') as f:
    f.write(content)
