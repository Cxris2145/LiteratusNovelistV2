with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re
button_html = '''
                <button class="action-btn" 
                        [class.guest-btn]="!(auth.isLoggedIn$ | async)"
                        [class.buy-btn]="(auth.isLoggedIn$ | async) && !isOwned" 
                        [class.read-btn]="(auth.isLoggedIn$ | async) && isOwned"
                        [class.restricted-btn]="book?.is_age_restricted"
                        [disabled]="purchaseLoading"
                        (click)="handleAction()">
                  <ng-container *ngIf="!(auth.isLoggedIn$ | async)">
                    <svg lucideLogIn></svg> Ingresar para Explorar
                  </ng-container>
                  <ng-container *ngIf="(auth.isLoggedIn$ | async)">
                    <span *ngIf="purchaseLoading" class="flex-center">
                      <span class="spinner-small"></span> Adquiriendo obra...
                    </span>
                    <ng-container *ngIf="!purchaseLoading">
                      <span *ngIf="book?.is_age_restricted && !isOwned" class="flex-center"><svg lucideLock></svg> Restringido (+{{ book?.min_age }})</span>
                      <span *ngIf="!book?.is_age_restricted && !isOwned" class="flex-center"><svg lucideShoppingCart></svg> Adquirir Obra</span>
                      <span *ngIf="isOwned" class="flex-center"><svg lucideBookOpen></svg> Empezar Lectura</span>
                    </ng-container>
                  </ng-container>
                </button>
'''

html = re.sub(
    r"<button class=\"action-btn\".*?</button>",
    button_html,
    html,
    flags=re.DOTALL,
    count=1
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Patched HTML")
