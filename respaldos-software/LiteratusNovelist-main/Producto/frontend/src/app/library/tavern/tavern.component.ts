import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from '../../core/services/notification.service';
import { ApiService } from '../../core/services/api.service';
import { ChatService } from '../../core/services/chat.service';
import { LearningService, ShopItem } from '../../core/services/learning.service';
import { GamificationService } from '../../core/services/gamification.service';
import { SubscriptionService, SubscriptionAccount, SubscriptionPlan, AIUsage } from '../../core/services/subscription.service';
import { isInViewport, prefersReducedMotion } from '../../core/utils/motion.util';
import { InkwellComponent } from './inkwell/inkwell.component';
import { flyInkDrops } from './ink-burst.util';
import { MaguitoOutfit, SLOT_LABELS, parseWear } from '../../core/components/maguito/maguito-outfit';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

type ShopFilter = 'all' | 'streak' | 'profile' | 'maguito';
const STREAK_ITEMS: ShopItem['item_type'][] = ['streak_shield', 'streak_repair', 'hearts_refill'];
const PROFILE_ITEMS: ShopItem['item_type'][] = ['profile_frame', 'title', 'theme'];
const WEAR_ITEMS: ShopItem['item_type'][] = ['maguito_wear'];

@Component({ selector: 'app-tavern', templateUrl: './tavern.component.html', styleUrls: ['./tavern.component.css'] })
export class TavernComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  private chat = inject(ChatService);
  private learning = inject(LearningService);
  private rewards = inject(GamificationService);
  private subscriptions = inject(SubscriptionService);
  private snack = inject(MatSnackBar);
  private notification = inject(NotificationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroy$ = new Subject<void>();
  @ViewChild('inkwell') private inkwell?: InkwellComponent;
  @ViewChild('balanceEl') private balanceEl?: ElementRef<HTMLElement>;
  plans: SubscriptionPlan[] = [];
  account: SubscriptionAccount | null = null;
  usage: AIUsage | null = null;
  inkBalance = 0;
  /** Se enciende después de la primera carga del saldo: desde ahí los cambios muestran "+N". */
  balanceReady = false;
  shopItems: ShopItem[] = [];
  visibleShopItems: ShopItem[] = [];
  shopFilter: ShopFilter = 'all';
  /** Tras usar un filtro, las tarjetas que reaparecen no repiten la animación de entrada. */
  filterUsed = false;
  readonly shopFilters: { id: ShopFilter; label: string }[] = [
    { id: 'all', label: 'Todo' }, { id: 'maguito', label: 'Maguito' }, { id: 'streak', label: 'Racha y vidas' }, { id: 'profile', label: 'Perfil' }
  ];
  /** Probador: lo que lleva puesto Maguito y lo que se está probando. */
  currentOutfit: MaguitoOutfit = {};
  previewOutfit: MaguitoOutfit = {};
  previewItem: ShopItem | null = null;
  private pinnedCode: string | null = null;
  private hoverCode: string | null = null;
  /** ?filtro=maguito (p. ej. desde "Vestir a Maguito"): se aplica cuando llega el Bazar. */
  private pendingFilter: ShopFilter | null = null;
  justBought: string | null = null;
  packages: { amount: number; price: string; currency: string }[] = [];
  dailyReward: any = null;
  history: any[] = [];
  inkHistory: any[] = [];
  showHistory = false;
  loading = true;
  loadingShop = true;
  error = '';
  shopError = '';
  busy = false;
  now = Date.now();
  serverOffset = 0;
  private timer?: ReturnType<typeof setInterval>;
  private boughtTimer?: ReturnType<typeof setTimeout>;
  private observer?: IntersectionObserver;
  private readonly session = !!localStorage.getItem('access_token');
  isLoggedIn(): boolean { return this.session; }
  formatAmount(value: number): string { return Number(value || 0).toLocaleString('es-CL'); }
  price(plan: SubscriptionPlan): string { return `US$${Number(plan.price).toLocaleString('es-CL', { minimumFractionDigits: 2 })}`; }
  get percent(): number { return this.usage?.token_limit ? Math.min(100, Math.round(this.usage.tokens_used / this.usage.token_limit * 100)) : 0; }
  get elapsed(): string { const n = this.usage?.active_seconds || 0; return `${Math.floor(n / 3600)} h ${Math.floor(n % 3600 / 60)} min`; }
  get resetIn(): string {
    const n = Math.max(0, (Date.parse(this.usage?.resets_at || '') - this.now - this.serverOffset) / 1000) || 0;
    return `${Math.floor(n / 3600).toString().padStart(2, '0')} h ${Math.floor(n % 3600 / 60).toString().padStart(2, '0')} min`;
  }
  date(value: string | null | undefined): string { return value ? new Date(value).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long', year: 'numeric' }) : 'Pendiente'; }
  extraBenefits(plan: SubscriptionPlan): string[] { return plan.benefits.filter(value => !value.startsWith('Personajes y autores') && !value.startsWith('Asistente general')); }
  purchaseLabel(payment: any): string { return payment.item_type === 'plan' ? 'Plan ' + (this.plans.find(p => p.code === payment.item_reference)?.name || 'Literatus') : payment.item_type === 'ink' ? payment.item_reference + ' Tinta' : 'Libro'; }
  inkLabel(concept: string): string {
    const labels: Record<string, string> = {
      ai_chat: 'Conversación',
      ai_audio: 'Narración de audio',
      legacy_spend: 'Canje de Tinta',
      ink_purchase: 'Recarga de Tinta',
      subscription_bonus: 'Bono mensual de Maestro',
      daily_reward: 'Recompensa diaria',
      daily_enigma: 'Enigma literario',
      quiz_passed: 'Nivel superado (La Senda)',
      quiz_practice: 'Práctica de nivel',
      mission_completed: 'Misión completada',
      achievement_unlocked: 'Logro desbloqueado',
      ai_interaction: 'Recompensa de conversación',
      streak_bonus_day: 'Recompensa de racha',
      streak_milestone: 'Hito de racha alcanzado',
      reading_session: 'Recompensa de lectura',
      chapter_read: 'Capítulo leído',
      book_completed: 'Obra completada',
      review_written: 'Reseña de obra'
    };
    return labels[concept] || (concept.startsWith('shop_purchase_') ? 'Canje en el Bazar' : 'Movimiento de Tinta');
  }
  get statusLabel(): string {
    const sub = this.account?.subscription;
    if (!sub) return 'Sin suscripción';
    if (sub.active) return sub.cancel_at_period_end ? 'Activo hasta el fin del período' : 'Activo';
    return ['APPROVAL_PENDING', 'CREATING'].includes(sub.status) ? 'Pendiente de aprobación' : 'Sin período pagado vigente';
  }
  isCurrentPlan(plan: SubscriptionPlan): boolean { return !!this.account?.subscription?.active && this.account.subscription.plan?.code === plan.code; }
  planDisabled(plan: SubscriptionPlan): boolean {
    const sub = this.account?.subscription;
    return this.busy || (this.isLoggedIn() && (!plan.purchasable || (!!sub?.active && (sub.plan?.code === plan.code || sub.cancel_at_period_end))));
  }
  planLabel(plan: SubscriptionPlan): string {
    if (this.isCurrentPlan(plan)) return 'Tu plan actual';
    return (this.account?.subscription?.active ? 'Cambiar a ' : 'Elegir ') + plan.name;
  }
  canBuy(item: ShopItem): boolean { return !item.is_owned || STREAK_ITEMS.includes(item.item_type); }
  canEquip(item: ShopItem): boolean { return item.is_owned && (PROFILE_ITEMS.includes(item.item_type) || this.isWear(item)); }
  isWear(item: ShopItem): boolean { return WEAR_ITEMS.includes(item.item_type); }
  wearSlotLabel(item: ShopItem): string { const wear = parseWear(item.value); return wear ? SLOT_LABELS[wear.slot] : ''; }
  missingInk(item: ShopItem): number { return this.isLoggedIn() ? Math.max(0, item.cost_ink - this.inkBalance) : 0; }
  get showShopFilters(): boolean {
    const groups = [STREAK_ITEMS, PROFILE_ITEMS, WEAR_ITEMS].filter(group => this.shopItems.some(i => group.includes(i.item_type)));
    return groups.length >= 2;
  }
  get hasWearables(): boolean { return this.shopItems.some(i => this.isWear(i)); }
  /** El probador se muestra con la ropa a la vista: en "Todo" y en "Maguito". */
  get showFitting(): boolean { return this.hasWearables && (this.shopFilter === 'all' || this.shopFilter === 'maguito'); }
  /** Nombre para la View Transition de cada tarjeta del Bazar (debe ser un identificador CSS). */
  vtName(item: ShopItem): string { return 'tv-item-' + item.code.replace(/[^a-zA-Z0-9_-]/g, '-'); }
  unitPrice(pack: { amount: number; price: string }): string {
    const value = Number(pack.price) / Number(pack.amount);
    return Number.isFinite(value) && value > 0 ? '$' + value.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  }
  trackPlan = (_: number, plan: SubscriptionPlan) => plan.code;
  trackItem = (_: number, item: ShopItem) => item.code;
  trackPack = (_: number, pack: { amount: number }) => pack.amount;

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('filtro') === 'maguito') this.pendingFilter = 'maguito';
    this.subscriptions.plans().pipe(takeUntil(this.destroy$)).subscribe({ next: v => { this.plans = v; this.loading = false; }, error: () => { this.loading = false; this.error = 'No pudimos cargar los planes. Intenta de nuevo.'; } });
    this.api.get<any[]>('finance/ink-packages/').pipe(takeUntil(this.destroy$)).subscribe({ next: v => this.packages = v, error: () => {} });
    if (this.isLoggedIn()) {
      // El Bazar exige sesión: sin ella el 401 mandaría al visitante a /login.
      this.loadShop();
      this.refreshAccount(); this.loadReward();
      if (this.route.snapshot.queryParamMap.get('paypal') === 'return') {
        this.snack.open('Confirmando tu suscripción. Los beneficios aparecerán al validar el pago.', 'Cerrar', { duration: 6000 });
        this.subscriptions.manage('refresh').subscribe({ next: () => this.refreshAccount(), error: () => this.refreshAccount() });
      }
      this.timer = setInterval(() => { this.now = Date.now(); if (!document.hidden) this.refreshAccount(); }, 30000);
    }
  }

  ngAfterViewInit(): void {
    // Un solo observador para toda la página: revela cada sección la primera vez que entra
    // y pausa sus animaciones en bucle mientras está fuera de pantalla.
    const sections = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-tv-section]'));
    if (typeof IntersectionObserver === 'undefined') { sections.forEach(s => s.classList.add('is-revealed')); return; }
    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const section = entry.target as HTMLElement;
          section.dataset['onscreen'] = String(entry.isIntersecting);
          if (entry.isIntersecting) section.classList.add('is-revealed');
        }
      }, { rootMargin: '0px 0px -8% 0px' });
      sections.forEach(section => this.observer!.observe(section));
    });
  }

  refreshAccount(): void {
    this.subscriptions.account().pipe(takeUntil(this.destroy$)).subscribe({
      next: value => {
        this.account = value; this.inkBalance = value.ink_balance; this.chat.updateInkBalance(value.ink_balance);
        if (!this.balanceReady) setTimeout(() => this.balanceReady = true);
      },
      error: () => this.error = 'No pudimos actualizar tu cuenta. Recarga la página para intentarlo de nuevo.'
    });
    this.subscriptions.usage().pipe(takeUntil(this.destroy$)).subscribe({ next: value => { this.usage = value; this.serverOffset = Date.parse(value.server_now) - Date.now(); }, error: () => {} });
  }
  jump(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
  choosePlan(plan: SubscriptionPlan): void {
    if (!this.isLoggedIn()) { this.router.navigate(['/login'], { queryParams: { returnUrl: '/tavern/tienda' } }); return; }
    if (this.busy) return;
    this.busy = true;
    const request = this.account?.subscription?.active ? this.subscriptions.manage('change', plan.code) : this.subscriptions.subscribe(plan.code);
    request.subscribe({ next: value => { this.busy = false; if (value.approval_url) window.location.assign(value.approval_url); else this.refreshAccount(); }, error: err => this.operationError(err) });
  }
  cancelRenewal(): void {
    if (this.busy) return;
    this.busy = true;
    this.subscriptions.manage('cancel').subscribe({ next: value => { this.account = value; this.busy = false; this.notification.info('Renovación cancelada. Conservas tu período pagado y tu Tinta.', 'Suscripción'); }, error: err => this.operationError(err) });
  }
  equipFrame(): void { this.subscriptions.equipFrame().subscribe({ next: () => { this.chat.notifyProfileUpdate(); this.notification.success('Marco Maestro equipado correctamente.', 'Cosméticos'); }, error: err => this.operationError(err) }); }
  loadHistory(): void {
    this.showHistory = !this.showHistory;
    if (!this.showHistory) return;
    this.api.get<any[]>('finance/history/').subscribe({ next: v => this.history = v, error: err => this.operationError(err) });
    this.api.get<any>('library/ink-history/').subscribe({ next: v => this.inkHistory = Array.isArray(v) ? v : v.results || [], error: () => {} });
  }
  loadShop(): void {
    this.loadingShop = true;
    this.learning.getShopItems().pipe(takeUntil(this.destroy$)).subscribe({
      next: v => {
        this.shopItems = v;
        this.currentOutfit = this.equippedOutfit(v);
        if (this.pendingFilter && this.hasWearables) {
          this.shopFilter = this.pendingFilter;
          this.pendingFilter = null;
          // Salto directo (sin animación): la página recién se abrió para esto.
          setTimeout(() => document.getElementById('bazar-title')?.scrollIntoView({ block: 'start' }));
        }
        this.applyShopFilter();
        this.updatePreview();
        this.loadingShop = false;
      },
      error: () => { this.loadingShop = false; this.shopError = 'El Bazar no está disponible en este momento.'; }
    });
  }
  setShopFilter(filter: ShopFilter): void {
    if (filter === this.shopFilter) return;
    this.filterUsed = true;
    this.cdr.detectChanges();
    const apply = () => { this.shopFilter = filter; this.applyShopFilter(); this.cdr.detectChanges(); };
    const doc = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
    if (!doc.startViewTransition || prefersReducedMotion()) { apply(); return; }
    // La clase limita el estilo de la transición (styles.css) a este cambio de filtro.
    document.documentElement.classList.add('tv-vt');
    doc.startViewTransition(apply).finished.finally(() => document.documentElement.classList.remove('tv-vt'));
  }
  buyShopItem(item: ShopItem): void {
    if (!this.isLoggedIn()) { this.router.navigate(['/login']); return; }
    if (this.busy) return;
    this.busy = true;
    this.learning.buyShopItem(item.code).subscribe({
      next: value => {
        this.busy = false; this.markBought(item.code);
        if (this.isWear(item)) { this.pinnedCode = null; this.hoverCode = null; }
        this.notification.success(value.message || 'Artículo adquirido.', 'Bazar'); this.refreshAccount(); this.loadShop();
      },
      error: err => this.operationError(err)
    });
  }
  equipShopItem(item: ShopItem): void {
    this.learning.equipShopItem(item.code).subscribe({ next: value => { this.notification.success(value.message || 'Artículo equipado.', 'Bazar'); this.chat.notifyProfileUpdate(); this.loadShop(); }, error: err => this.operationError(err) });
  }
  /** Quita la prenda: ese espacio vuelve a lo de siempre (sombrero de mago, lentes redondos…). */
  unequipWear(item: ShopItem): void {
    const wear = parseWear(item.value);
    if (!wear || this.busy) return;
    this.busy = true;
    this.learning.unequipShopSlot(wear.slot).subscribe({
      next: value => { this.busy = false; this.notification.success(value.message || 'Accesorio guardado.', 'Bazar'); this.loadShop(); },
      error: err => this.operationError(err)
    });
  }

  // ── Probador ──────────────────────────────────────────────
  /** "Probar": deja la prenda puesta en el probador hasta elegir otra o restablecer. */
  tryOn(item: ShopItem): void {
    this.pinnedCode = this.pinnedCode === item.code ? null : item.code;
    this.updatePreview();
  }
  isTrying(item: ShopItem): boolean { return this.pinnedCode === item.code; }
  /** Pasar el mouse o el foco por una prenda la muestra mientras tanto. */
  peek(item: ShopItem | null): void {
    const code = item && this.isWear(item) ? item.code : null;
    if (code === this.hoverCode) return;
    this.hoverCode = code;
    this.updatePreview();
  }
  resetPreview(): void {
    this.pinnedCode = null;
    this.hoverCode = null;
    this.updatePreview();
  }
  private updatePreview(): void {
    const code = this.hoverCode ?? this.pinnedCode;
    this.previewItem = code ? this.shopItems.find(i => i.code === code) ?? null : null;
    const wear = this.previewItem ? parseWear(this.previewItem.value) : null;
    this.previewOutfit = wear ? { ...this.currentOutfit, [wear.slot]: wear.variant } : this.currentOutfit;
  }
  private equippedOutfit(items: ShopItem[]): MaguitoOutfit {
    const outfit: MaguitoOutfit = {};
    for (const item of items) {
      const wear = item.is_equipped && this.isWear(item) ? parseWear(item.value) : null;
      if (wear) outfit[wear.slot] = wear.variant;
    }
    return outfit;
  }
  buyInk(amount: number): void { this.router.navigate(this.isLoggedIn() ? ['/checkout', 'ink', amount] : ['/login']); }
  loadReward(): void { this.rewards.getDailyRewardStatus().subscribe({ next: v => this.dailyReward = v, error: () => {} }); }
  /** `origin` es el botón pulsado: de ahí salen las gotas hacia el tintero o el saldo. */
  claimReward(origin?: EventTarget | null): void {
    if (this.busy) return;
    this.busy = true;
    this.rewards.claimDailyReward().subscribe({
      next: v => {
        const finish = () => {
          this.busy = false;
          if (v?.new_ink_balance !== undefined) {
            this.inkBalance = v.new_ink_balance;
            this.chat.updateInkBalance(v.new_ink_balance);
          }
          this.notification.gamify('ink', v?.reward_amount, v.message || '¡Recompensa diaria reclamada con éxito!', 'Recompensa Diaria');
          this.refreshAccount();
          this.loadReward();
        };
        this.celebrateReward(origin as HTMLElement | null).then(() => this.zone.run(finish));
      },
      error: err => this.operationError(err)
    });
  }
  private celebrateReward(origin: HTMLElement | null): Promise<void> {
    if (!origin || prefersReducedMotion()) return Promise.resolve();
    const well = this.inkwell?.target();
    const target = [well, this.balanceEl?.nativeElement].find(el => isInViewport(el)) ?? null;
    return this.zone.runOutsideAngular(() => {
      this.host.nativeElement.querySelectorAll<HTMLElement>('.tv-reward .tv-wax-half').forEach((half, i) => half.animate(
        [{ transform: 'none', opacity: 1 }, { transform: `translate(${i ? 12 : -12}px, 10px) rotate(${i ? 28 : -28}deg)`, opacity: 0 }],
        { duration: 650, easing: 'cubic-bezier(.3, 0, .7, 1)', fill: 'forwards' }));
      return flyInkDrops(origin, target).then(() => { if (target && target === well) this.inkwell?.splash(); });
    });
  }
  private applyShopFilter(): void {
    const groups: Partial<Record<ShopFilter, ShopItem['item_type'][]>> = { streak: STREAK_ITEMS, profile: PROFILE_ITEMS, maguito: WEAR_ITEMS };
    const group = groups[this.shopFilter] ?? null;
    this.visibleShopItems = group ? this.shopItems.filter(i => group.includes(i.item_type)) : this.shopItems;
  }
  private markBought(code: string): void {
    this.justBought = code;
    clearTimeout(this.boughtTimer);
    this.boughtTimer = setTimeout(() => this.justBought = null, 2400);
  }
  private operationError(err: any): void { this.busy = false; this.notification.error(err.error?.message || err.error?.error || 'No se pudo completar la operación. Intenta nuevamente.', 'Atención'); }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    clearTimeout(this.boughtTimer);
    this.observer?.disconnect();
    document.documentElement.classList.remove('tv-vt');
    this.destroy$.next(); this.destroy$.complete();
  }
}
