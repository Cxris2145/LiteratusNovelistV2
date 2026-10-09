import os

directory = 'respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app'
for root, dirs, files in os.walk(directory):
    for file in files:
        if file.endswith('.ts') or file.endswith('.html') or file.endswith('.css'):
            path = os.path.join(root, file)
            with open(path, 'rb') as f:
                content = f.read()
            if b'\r\r\n' in content or b'\r\n' in content:
                content = content.replace(b'\r\r\n', b'\n').replace(b'\r\n', b'\n')
                with open(path, 'wb') as f:
                    f.write(content)
