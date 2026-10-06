with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
ts = ts.replace("`Bearer ${token}`", "`Bearer ${token}`)")
ts = ts.replace("`Bearer ${newAccessToken}`", "`Bearer ${newAccessToken}`)")
ts = ts.replace("))", ")")  # Just in case

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
