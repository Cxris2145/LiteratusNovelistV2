with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/assistant.service.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
ts = re.sub(
    r"(readonly conversations\$ = this\._conversations\$\.asObservable\(\);)",
    r"\1\n  private _isEphemeral$ = new BehaviorSubject<boolean>(false);\n  readonly isEphemeral$ = this._isEphemeral$.asObservable();",
    ts
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/assistant.service.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
