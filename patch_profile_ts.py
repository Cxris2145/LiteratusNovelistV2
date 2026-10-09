with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/users/profile/profile.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

tab_var = '''
  loading = false;
  selectedTab: 'datos' | 'paleta' = 'datos';
  userInitials = 'V';
'''

ts = re.sub(
    r"\s*loading = false;\s*userInitials = 'V';",
    tab_var,
    ts
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/users/profile/profile.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
