with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re

# We will add styling for mdc-list-item__primary-text to make flex and gap work.
if '.mdc-list-item__primary-text' not in css:
    flex_fix = '''
::ng-deep .dark-premium-menu .mdc-list-item__primary-text {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  width: 100%;
}
'''
    css = css.replace("::ng-deep .dark-premium-menu .mat-mdc-menu-item {", flex_fix + "::ng-deep .dark-premium-menu .mat-mdc-menu-item {")

# Also, let's remove display: flex !important and gap: 10px !important from mat-mdc-menu-item
css = re.sub(r"display: flex !important;\n\s*align-items: center !important;\n\s*gap: 10px !important;", "", css)

# Fix icon size slightly for better proportions
css = css.replace("font-size: 18px !important;", "font-size: 20px !important;")

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
