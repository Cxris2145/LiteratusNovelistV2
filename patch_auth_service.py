with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/auth.service.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re
ts = re.sub(
    r"has_completed_onboarding\?: boolean;",
    r"has_completed_onboarding?: boolean;\n  birth_date?: string;\n  profile?: any;",
    ts
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/auth.service.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
