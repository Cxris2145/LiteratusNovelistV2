import { Component, Input, OnInit, OnDestroy, HostListener, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SubscriptionService, AIUsage } from '../../services/subscription.service';
import { ChatService } from '../../services/chat.service';
import { Subscription } from 'rxjs';

@Component({ selector: 'app-ai-usage-meter', standalone: true, imports: [CommonModule, RouterModule],
  template: `<section class="usage-meter" *ngIf="usage" aria-label="Tu uso de IA hoy">
    <div class="meter-row"><strong>{{ usage.has_plan ? 'Tu uso de hoy' : usage.ink_pass_active ? 'Pase del día activo' : 'Conversar con personajes' }}</strong><a routerLink="/planes">{{ usage.has_plan ? 'Ver mi plan' : 'Ver planes' }}</a></div>
    <ng-container *ngIf="usage.has_plan"><progress [value]="usage.tokens_used" [max]="usage.token_limit" aria-label="Cupo diario de IA utilizado"></progress>
      <div class="meter-row"><span>{{ usage.tokens_used | number:'1.0-0' }} / {{ usage.token_limit | number:'1.0-0' }} tokens</span><span>{{ usage.time_limit === null ? 'Sin límite horario' : elapsed }}</span></div>
      <p *ngIf="!usage.plan_available && !usage.ink_pass_active"><strong>Tu magia necesita descansar.</strong> Reinicio en {{ countdown }}.</p></ng-container>
    <p *ngIf="usage.ink_pass_active && !usage.plan_available">Conversa sin límite con todos los personajes hasta medianoche (quedan {{ countdown }}).</p>
    <div class="meter-row meter-action-row" *ngIf="!usage.plan_available && !usage.ink_pass_active">
      <span>Pase del día: conversa sin límite hasta medianoche por {{ usage.ink_pass_price ?? 20 }} Tinta.</span>
      <button type="button" (click)="activatePass()" [disabled]="busy || !chat.canSpendInk(usage.ink_balance, usage.ink_pass_price ?? 20)">{{ busy ? 'Activando…' : 'Activar' }}</button>
    </div>
    <small>{{ passError || 'El asistente general sigue gratis.' }}</small></section>`,
  styles: [`
    :host { display: block; box-sizing: border-box; flex-shrink: 0; }
    .usage-meter {
      display: flex; flex-direction: column; gap: 0.6rem;
      padding: 0.9rem 1.1rem 1.05rem;
      background: var(--home-bg-surface, #15233B);
      color: var(--home-ink, #EAF0F8);
      border: 1px solid var(--home-glass-border, rgba(255, 255, 255, 0.12));
      border-radius: 0.85rem;
      font: 0.82rem/1.4 var(--font-ui, system-ui, sans-serif);
      box-sizing: border-box;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    }
    .meter-row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .meter-action-row { align-items: center; }
    .meter-action-row span { flex: 1 1 200px; line-height: 1.45; }
    a { color: var(--color-warning, #FFB353); text-decoration: underline; font-weight: 600; white-space: nowrap; }
    small { display: block; margin-top: 0.15rem; line-height: 1.45; font-size: 0.8rem; color: var(--home-ink-muted, #9DB2CE); word-break: break-word; }
    progress { width: 100%; height: 0.5rem; accent-color: var(--color-warning, #FFB353); margin: 0.2rem 0; border-radius: 4px; }
    p { margin: 0; line-height: 1.45; }
    button {
      background: transparent; color: var(--color-warning, #FFB353);
      border: 1px solid currentColor; border-radius: 0.5rem;
      padding: 0.45rem 1rem; min-height: 42px; font-weight: 600; cursor: pointer; white-space: nowrap;
      transition: background 0.2s ease, transform 0.15s ease;
    }
    @media (hover: hover) and (pointer: fine) {
      button:hover:not(:disabled) { background: color-mix(in srgb, var(--color-warning, #FFB353) 15%, transparent); }
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button:focus-visible { outline: 3px solid var(--color-warning, #FFB353); outline-offset: 3px; }
    a:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
  `]
})
export class AIUsageMeterComponent implements OnInit, OnDestroy {
  @Input() sessionId: string | null = null;
  private service = inject(SubscriptionService);
  readonly chat = inject(ChatService);
  private element = inject(ElementRef);
  private clientId = crypto.randomUUID();
  private lastActivity = Date.now();
  private serverOffset = 0;
  private timer?: ReturnType<typeof setInterval>;
  private subscription?: Subscription;
  private alive = true;
  usage: AIUsage | null = null;
  busy = false;
  passError = '';
  /** Pase del día con Tinta (todos los personajes hasta medianoche), sin salir del chat. */
  activatePass(): void {
    this.busy = true;
    this.passError = '';
    this.service.buyDayPass().subscribe({
      next: () => { this.busy = false; this.element.nativeElement.parentElement?.querySelector('textarea')?.focus(); },
      error: err => { this.busy = false; this.passError = err.error?.message || 'No se pudo activar el pase.'; },
    });
  }
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
