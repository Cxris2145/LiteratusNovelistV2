# 1. Update tavern-bazar.component.html
path_bazar_html = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\community\tavern-bazar\tavern-bazar.component.html'
with open(path_bazar_html, 'r', encoding='utf-8') as f:
    bazar_html = f.read()

# Add customizer slot inside bz-body
old_bz_body = """  <div class="bz-body">
    <!-- Probador: en escritorio el espejo es tu Maguito sentado a la mesa; aquí solo se ve en pantallas angostas. -->
    <section class="bz-fitting" *ngIf="hasWear" aria-label="Probador de Maguito">"""

new_bz_body = """  <div class="bz-body">
    <!-- Taller de Tintes: Personalización interactiva de colores de Maguito -->
    <div class="bz-dyes-slot" *ngIf="tab === 'tintes'">
      <app-maguito-customizer
        [compact]="true"
        (saved)="onCustomizerSaved($event)"
        (canceled)="close()">
      </app-maguito-customizer>
    </div>

    <!-- Probador: en escritorio el espejo es tu Maguito sentado a la mesa; aquí solo se ve en pantallas angostas. -->
    <section class="bz-fitting" *ngIf="hasWear && tab !== 'tintes'" aria-label="Probador de Maguito">"""

bazar_html = bazar_html.replace(old_bz_body, new_bz_body)
bazar_html = bazar_html.replace(old_bz_body.replace('\n', '\r\n'), new_bz_body.replace('\n', '\r\n'))

# Ensure bz-tools and bz-grid only show when tab !== 'tintes'
bazar_html = bazar_html.replace(
    '<div class="bz-tools" *ngIf="loaded">',
    '<div class="bz-tools" *ngIf="loaded && tab !== \'tintes\'">'
)
bazar_html = bazar_html.replace(
    '<div class="bz-grid" *ngIf="loaded" (mouseleave)="peek(null)">',
    '<div class="bz-grid" *ngIf="loaded && tab !== \'tintes\'" (mouseleave)="peek(null)">'
)

with open(path_bazar_html, 'w', encoding='utf-8') as f:
    f.write(bazar_html)
print("tavern-bazar.component.html updated!")

# 2. Update profile-card.component.ts
path_pc_ts = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\community\profile-card\profile-card.component.ts'
with open(path_pc_ts, 'r', encoding='utf-8') as f:
    pc_ts = f.read()

if "customize = new EventEmitter<void>()" not in pc_ts:
    pc_ts = pc_ts.replace(
        "  @Output() dress = new EventEmitter<void>();",
        "  @Output() dress = new EventEmitter<void>();\n  /** Abre el taller de personalización de colores. */\n  @Output() customize = new EventEmitter<void>();"
    )
    with open(path_pc_ts, 'w', encoding='utf-8') as f:
        f.write(pc_ts)
    print("profile-card.component.ts updated!")

# 3. Update profile-card.component.html
path_pc_html = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\community\profile-card\profile-card.component.html'
with open(path_pc_html, 'r', encoding='utf-8') as f:
    pc_html = f.read()

old_actions = """  <div class="pc-actions" *ngIf="mine">
    <button type="button" class="th-btn secondary pc-dress" (click)="dress.emit()" [attr.aria-expanded]="dressing">
      <span class="material-symbols-rounded" aria-hidden="true">checkroom</span>Vestir a Maguito
    </button>
    <a class="th-btn ghost pc-edit" routerLink="/profile" aria-label="Editar perfil">"""

new_actions = """  <div class="pc-actions" *ngIf="mine">
    <button type="button" class="th-btn secondary pc-dress" (click)="dress.emit()" [attr.aria-expanded]="dressing">
      <span class="material-symbols-rounded" aria-hidden="true">checkroom</span>Vestir
    </button>
    <button type="button" class="th-btn secondary pc-dyes-btn" (click)="customize.emit()" title="Personalizar colores del Maguito">
      <span class="material-symbols-rounded" aria-hidden="true">palette</span>Personalizar
    </button>
    <a class="th-btn ghost pc-edit" routerLink="/profile" aria-label="Editar perfil">"""

pc_html = pc_html.replace(old_actions, new_actions)
pc_html = pc_html.replace(old_actions.replace('\n', '\r\n'), new_actions.replace('\n', '\r\n'))

with open(path_pc_html, 'w', encoding='utf-8') as f:
    f.write(pc_html)
print("profile-card.component.html updated!")

# 4. Update tavern-hall.component.html
path_hall_html = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\community\tavern-hall\tavern-hall.component.html'
with open(path_hall_html, 'r', encoding='utf-8') as f:
    hall_html = f.read()

old_hall_card = """[dressing]="bazarOpen" (dress)="openBazar('ropero')\""""
new_hall_card = """[dressing]="bazarOpen" (dress)="openBazar('ropero')" (customize)="openBazar('tintes')\""""

hall_html = hall_html.replace(old_hall_card, new_hall_card)

with open(path_hall_html, 'w', encoding='utf-8') as f:
    f.write(hall_html)
print("tavern-hall.component.html updated!")

