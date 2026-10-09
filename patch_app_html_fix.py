with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

dropdown_html = '''
          <div class="search-predictions-dropdown" *ngIf="showPredictions">
            <div class="prediction-group" *ngIf="hasPredictionsType('book')">
              <span class="prediction-group-title">Obras</span>
              <div class="prediction-item" *ngFor="let item of getPredictionsType('book')" (click)="selectPrediction(item)">
                <img *ngIf="item.cover" [src]="item.cover" alt="" class="prediction-cover">
                <span *ngIf="!item.cover" class="prediction-cover-placeholder"><span class="material-symbols-rounded">menu_book</span></span>
                <div class="prediction-info">
                  <span class="prediction-title">{{ item.title }}</span>
                  <span class="prediction-author" *ngIf="item.author_name">{{ item.author_name }}</span>
                </div>
              </div>
            </div>

            <div class="prediction-group" *ngIf="hasPredictionsType('author')">
              <span class="prediction-group-title">Autores</span>
              <div class="prediction-item" *ngFor="let item of getPredictionsType('author')" (click)="selectPrediction(item)">
                <span class="prediction-cover-placeholder"><span class="material-symbols-rounded">person</span></span>
                <div class="prediction-info">
                  <span class="prediction-title">{{ item.title }}</span>
                </div>
              </div>
            </div>

            <div class="prediction-group" *ngIf="hasPredictionsType('genre')">
              <span class="prediction-group-title">Géneros</span>
              <div class="prediction-item" *ngFor="let item of getPredictionsType('genre')" (click)="selectPrediction(item)">
                <span class="prediction-cover-placeholder"><span class="material-symbols-rounded">category</span></span>
                <div class="prediction-info">
                  <span class="prediction-title">{{ item.title }}</span>
                </div>
              </div>
            </div>

            <div class="prediction-item all-results" (click)="onGlobalSearch()">
              <span>Ver todos los resultados para "{{ globalSearchTerm }}"</span>
            </div>
          </div>
'''

html = re.sub(
    r"<div class=\"search-predictions-dropdown\" \*ngIf=\"showPredictions\">[\s\S]*?</form>",
    dropdown_html.strip() + "\n        </form>",
    html
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/app.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
