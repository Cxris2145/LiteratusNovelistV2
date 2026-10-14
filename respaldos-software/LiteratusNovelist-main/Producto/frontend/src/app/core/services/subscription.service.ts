import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, defer, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface SubscriptionPlan {
  code: string; name: string; price: string; currency: string;
  daily_token_limit: number; daily_time_limit: number | null;
  monthly_ink_bonus: number; benefits: string[]; purchasable: boolean;
}
export interface AIUsage {
  date: string; server_now: string; resets_at: string; tokens_used: number;
  tokens_reserved: number; token_limit: number; tokens_remaining: number;
  active_seconds: number; time_limit: number | null; plan_available: boolean;
  has_plan: boolean; ink_balance: number;
  /** Pase del día con Tinta: conversar con todos los personajes hasta medianoche. */
  ink_pass_active?: boolean; ink_pass_price?: number;
}
/** Error de sendChat cuando no hay plan ni pase: el chat muestra la oferta del pase. */
export interface NeedsDayPass { needsPass: true; usage: AIUsage; }
export interface SubscriptionAccount {
  subscription: null | { plan: SubscriptionPlan; status: string; active: boolean;
    paid_until: string | null; renews_at: string | null; cancel_at_period_end: boolean; pending_plan: string | null };
  cosmetics: { maestro: boolean; frame: string | null }; ink_balance: number;
}
interface PendingChat { request_id: string; payment_mode: 'plan' | 'pass'; }

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private api = inject(ApiService);
  private usageSubject = new BehaviorSubject<AIUsage | null>(null);
  readonly usage$ = this.usageSubject.asObservable();
  private pending = new Map<string, PendingChat>();
  plans(): Observable<SubscriptionPlan[]> { return this.api.get('finance/plans/'); }
  account(): Observable<SubscriptionAccount> { return this.api.get('finance/subscription/'); }
  usage(): Observable<AIUsage> { return this.api.get<AIUsage>('ai/usage/').pipe(tap(v => this.usageSubject.next(v))); }
  updateUsage(value: AIUsage): void { this.usageSubject.next(value); }
  heartbeat(session_id: string, client_id: string, active: boolean): Observable<AIUsage> {
    return this.api.post<AIUsage>('ai/usage/heartbeat/', { session_id, client_id, active }).pipe(tap(v => this.updateUsage(v)));
  }
  subscribe(plan_code: string): Observable<any> { return this.api.post('finance/subscription/subscribe/', { plan_code }); }
  manage(action: string, plan_code?: string): Observable<any> { return this.api.post(`finance/subscription/${action}/`, { plan_code }); }
  equipFrame(): Observable<any> { return this.api.post('finance/subscription/frame/', {}); }
  /** Pase del día con Tinta: un pago y se conversa con todos los personajes hasta medianoche. */
  buyDayPass(): Observable<AIUsage> {
    return this.api.post<AIUsage>('ai/chat/day-pass/', {}).pipe(
      tap(value => this.updateUsage(value)),
      catchError(err => {
        if (err.error?.usage) this.updateUsage(err.error.usage);
        return throwError(() => err);
      }));
  }

  /**
   * Envía un mensaje a un personaje. Usa el plan si tiene cupo; si no (o se agota), el pase del
   * día. Sin ninguno de los dos falla con { needsPass, usage } y el chat ofrece el pase ahí mismo:
   * ya no hay cotización ni ventana de confirmación por cada mensaje.
   */
  sendChat(session_id: string, message: string): Observable<any> {
    const key = session_id + '\n' + message;
    const post = (attempt: PendingChat) => this.api.post<any>('ai/chat/', { session_id, message, ...attempt }).pipe(
      tap(res => { this.updateUsage(res.usage); this.pending.delete(key); }));
    const withPass = (usage: AIUsage): Observable<any> => {
      if (!usage.ink_pass_active) return throwError((): NeedsDayPass => ({ needsPass: true, usage }));
      const attempt: PendingChat = { request_id: crypto.randomUUID(), payment_mode: 'pass' };
      this.pending.set(key, attempt);
      return post(attempt);
    };
    return defer(() => {
      const pending = this.pending.get(key);
      if (pending) return post(pending);
      return this.usage().pipe(switchMap(usage => {
        if (!usage.plan_available) return withPass(usage);
        const attempt: PendingChat = { request_id: crypto.randomUUID(), payment_mode: 'plan' };
        this.pending.set(key, attempt);
        return post(attempt).pipe(catchError(err => {
          if (['AI_TOKEN_LIMIT', 'AI_TIME_LIMIT', 'NO_ACTIVE_PLAN'].includes(err.error?.error)) {
            this.pending.delete(key);
            return withPass(err.error.usage || usage);
          }
          return throwError(() => err);
        }));
      }));
    }).pipe(catchError(err => {
      if (err.needsPass) {
        this.updateUsage(err.usage);
        this.pending.delete(key);
        return throwError(() => err);
      }
      if (err.error?.usage) this.updateUsage(err.error.usage);
      // Reuse IDs after uncertain transport failures; replay never makes a second charge.
      const definiteFailure = (err.status >= 400 && err.status < 500 && err.error?.error !== 'REQUEST_PENDING') || err.error?.error === 'AI_UNAVAILABLE';
      if (definiteFailure) this.pending.delete(key);
      return throwError(() => err);
    }));
  }
}
