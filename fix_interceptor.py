with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
ts = re.sub(r"\\\${token}", r"${token}", ts)
ts = re.sub(r"\\\${newAccessToken}", r"${newAccessToken}", ts)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
