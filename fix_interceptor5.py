with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
ts = re.sub(r"\\\\users/login/refresh/\\;", r"`${environment.apiUrl}users/login/refresh/`;", ts)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
