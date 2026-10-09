with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/assistant.service.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

if '_isEphemeral$' not in ts:
    ts = ts.replace("readonly conversations$ = this._conversations$.asObservable();", "readonly conversations$ = this._conversations$.asObservable();\n  private _isEphemeral$ = new BehaviorSubject<boolean>(false);\n  readonly isEphemeral$ = this._isEphemeral$.asObservable();")

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/assistant.service.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
