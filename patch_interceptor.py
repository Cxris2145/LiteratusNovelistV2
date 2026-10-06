with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
if 'AGE_RESTRICTED' not in ts:
    ts = ts.replace(
        "return throwError(() => error);",
        '''if (error instanceof HttpErrorResponse && error.status === 403 && error.error?.error === 'AGE_RESTRICTED') {
        alert(error.error.message);
        router.navigate(['/profile']);
      }
      return throwError(() => error);''',
        1
    )
    with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'w', encoding='utf-8') as f:
        f.write(ts)
    print("Patched auth.interceptor.ts")
