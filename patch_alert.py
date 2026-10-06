with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

# Add import if missing
if 'NotificationService' not in ts:
    ts = ts.replace("import { AuthService } from '../services/auth.service';", "import { AuthService } from '../services/auth.service';\nimport { NotificationService } from '../services/notification.service';")

# Add inject if missing
if 'inject(NotificationService)' not in ts:
    ts = ts.replace("const router = inject(Router);", "const router = inject(Router);\n  const notificationService = inject(NotificationService);")

# Replace alert with notificationService.error
ts = re.sub(
    r"alert\((.*?)\);",
    r"notificationService.error(\1, 'Restricción de Edad');",
    ts
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/interceptors/auth.interceptor.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
