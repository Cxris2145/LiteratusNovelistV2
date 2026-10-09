with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

# Update the apiService.get call
ts = re.sub(
    r"this\.apiService\.get<any>\(`catalog/books/\?search=\$\{query\.trim\(\)\}&page_size=5`\)\.pipe\(",
    r"this.apiService.get<any>(`catalog/autocomplete/?search=${query.trim()}`).pipe(",
    ts
)

# Update the subscription res parsing
ts = ts.replace("this.searchPredictions = res.results || [];", "this.searchPredictions = [...(res.books||[]), ...(res.authors||[]), ...(res.genres||[]), ...(res.sagas||[])];")

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
