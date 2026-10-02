import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { ChatService } from '../../core/services/chat.service';
import { LearningService, ShopItem } from '../../core/services/learning.service';
import { GamificationService } from '../../core/services/gamification.service';
import { SubscriptionService, SubscriptionAccount, SubscriptionPlan, AIUsage } from '../../core/services/subscription.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({ selector: 'app-tavern', templateUrl: './tavern.component.html', styleUrls: ['./tavern.component.css'] })
export class TavernComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private chat = inject(ChatService);
  private learning = inject(LearningService);
  private rewards = inject(GamificationService);
  private subscriptions = inject(SubscriptionService);
  private snack = inject(MatSnackBar);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();
  plans: SubscriptionPlan[] = [];
  account: SubscriptionAccount | null = null;
  usage: AIUsage | null = null;
  inkBalance = 0;
  shopItems: ShopItem[] = [];
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
  isLoggedIn(): boolean { return !!localStorage.getItem('access_token'); }
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
    const labels: Record<string, string> = { ai_chat: 'Conversación', ai_audio: 'Narración de audio', legacy_spend: 'Canje de Tinta', ink_purchase: 'Recarga de Tinta', subscription_bonus: 'Bono mensual de Maestro', daily_reward: 'Recompensa diaria', mission_completed: 'Misión completada', achievement_unlocked: 'Logro desbloqueado', ai_interaction: 'Recompensa de conversación', streak_bonus_day: 'Recompensa de racha', reading_session: 'Recompensa de lectura' };
    return labels[concept] || (concept.startsWith('shop_purchase_') ? 'Canje en el Bazar' : 'Movimiento de Tinta');
  }
  get statusLabel(): string {
    const sub = this.account?.subscription;
    if (!sub) return 'Sin suscripción';
    if (sub.active) return sub.cancel_at_period_end ? 'Activo hasta el fin del período' : 'Activo';
    return ['APPROVAL_PENDING', 'CREATING'].includes(sub.status) ? 'Pendiente de aprobación' : 'Sin período pagado vigente';
  }
  ngOnInit(): void {
    this.subscriptions.plans().pipe(takeUntil(this.destroy$)).subscribe({ next: v => { this.plans = v; this.loading = false; }, error: () => { this.loading = false; this.error = 'No pudimos cargar los planes. Intenta de nuevo.'; } });
    this.api.get<any[]>('finance/ink-packages/').pipe(takeUntil(this.destroy$)).subscribe({ next: v => this.packages = v, error: () => {} });
    this.loadShop();
    if (this.isLoggedIn()) {
      this.refreshAccount(); this.loadReward();
      if (this.route.snapshot.queryParamMap.get('paypal') === 'return') {
        this.snack.open('Confirmando tu suscripción. Los beneficios aparecerán al validar el pago.', 'Cerrar', { duration: 6000 });
        this.subscriptions.manage('refresh').subscribe({ next: () => this.refreshAccount(), error: () => this.refreshAccount() });
      }
      this.timer = setInterval(() => { this.now = Date.now(); if (!document.hidden) this.refreshAccount(); }, 30000);
    }
  }
  refreshAccount(): void {
    this.subscriptions.account().pipe(takeUntil(this.destroy$)).subscribe({ next: value => { this.account = value; this.inkBalance = value.ink_balance; this.chat.updateInkBalance(value.ink_balance); }, error: () => this.error = 'No pudimos actualizar tu cuenta. Recarga la página para intentarlo de nuevo.' });
    this.subscriptions.usage().pipe(takeUntil(this.destroy$)).subscribe({ next: value => { this.usage = value; this.serverOffset = Date.parse(value.server_now) - Date.now(); }, error: () => {} });
  }
  choosePlan(plan: SubscriptionPlan): void {
    if (!this.isLoggedIn()) { this.router.navigate(['/login'], { queryParams: { returnUrl: '/tavern' } }); return; }
    if (this.busy) return;
    this.busy = true;
    const request = this.account?.subscription?.active ? this.subscriptions.manage('change', plan.code) : this.subscriptions.subscribe(plan.code);
    request.subscribe({ next: value => { this.busy = false; if (value.approval_url) window.location.assign(value.approval_url); else this.refreshAccount(); }, error: err => this.operationError(err) });
  }
  cancelRenewal(): void {
    if (this.busy) return;
    this.busy = true;
    this.subscriptions.manage('cancel').subscribe({ next: value => { this.account = value; this.busy = false; this.snack.open('Renovación cancelada. Conservas tu período pagado y tu Tinta.', 'Cerrar', { duration: 6000 }); }, error: err => this.operationError(err) });
  }
  equipFrame(): void { this.subscriptions.equipFrame().subscribe({ next: () => { this.chat.notifyProfileUpdate(); this.snack.open('Marco Maestro equipado', 'Cerrar', { duration: 3000 }); }, error: err => this.operationError(err) }); }
  loadHistory(): void {
    this.showHistory = !this.showHistory;
    if (!this.showHistory) return;
    this.api.get<any[]>('finance/history/').subscribe({ next: v => this.history = v, error: err => this.operationError(err) });
    this.api.get<any>('library/ink-history/').subscribe({ next: v => this.inkHistory = Array.isArray(v) ? v : v.results || [], error: () => {} });
  }
  loadShop(): void {
    this.loadingShop = true;
    this.learning.getShopItems().pipe(takeUntil(this.destroy$)).subscribe({ next: v => { this.shopItems = v; this.loadingShop = false; }, error: () => { this.loadingShop = false; this.shopError = 'El Bazar no está disponible en este momento.'; } });
  }
  buyShopItem(item: ShopItem): void {
    if (!this.isLoggedIn()) { this.router.navigate(['/login']); return; }
    if (this.busy) return;
    this.busy = true;
    this.learning.buyShopItem(item.code).subscribe({ next: value => { this.busy = false; this.snack.open(value.message, 'Cerrar', { duration: 4000 }); this.refreshAccount(); this.loadShop(); }, error: err => this.operationError(err) });
  }
  equipShopItem(item: ShopItem): void {
    this.learning.equipShopItem(item.code).subscribe({ next: value => { this.snack.open(value.message, 'Cerrar', { duration: 3000 }); this.chat.notifyProfileUpdate(); this.loadShop(); }, error: err => this.operationError(err) });
  }
  buyInk(amount: number): void { this.router.navigate(this.isLoggedIn() ? ['/checkout', 'ink', amount] : ['/login']); }
  loadReward(): void { this.rewards.getDailyRewardStatus().subscribe({ next: v => this.dailyReward = v, error: () => {} }); }
  claimReward(): void {
    if (this.busy) return;
    this.busy = true;
    this.rewards.claimDailyReward().subscribe({
      next: v => {
        this.busy = false;
        if (v?.new_ink_balance !== undefined) {
          this.inkBalance = v.new_ink_balance;
          this.chat.updateInkBalance(v.new_ink_balance);
        }
        this.snack.open(v.message || '¡Recompensa diaria reclamada con éxito!', 'Cerrar', { duration: 4000 });
        this.refreshAccount();
        this.loadReward();
      },
      error: err => this.operationError(err)
    });
  }
  private operationError(err: any): void { this.busy = false; this.snack.open(err.error?.message || err.error?.error || 'No se pudo completar la operación. Intenta nuevamente.', 'Cerrar', { duration: 6000 }); }
  ngOnDestroy(): void { if (this.timer) clearInterval(this.timer); this.destroy$.next(); this.destroy$.complete(); }
}
