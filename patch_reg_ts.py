with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/auth/register/register.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
if 'birth_date: ' not in ts:
    ts = re.sub(
        r"password: \['', \[Validators\.required, Validators\.minLength\(8\)\]\],",
        r"password: ['', [Validators.required, Validators.minLength(8)]],\n      birth_date: ['', Validators.required],",
        ts
    )
    with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/auth/register/register.component.ts', 'w', encoding='utf-8') as f:
        f.write(ts)
    print("Patched register.component.ts")
