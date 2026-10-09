with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/users/profile/profile.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

segmented_control = '''
    <div class="profile-tabs">
      <button type="button" class="tab-btn" [class.active]="selectedTab === 'datos'" (click)="selectedTab = 'datos'">
        <span class="material-symbols-rounded">badge</span>
        Datos del Lector
      </button>
      <button type="button" class="tab-btn" [class.active]="selectedTab === 'paleta'" (click)="selectedTab = 'paleta'">
        <span class="material-symbols-rounded">palette</span>
        Paleta de Colores
      </button>
    </div>

    <form [formGroup]="profileForm" (ngSubmit)="onSubmit()" class="profile-layout-grid">
'''

html = re.sub(
    r"\s*<form \[formGroup\]=\"profileForm\" \(ngSubmit\)=\"onSubmit\(\)\" class=\"profile-layout-grid\">",
    segmented_control,
    html
)

html = html.replace('<div class="profile-main-col">', '<div class="profile-main-col" *ngIf="selectedTab === \'datos\'">')
html = html.replace('<aside class="profile-side-col">', '<aside class="profile-side-col" *ngIf="selectedTab === \'paleta\'">')

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/users/profile/profile.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
