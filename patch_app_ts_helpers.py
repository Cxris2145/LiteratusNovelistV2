with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

helpers = '''
  hasPredictionsType(type: string): boolean {
    return this.searchPredictions.some(p => p.type === type);
  }

  getPredictionsType(type: string): any[] {
    return this.searchPredictions.filter(p => p.type === type);
  }

  selectPrediction(prediction: any): void {
    this.globalSearchTerm = prediction.title;
    this.showPredictions = false;
    if (prediction.type === 'book') {
      this.router.navigate(['/book', prediction.slug || prediction.id]);
    } else if (prediction.type === 'author') {
      this.router.navigate(['/author', prediction.slug || prediction.id]);
    } else if (prediction.type === 'genre') {
      this.router.navigate(['/catalog'], { queryParams: { search: prediction.title } });
    }
  }
'''

ts = re.sub(
    r"selectPrediction\(prediction: any\): void \{[\s\S]*?\}",
    helpers.strip(),
    ts
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
