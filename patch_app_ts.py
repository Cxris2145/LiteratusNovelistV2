with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

# Add imports
if 'import { ApiService }' not in ts:
    ts = ts.replace("import { AuthService", "import { ApiService } from './core/services/api.service';\nimport { AuthService")
    ts = ts.replace("import { Subject, Observable", "import { Subject, Observable, of }")
    ts = ts.replace("import { takeUntil }", "import { takeUntil, debounceTime, distinctUntilChanged, switchMap, catchError }")
    
# Inject ApiService
if 'apiService = inject(ApiService);' not in ts:
    ts = ts.replace("authService = inject(AuthService);", "apiService = inject(ApiService);\n  authService = inject(AuthService);")

# Add variables for prediction
if 'searchPredictions: any[] = [];' not in ts:
    prediction_vars = '''
  searchPredictions: any[] = [];
  showPredictions = false;
  private searchSubject = new Subject<string>();
'''
    ts = ts.replace("globalSearchTerm = '';", "globalSearchTerm = '';" + prediction_vars)

# Setup debounce in ngOnInit
setup_code = '''
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
if 'this.searchSubject.pipe' not in ts:
    ts = ts.replace("this.loadProfile();", "this.loadProfile();\n" + setup_code)

# Add method for typing
on_type_code = '''
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
'''
if 'onSearchType(): void {' not in ts:
    ts = ts.replace("onGlobalSearch(): void {", on_type_code + "\n  onGlobalSearch(): void {")
    ts = ts.replace("this.globalSearchTerm = '';", "this.globalSearchTerm = '';\n    this.showPredictions = false;\n    this.searchPredictions = [];")

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
