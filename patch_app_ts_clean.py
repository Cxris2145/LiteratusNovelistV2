with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

# Imports
ts = ts.replace("import { AuthService", "import { ApiService } from './core/services/api.service';\nimport { AuthService")
ts = ts.replace("import { Subject, Observable", "import { Subject, Observable, of }")
ts = ts.replace("import { takeUntil }", "import { takeUntil, debounceTime, distinctUntilChanged, switchMap, catchError }")

# Inject
ts = ts.replace("authService = inject(AuthService);", "apiService = inject(ApiService);\n  authService = inject(AuthService);")

# Variables
vars = '''
  globalSearchTerm = '';
  searchPredictions: any[] = [];
  showPredictions = false;
  private searchSubject = new Subject<string>();
'''
ts = re.sub(r"globalSearchTerm = '';", vars.strip(), ts, count=1)

# Init debounce
setup = '''
    this.searchSubject.pipe(
      takeUntil(this.destroy$),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query.trim()) {
          this.searchPredictions = [];
          return of({ results: [] });
        }
        return this.apiService.get<any>(catalog/books/?search=&page_size=5).pipe(
          catchError(() => of({ results: [] }))
        );
      })
    ).subscribe(res => {
      this.searchPredictions = res.results || [];
      this.showPredictions = this.searchPredictions.length > 0;
    });
'''
ts = ts.replace("this.loadProfile();", "this.loadProfile();\n" + setup)

# Handlers
handlers = '''
  onSearchType(): void {
    this.searchSubject.next(this.globalSearchTerm);
    if (!this.globalSearchTerm.trim()) {
      this.showPredictions = false;
    }
  }

  selectPrediction(prediction: any): void {
    this.globalSearchTerm = prediction.title;
    this.showPredictions = false;
    this.router.navigate(['/book', prediction.slug || prediction.id]);
  }
  
  @HostListener('document:click', [''])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.nav-search-form')) {
      this.showPredictions = false;
    }
  }

  onGlobalSearch(): void {
'''
ts = ts.replace("onGlobalSearch(): void {", handlers.strip())

# Clear search
ts = re.sub(
    r"(clearGlobalSearch\(\): void \{\s+)this\.globalSearchTerm = '';", 
    r"\1this.globalSearchTerm = '';\n    this.showPredictions = false;\n    this.searchPredictions = [];",
    ts
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
