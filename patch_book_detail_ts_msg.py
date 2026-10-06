with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

# We need to replace the notification in handleAction
old_notification = r"this\.notificationService\.error\(\s*`Este contenido requiere ser mayor de \$\{this\.book\.min_age\} años\. Por favor, actualiza tu fecha de nacimiento en tu perfil\.`,\s*'Contenido Restringido'\s*\);"

new_notification = '''
      const user = this.auth.currentUser();
      const birthDate = user?.profile?.birth_date || user?.birth_date;
      
      if (!birthDate) {
        this.notificationService.error(
          `Para acceder a este contenido restringido (+${this.book.min_age}), debes registrar tu fecha de nacimiento en tu perfil.`,
          'Falta Fecha de Nacimiento'
        );
      } else {
        this.notificationService.error(
          `Tu edad actual no te permite acceder a este contenido. Está restringido para mayores de ${this.book.min_age} años.`,
          'Contenido Restringido'
        );
      }
'''

ts = re.sub(old_notification, new_notification.strip(), ts, flags=re.DOTALL)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
