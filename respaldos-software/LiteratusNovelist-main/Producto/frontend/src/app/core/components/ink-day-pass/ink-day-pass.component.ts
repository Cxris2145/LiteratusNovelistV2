import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { AIUsage, SubscriptionService } from '../../services/subscription.service';

/**
 * Oferta del pase del día dentro del chat (sin ventanas aparte): un pago de Tinta y se conversa
 * con todos los personajes hasta la medianoche. Aparece cuando un mensaje no tiene plan ni pase;
 * al activarlo, el chat reenvía el mensaje que quedó esperando.
 */
@Component({
  selector: 'app-ink-day-pass',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="idp" aria-labelledby="idp-title" role="region">
      <span class="material-symbols-rounded idp-icon" aria-hidden="true">all_inclusive</span>
      <div class="idp-body">
        <h3 id="idp-title">Conversa sin límite hoy</h3>
        <p>
          Con el <strong>pase del día</strong> hablas con todos los personajes hasta la medianoche
          por <strong>{{ price }} Tinta</strong>. Tienes {{ balance }}.
        </p>
        <div class="idp-actions">
          <button *ngIf="!missing" type="button" class="idp-primary" (click)="activate()" [disabled]="busy">
            {{ busy ? 'Activando…' : 'Activar por ' + price + ' Tinta' }}
          </button>
          <ng-container *ngIf="missing">
            <span class="idp-missing">Te faltan {{ missing }} Tinta.</span>
            <a class="idp-primary" routerLink="/planes">Conseguir Tinta</a>
          </ng-container>
          <a *ngIf="!missing" class="idp-link" routerLink="/planes">o elige un plan</a>
        </div>
        <p class="idp-error" *ngIf="error" role="alert">{{ error }}</p>
      </div>
    </section>
  `,
  styles: [`
    .idp {
      display: flex;
      gap: 12px;
      padding: 14px;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--color-accent, #FFB353) 45%, transparent);
      background: color-mix(in srgb, var(--color-accent, #FFB353) 10%, var(--color-surface, #14291F));
      color: var(--color-text-primary, #fcfaf2);
      font-family: var(--font-ui, system-ui, sans-serif);
      animation: idp-in 220ms cubic-bezier(0.165, 0.84, 0.44, 1);
    }
    .idp-icon { font-size: 26px; color: var(--color-accent, #FFB353); }
    .idp-body { flex: 1; min-width: 0; }
    h3 { margin: 0 0 4px; font-size: 0.98rem; font-weight: 700; }
    p { margin: 0; font-size: 0.86rem; line-height: 1.45; color: var(--color-text-secondary, #d6ccbf); }
    p strong { color: var(--color-text-primary, #fcfaf2); }
    .idp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-top: 12px; }
    .idp-primary {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 40px; padding: 0 18px; border: none; border-radius: 999px;
      background: var(--color-accent, #FFB353); color: var(--color-on-accent, #1a1206);
      font: 600 0.88rem var(--font-ui, system-ui, sans-serif); text-decoration: none; cursor: pointer;
    }
    .idp-primary:disabled { opacity: 0.6; cursor: default; }
    .idp-primary:focus-visible, .idp-link:focus-visible { outline: 2px solid var(--color-focus, #FFB353); outline-offset: 2px; }
    .idp-link { color: var(--color-accent, #FFB353); font-size: 0.84rem; }
    .idp-missing { font-size: 0.84rem; font-weight: 600; }
    .idp-error { margin-top: 8px; color: #f87171; }
    @keyframes idp-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .idp { animation: none; } }
  `],
})
export class InkDayPassComponent {
  private readonly subscriptions = inject(SubscriptionService);

  @Input() usage: AIUsage | null = null;
  @Output() activated = new EventEmitter<void>();

  busy = false;
  error = '';

  get price(): number {
    return this.usage?.ink_pass_price ?? 20;
  }

  get balance(): number {
    return this.usage?.ink_balance ?? 0;
  }

  get missing(): number {
    return Math.max(0, this.price - this.balance);
  }

  activate(): void {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.subscriptions.buyDayPass().subscribe({
      next: usage => {
        this.busy = false;
        this.usage = usage;
        if (usage.ink_pass_active) this.activated.emit();
      },
      error: err => {
        this.busy = false;
        if (err.error?.usage) this.usage = err.error.usage;
        this.error = err.error?.message || 'No se pudo activar el pase. Intenta de nuevo.';
      },
    });
  }
}
