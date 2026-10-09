with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

setup = '''
    this.searchSubject.pipe(
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

ts = ts.replace("ngOnInit() {", "ngOnInit() {\n" + setup)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
