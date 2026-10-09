with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

# Add the prediction dropdown right after the search input
dropdown_html = '''
          <div class="search-predictions-dropdown" *ngIf="showPredictions">
            <div class="prediction-item" *ngFor="let item of searchPredictions" (click)="selectPrediction(item)">
              <img *ngIf="item.cover" [src]="item.cover" alt="" class="prediction-cover">
              <span *ngIf="!item.cover" class="prediction-cover-placeholder"><span class="material-symbols-rounded">menu_book</span></span>
              <div class="prediction-info">
                <span class="prediction-title">{{ item.title }}</span>
                <span class="prediction-author" *ngIf="item.author_name">{{ item.author_name }}</span>
              </div>
            </div>
            <div class="prediction-item all-results" (click)="onGlobalSearch()">
              <span>Ver todos los resultados para "{{ globalSearchTerm }}"</span>
            </div>
          </div>
'''

if 'search-predictions-dropdown' not in html:
    # replace the input to add (ngModelChange)="onSearchType()" and (focus)="onSearchType()"
    html = html.replace('[(ngModel)]="globalSearchTerm"', '[(ngModel)]="globalSearchTerm"\n            (ngModelChange)="onSearchType()"\n            (focus)="onSearchType()"')
    
    html = html.replace('</form>', dropdown_html + '\n        </form>')

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
