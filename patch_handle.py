with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

handle_action_str = '''
  handleAction(): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    if (this.book?.is_age_restricted && !this.isOwned) {
      this.notificationService.error(
        Este contenido requiere ser mayor de  años. Por favor, actualiza tu fecha de nacimiento en tu perfil.,
        'Contenido Restringido'
      );
      return;
    }

    if (this.isOwned && this.book?.inventory_id) {
      this.router.navigate(['/reader', this.book.inventory_id]);
    } else {
      this.confirmPurchase();
    }
  }
'''

ts = re.sub(
    r"  handleAction\(\): void \{\n.*?this\.confirmPurchase\(\);\n    \}\n  \}",
    handle_action_str.strip(),
    ts,
    flags=re.DOTALL
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
print("Patched handleAction")
