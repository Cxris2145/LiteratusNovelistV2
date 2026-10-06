import {
  Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { MaguitoOutfit, SLOT_LABELS, WEAR_SLOTS, WearSlot, parseWear } from '../../core/components/maguito/maguito-outfit';
import { ChatService } from '../../core/services/chat.service';
import { GamificationService } from '../../core/services/gamification.service';
import { LearningService, ShopItem } from '../../core/services/learning.service';
import { NotificationService } from '../../core/services/notification.service';

/** Mostradores del Bazar: el ropero de Maguito, lo que cuida tu racha y lo que adorna tu perfil. */
export type BazarTab = 'ropero' | 'racha' | 'perfil';
export type BazarGesture = 'try' | 'buy' | 'equip';
type WearFilter = 'all' | WearSlot;

const TAB_ITEMS: Record<BazarTab, ShopItem['item_type'][]> = {
  ropero: ['maguito_wear'],
  racha: ['streak_shield', 'streak_repair', 'hearts_refill'],
  perfil: ['profile_frame', 'title', 'theme'],
};
/** Lo que se gasta al usarlo: se puede canjear otra vez aunque ya tengas uno. */
const CONSUMABLES = TAB_ITEMS.racha;

export function isBazarTab(value: string | null | undefined): value is BazarTab {
  return value === 'ropero' || value === 'racha' || value === 'perfil';
}

/**
 * El Bazar de la Taberna: un mostrador lateral que se abre sin salir de la mesa. En el ropero,
 * lo que te pruebas lo luce tu Maguito sentado a la mesa (`preview`); en pantallas angostas, donde
 * la mesa queda detrás, el panel trae su propio espejo.
 */
@Component({
  selector: 'app-tavern-bazar',
  templateUrl: './tavern-bazar.component.html',
  styleUrls: ['../community-shared.css', './tavern-bazar.component.css'],
})
export class TavernBazarComponent implements OnInit, OnChanges, OnDestroy {
  private learning = inject(LearningService);
  private chat = inject(ChatService);
  private rewards = inject(GamificationService);
  private notification = inject(NotificationService);
  private destroy$ = new Subject<void>();

  @Input() open = false;
  @Input() tab: BazarTab = 'ropero';
  /** Lo que lleva puesto tu Maguito (tu perfil). Sin él, se deduce de las piezas equipadas. */
  @Input() wearing: MaguitoOutfit | null | undefined = null;
  /** Cierra el panel (botón, Escape o fondo en el celular). */
  @Output() closed = new EventEmitter<void>();
  /** Atuendo que debe lucir el Maguito de la mesa; null = el que lleva puesto. */
  @Output() preview = new EventEmitter<MaguitoOutfit | null>();
  /** Probar, canjear o ponerse algo: la mesa lo celebra. */
  @Output() gesture = new EventEmitter<BazarGesture>();
  /** La ropa guardada cambió (al ponerse o quitarse una pieza). */
  @Output() outfitChange = new EventEmitter<MaguitoOutfit>();

  @ViewChild('heading') private heading?: ElementRef<HTMLElement>;

  readonly tabLabels: Record<BazarTab, string> = { ropero: 'Ropero', racha: 'Racha y vidas', perfil: 'Perfil' };
  readonly tabIcons: Record<BazarTab, string> = { ropero: 'checkroom', racha: 'local_fire_department', perfil: 'badge' };
  private readonly wearFilterLabels: Record<WearFilter, string> = {
    all: 'Todo', head: 'Sombreros', eyes: 'Lentes', face: 'Barbas', neck: 'Cuello', cape: 'Capas',
  };

  balance = 0;
  items: ShopItem[] = [];
  visibleItems: ShopItem[] = [];
  tabs: BazarTab[] = [];
  wearFilters: { id: WearFilter; label: string }[] = [];
  wearFilter: WearFilter = 'all';
  query = '';
  ownedOnly = false;
  loading = false;
  loaded = false;
  error = '';
  /** Código del artículo en curso (o 'reward' al reclamar la Tinta del día). */
  busy = '';
  justBought: string | null = null;
  dailyReward: { can_claim: boolean; ink_reward: number } | null = null;

  /** Probador: lo que lleva puesto Maguito y lo que se está probando. */
  currentOutfit: MaguitoOutfit = {};
  previewOutfit: MaguitoOutfit = {};
  previewItem: ShopItem | null = null;
  tryingItems: ShopItem[] = [];
  itemLooks: Record<string, MaguitoOutfit> = {};
  private pinnedCodes: Partial<Record<WearSlot, string>> = {};
  private hoverCode: string | null = null;
  private returnFocus: HTMLElement | null = null;
  private boughtTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.chat.inkBalance$.pipe(takeUntil(this.destroy$)).subscribe(value => this.balance = value);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tab'] && !changes['tab'].firstChange) this.selectTab(this.tab);
    if (changes['wearing'] && this.wearing) {
      this.currentOutfit = { ...this.wearing };
      this.updatePreview();
    }
    if (!changes['open']) return;
    if (this.open) {
      this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!this.loaded && !this.loading) this.load();
      this.chat.loadInitialInk();
      this.loadReward();
      // El encabezado recibe el foco cuando el panel ya es visible: se anuncia y no salta la página.
      setTimeout(() => this.heading?.nativeElement.focus({ preventScroll: true }), 60);
      this.emitPreview();
    } else if (!changes['open'].firstChange) {
      this.pinnedCodes = {};
      this.hoverCode = null;
      this.updatePreview();
      this.preview.emit(null);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.boughtTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  close(): void {
    if (!this.open) return;
    this.closed.emit();
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) setTimeout(() => target.focus({ preventScroll: true }));
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.learning.getShopItems().pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        this.setItems(items);
        this.loading = false;
        this.loaded = true;
      },
      error: () => {
        this.loading = false;
        this.error = 'El Bazar no abrió sus puertas. Revisa tu conexión e inténtalo otra vez.';
      },
    });
  }

  // ── Mostradores y filtros ─────────────────────────────────

  selectTab(tab: BazarTab): void {
    this.tab = tab;
    this.wearFilter = 'all';
    this.applyFilter();
  }

  setWearFilter(filter: WearFilter): void {
    this.wearFilter = filter;
    this.applyFilter();
  }

  toggleOwned(): void {
    this.ownedOnly = !this.ownedOnly;
    this.applyFilter();
  }

  clearFilters(): void {
    this.query = '';
    this.ownedOnly = false;
    this.wearFilter = 'all';
    this.applyFilter();
  }

  applyFilter(): void {
    const types = TAB_ITEMS[this.tab];
    const query = normalize(this.query.trim());
    this.visibleItems = this.items.filter(item => {
      if (!types.includes(item.item_type)) return false;
      if (this.tab === 'ropero' && this.wearFilter !== 'all' && parseWear(item.value)?.slot !== this.wearFilter) return false;
      if (this.ownedOnly && !item.is_owned) return false;
      return !query || normalize(item.name + ' ' + item.description).includes(query);
    });
  }

  // ── Probador ──────────────────────────────────────────────

  /** "Probar": deja la pieza puesta hasta elegir otra del mismo espacio o restablecer. */
  tryOn(item: ShopItem): void {
    const wear = parseWear(item.value);
    if (!this.isWear(item) || !wear) return;
    const removing = this.pinnedCodes[wear.slot] === item.code;
    if (removing) delete this.pinnedCodes[wear.slot];
    else this.pinnedCodes[wear.slot] = item.code;
    this.hoverCode = null;
    this.updatePreview();
    if (!removing) this.gesture.emit('try');
  }

  isTrying(item: ShopItem): boolean {
    return this.pinnedCodes[this.wearSlot(item)] === item.code;
  }

  removeTry(item: ShopItem): void {
    delete this.pinnedCodes[this.wearSlot(item)];
    this.hoverCode = null;
    this.updatePreview();
  }

  /** Pasar el mouse o el foco por una pieza la muestra mientras tanto. */
  peek(item: ShopItem | null): void {
    const code = item && this.isWear(item) ? item.code : null;
    if (code === this.hoverCode) return;
    this.hoverCode = code;
    this.updatePreview();
  }

  leavePeek(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) this.peek(null);
  }

  resetPreview(): void {
    this.pinnedCodes = {};
    this.hoverCode = null;
    this.updatePreview();
  }

  // ── Canjes ────────────────────────────────────────────────

  buy(item: ShopItem): void {
    if (this.busy || this.missingInk(item) > 0) return;
    this.busy = item.code;
    this.learning.buyShopItem(item.code).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.busy = '';
        if (typeof result?.ink_balance === 'number') this.chat.updateInkBalance(result.ink_balance);
        // Una prenda canjeada se pone de inmediato: el servidor devuelve el atuendo resultante.
        if (result?.outfit && this.isWear(item)) {
          delete this.pinnedCodes[this.wearSlot(item)];
          this.saveOutfit(result.outfit);
        }
        this.markBought(item.code);
        this.gesture.emit('buy');
        this.notification.success(result?.message || `${item.name} ya es tuyo.`, 'Bazar');
        this.reload();
      },
      error: err => this.fail(err),
    });
  }

  equip(item: ShopItem): void {
    if (this.busy || item.is_equipped) return;
    this.busy = item.code;
    this.learning.equipShopItem(item.code).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.busy = '';
        const wear = this.isWear(item) ? parseWear(item.value) : null;
        if (wear) {
          // La mesa luce la pieza al instante, sin esperar a que vuelva la lista.
          delete this.pinnedCodes[wear.slot];
          this.saveOutfit(result?.outfit ?? { ...this.currentOutfit, [wear.slot]: wear.variant });
          this.gesture.emit('equip');
        }
        this.chat.notifyProfileUpdate();
        this.notification.success(result?.message || `${item.name} equipado.`, 'Bazar');
        this.reload();
      },
      error: err => this.fail(err),
    });
  }

  /** Quita la prenda: ese espacio vuelve a lo de siempre (sombrero de mago, lentes redondos…). */
  unequip(item: ShopItem): void {
    const wear = parseWear(item.value);
    if (!wear || this.busy) return;
    this.busy = item.code;
    this.learning.unequipShopSlot(wear.slot).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.busy = '';
        const outfit: MaguitoOutfit = { ...this.currentOutfit };
        delete outfit[wear.slot];
        this.saveOutfit(result?.outfit ?? outfit);
        this.chat.notifyProfileUpdate();
        this.notification.success(result?.message || `${item.name} volvió a tu baúl.`, 'Bazar');
        this.reload();
      },
      error: err => this.fail(err),
    });
  }

  claimReward(): void {
    if (this.busy || !this.dailyReward?.can_claim) return;
    this.busy = 'reward';
    this.rewards.claimDailyReward().pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.busy = '';
        this.dailyReward = this.dailyReward ? { ...this.dailyReward, can_claim: false } : null;
        if (typeof result?.new_ink_balance === 'number') this.chat.updateInkBalance(result.new_ink_balance);
        this.notification.gamify('ink', result?.reward_amount, result?.message || 'Tu Tinta del día ya está en tu bolsa.', 'Recompensa diaria');
      },
      error: err => this.fail(err),
    });
  }

  // ── Ayudas para la plantilla ──────────────────────────────

  isWear(item: ShopItem): boolean { return item.item_type === 'maguito_wear'; }
  canBuy(item: ShopItem): boolean { return !item.is_owned || CONSUMABLES.includes(item.item_type); }
  canEquip(item: ShopItem): boolean { return item.is_owned && (this.isWear(item) || TAB_ITEMS.perfil.includes(item.item_type)); }
  wearSlot(item: ShopItem): WearSlot { return parseWear(item.value)?.slot ?? 'head'; }
  slotLabel(item: ShopItem): string { return SLOT_LABELS[this.wearSlot(item)]; }
  missingInk(item: ShopItem): number { return Math.max(0, item.cost_ink - this.balance); }
  /** Cuánto del precio ya tienes, de 0 a 1 (para la barra de "te faltan"). */
  progressTo(item: ShopItem): number { return item.cost_ink ? Math.min(1, this.balance / item.cost_ink) : 1; }
  format(value: number): string { return Number(value || 0).toLocaleString('es-CL'); }
  count(tab: BazarTab): number { return this.items.filter(item => TAB_ITEMS[tab].includes(item.item_type)).length; }
  get hasWear(): boolean { return this.tab === 'ropero' && this.items.some(item => this.isWear(item)); }
  get mirrorCaption(): string {
    if (this.tryingItems.length > 1) return `Tu combinación de ${this.tryingItems.length} piezas`;
    if (this.previewItem) return `Así te ves con ${this.previewItem.name}`;
    return 'Así luce tu Maguito hoy';
  }
  trackItem = (_: number, item: ShopItem) => item.code;

  // ── Interno ───────────────────────────────────────────────

  private reload(): void {
    this.learning.getShopItems().pipe(takeUntil(this.destroy$)).subscribe({ next: items => this.setItems(items), error: () => {} });
  }

  private saveOutfit(outfit: MaguitoOutfit): void {
    this.currentOutfit = outfit;
    this.updatePreview();
    this.outfitChange.emit({ ...outfit });
  }

  private setItems(items: ShopItem[]): void {
    this.items = items;
    if (!this.wearing) {
      this.currentOutfit = {};
      for (const item of items) {
        const wear = item.is_equipped && this.isWear(item) ? parseWear(item.value) : null;
        if (wear) this.currentOutfit[wear.slot] = wear.variant;
      }
    }
    // Cada miniatura muestra la pieza sobre un Maguito de base, sin el resto de tu ropa.
    this.itemLooks = Object.fromEntries(items.filter(item => this.isWear(item)).map(item => {
      const wear = parseWear(item.value);
      return [item.code, { head: 'beret', eyes: 'none', face: 'none', neck: 'none', cape: 'gold', ...(wear ? { [wear.slot]: wear.variant } : {}) }];
    }));
    this.tabs = (Object.keys(TAB_ITEMS) as BazarTab[]).filter(tab => this.count(tab) > 0);
    if (this.tabs.length && !this.tabs.includes(this.tab)) this.tab = this.tabs[0];
    const slots = new Set(items.filter(item => this.isWear(item)).map(item => this.wearSlot(item)));
    this.wearFilters = (['all', ...WEAR_SLOTS] as WearFilter[])
      .filter(id => id === 'all' || slots.has(id))
      .map(id => ({ id, label: this.wearFilterLabels[id] }));
    if (this.wearFilters.length <= 2) this.wearFilters = [];
    this.applyFilter();
    this.updatePreview();
  }

  private updatePreview(): void {
    this.tryingItems = WEAR_SLOTS.flatMap(slot => this.items.filter(item => item.code === this.pinnedCodes[slot]));
    this.previewOutfit = { ...this.currentOutfit };
    for (const item of this.tryingItems) {
      const wear = parseWear(item.value);
      if (wear) this.previewOutfit[wear.slot] = wear.variant;
    }
    this.previewItem = (this.hoverCode ? this.items.find(item => item.code === this.hoverCode) : null) ?? this.tryingItems.at(-1) ?? null;
    const wear = this.previewItem ? parseWear(this.previewItem.value) : null;
    if (wear) this.previewOutfit[wear.slot] = wear.variant;
    this.emitPreview();
  }

  private emitPreview(): void {
    if (!this.open) return;
    this.preview.emit(this.previewItem || this.tryingItems.length ? { ...this.previewOutfit } : null);
  }

  private loadReward(): void {
    this.rewards.getDailyRewardStatus().pipe(takeUntil(this.destroy$)).subscribe({
      next: status => this.dailyReward = status ? { can_claim: !!status.can_claim, ink_reward: Number(status.ink_reward) || 0 } : null,
      error: () => this.dailyReward = null,
    });
  }

  private markBought(code: string): void {
    this.justBought = code;
    clearTimeout(this.boughtTimer);
    this.boughtTimer = setTimeout(() => this.justBought = null, 2400);
  }

  private fail(err: any): void {
    this.busy = '';
    this.notification.error(err?.error?.message || err?.error?.error || 'No se pudo completar el canje. Inténtalo de nuevo.', 'Bazar');
  }
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');
}
