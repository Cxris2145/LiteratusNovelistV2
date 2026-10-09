with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

if 'import { Subject' not in ts:
    ts = ts.replace("import { filter } from 'rxjs/operators';", "import { filter, takeUntil, debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';\nimport { Subject, Observable, of } from 'rxjs';")

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
