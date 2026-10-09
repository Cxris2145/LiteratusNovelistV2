with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

new_func = '''  onSearchType(): void {
    if (this.globalSearchTerm.trim()) {
      if (this.searchPredictions.length > 0) {
        this.showPredictions = true;
      }
    } else {
      this.showPredictions = false;
    }
    this.searchSubject.next(this.globalSearchTerm);
  }'''

ts = re.sub(
    r"onSearchType\(\): void \{[\s\S]*?this\.showPredictions = false;\s*\}\s*\}",
    new_func,
    ts
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
