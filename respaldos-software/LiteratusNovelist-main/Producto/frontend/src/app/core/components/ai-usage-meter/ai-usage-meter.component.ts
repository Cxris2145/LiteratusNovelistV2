import { Component, Input, OnInit, OnDestroy, HostListener, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SubscriptionService, AIUsage } from '../../services/subscription.service';
import { Subscription } from 'rxjs';

@Component({ selector: 'app-ai-usage-meter', standalone: true, imports: [CommonModule, RouterModule],
  template: `<section class="usage-meter" *ngIf="usage" aria-label="Tu uso de IA hoy">
    <div class="meter-row"><strong>{{ usage.has_plan ? 'Tu uso de hoy' : 'Conversaciones con Tinta' }}</strong><a routerLink="/tavern/tienda">{{ usage.has_plan ? 'Ver mi plan' : 'Ver planes' }}</a></div>
    <ng-container *ngIf="usage.has_plan"><progress [value]="usage.tokens_used" [max]="usage.token_limit" aria-label="Cupo diario de IA utilizado"></progress>
      <div class="meter-row"><span>{{ usage.tokens_used | number:'1.0-0' }} / {{ usage.token_limit | number:'1.0-0' }} tokens</span><span>{{ usage.time_limit === null ? 'Sin límite horario' : elapsed }}</span></div>
      <p *ngIf="!usage.plan_available"><strong>Tu magia necesita descansar.</strong> Reinicio en {{ countdown }}.</p>
      <div class="meter-row" *ngIf="!usage.plan_available"><button type="button" (click)="continueWithInk()">Continuar usando Tinta</button><a routerLink="/library">Volver a mi biblioteca</a></div></ng-container>
    <p *ngIf="inkMode">Escribe tu mensaje. Confirmarás su precio en Tinta al enviarlo.</p>
    <small>El asistente general sigue gratis. La Tinta se utiliza sólo al aceptar su precio.</small></section>`,
  styles: [`.usage-meter{padding:.7rem 1rem;background:var(--home-bg-surface);color:var(--home-ink);border:1px solid var(--home-glass-border);border-radius:.75rem;font:.8rem var(--font-ui)}.meter-row{display:flex;justify-content:space-between;gap:.7rem;flex-wrap:wrap}a{color:var(--color-warning)}small{display:block;margin-top:.4rem;color:var(--home-ink-muted)}progress{width:100%;height:.5rem;accent-color:var(--color-warning);margin:.45rem 0}p{margin:.5rem 0}button{background:transparent;color:var(--color-warning);border:1px solid currentColor;border-radius:.5rem;padding:.4rem .6rem;min-height:44px;cursor:pointer}button:focus-visible{outline:3px solid var(--color-warning);outline-offset:3px}a:focus-visible{outline:2px solid currentColor;outline-offset:3px}`]
})
export class AIUsageMeterComponent implements OnInit, OnDestroy {
  @Input() sessionId: string | null = null;
  private service = inject(SubscriptionService);
  private element = inject(ElementRef);
  private clientId = crypto.randomUUID();
  private lastActivity = Date.now();
  private serverOffset = 0;
  private timer?: ReturnType<typeof setInterval>;
  private subscription?: Subscription;
  private alive = true;
  usage: AIUsage | null = null;
  inkMode = false;
  continueWithInk(): void { this.inkMode = true; this.element.nativeElement.parentElement?.querySelector('textarea')?.focus(); }
  now = Date.now();
  get elapsed(): string { const n = this.usage?.active_seconds || 0; return `${Math.floor(n / 3600)} h ${Math.floor(n % 3600 / 60)} min`; }
  get countdown(): string {
    const n = Math.max(0, Math.ceil((Date.parse(this.usage?.resets_at || '') - this.now - this.serverOffset) / 1000)) || 0;
    return `${Math.floor(n / 3600).toString().padStart(2, '0')} h ${Math.floor(n % 3600 / 60).toString().padStart(2, '0')} min`;
  }
  ngOnInit(): void {
    this.subscription = this.service.usage$.subscribe(v => { this.usage = v; if (v) this.serverOffset = Date.parse(v.server_now) - Date.now(); });
    this.service.usage().subscribe({ error: () => {} });
    this.pulse();
    this.timer = setInterval(() => { this.now = Date.now(); this.pulse(); }, 30000);
  }
  @HostListener('document:visibilitychange') visibility(): void { this.pulse(); }
  @HostListener('window:blur') blur(): void { this.pulse(false); }
  @HostListener('window:pagehide') pageHide(): void { this.pulse(false); }
  @HostListener('window:focus') focus(): void { this.pulse(); }
  @HostListener('document:keydown', ['$event']) @HostListener('document:pointerdown', ['$event']) @HostListener('document:wheel', ['$event']) activity(event: Event): void {
    if ((event.target as HTMLElement)?.closest('textarea, .chat-messages, .dchat-messages, app-ai-usage-meter')) {
      const inactive = Date.now() - this.lastActivity >= 120000;
      this.lastActivity = Date.now();
      if (inactive) this.pulse();
    }
  }
  private pulse(force?: boolean): void {
    if (!this.sessionId) return;
    const active = force ?? (this.alive && this.element.nativeElement.isConnected && this.element.nativeElement.getClientRects().length > 0 && !document.hidden && document.hasFocus() && Date.now() - this.lastActivity < 120000);
    this.service.heartbeat(this.sessionId, this.clientId, active).subscribe({ error: () => {} });
  }
  ngOnDestroy(): void { this.alive = false; if (this.timer) clearInterval(this.timer); this.subscription?.unsubscribe(); this.pulse(false); }
}
