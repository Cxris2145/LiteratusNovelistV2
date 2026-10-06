with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

# Add AGE_RESTRICTED block before the 401 block
age_block = '''
      if (error instanceof HttpErrorResponse && error.status === 403 && error.error?.error === 'AGE_RESTRICTED') {
        alert(error.error.message || 'Contenido restringido por edad. Completa tu perfil.');
        router.navigate(['/users/profile']);
        return throwError(() => error);
      }
'''

ts = ts.replace(
    "if (error instanceof HttpErrorResponse && error.status === 401) {",
    age_block + "\n      if (error instanceof HttpErrorResponse && error.status === 401) {"
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
