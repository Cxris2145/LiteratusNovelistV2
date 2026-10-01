import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Observable, defer, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { InkConsentDialogComponent } from '../components/ai-usage-meter/ink-consent-dialog.component';

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
}
export interface SubscriptionAccount {
  subscription: null | { plan: SubscriptionPlan; status: string; active: boolean;
    paid_until: string | null; renews_at: string | null; cancel_at_period_end: boolean; pending_plan: string | null };
  cosmetics: { maestro: boolean; frame: string | null }; ink_balance: number;
}
interface PendingChat { request_id: string; payment_mode: 'plan' | 'ink'; quote_id?: string; }

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
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
  sendChat(session_id: string, message: string): Observable<any> {
    const key = session_id + '\n' + message;
    const post = (attempt: PendingChat) => this.api.post<any>('ai/chat/', { session_id, message, ...attempt }).pipe(
      tap(res => { this.updateUsage(res.usage); this.pending.delete(key); }));
    const consent = (request_id: string, usage: AIUsage): Observable<any> =>
      this.api.post<any>('ai/chat/quote/', { session_id, message }).pipe(switchMap(quote =>
        this.dialog.open(InkConsentDialogComponent, { width: '420px', data: { ...quote, usage } }).afterClosed().pipe(
          switchMap(accepted => {
            if (!accepted) return throwError(() => ({ cancelled: true }));
            const attempt: PendingChat = { request_id, payment_mode: 'ink', quote_id: quote.quote_id };
            this.pending.set(key, attempt);
            return post(attempt);
          }))));
    return defer(() => {
      const pending = this.pending.get(key);
      if (pending) return post(pending);
      const request_id = crypto.randomUUID();
      return this.usage().pipe(switchMap(usage => {
        if (!usage.plan_available) return consent(request_id, usage);
        const attempt: PendingChat = { request_id, payment_mode: 'plan' };
        this.pending.set(key, attempt);
        return post(attempt).pipe(catchError(err => {
          if (['AI_TOKEN_LIMIT', 'AI_TIME_LIMIT', 'NO_ACTIVE_PLAN'].includes(err.error?.error)) {
            this.pending.delete(key);
            return consent(request_id, err.error.usage || usage);
          }
          return throwError(() => err);
        }));
      }));
    }).pipe(catchError(err => {
      if (err.error?.usage) this.updateUsage(err.error.usage);
      // Reuse IDs after uncertain transport failures; replay never makes a second charge.
      const definiteFailure = (err.status >= 400 && err.status < 500 && err.error?.error !== 'REQUEST_PENDING') || err.error?.error === 'AI_UNAVAILABLE';
      if (err.cancelled || definiteFailure) this.pending.delete(key);
      return throwError(() => err);
    }));
  }
}
