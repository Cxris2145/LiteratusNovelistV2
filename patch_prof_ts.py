with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/users/profile/profile.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
if 'birth_date: ' not in ts:
    ts = re.sub(
        r"country: \[''\],",
        r"country: [''],\n      birth_date: [''],",
        ts
    )
    
    ts = re.sub(
        r"country: profile\.country,",
        r"country: profile.country,\n          birth_date: profile.birth_date,",
        ts
    )
    
    with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/users/profile/profile.component.ts', 'w', encoding='utf-8') as f:
        f.write(ts)
    print("Patched profile.component.ts")
