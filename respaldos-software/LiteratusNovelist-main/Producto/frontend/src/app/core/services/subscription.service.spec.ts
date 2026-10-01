import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { SubscriptionService, AIUsage } from './subscription.service';

describe('SubscriptionService · consentimiento e idempotencia', () => {
  let service: SubscriptionService;
  let http: HttpTestingController;
  let decision: Subject<boolean>;
  const usage: AIUsage = { date: '2026-09-30', server_now: new Date().toISOString(), resets_at: new Date(Date.now()+3600000).toISOString(),
    tokens_used: 0, tokens_reserved: 0, token_limit: 100000, tokens_remaining: 100000,
    active_seconds: 0, time_limit: 18000, plan_available: true, has_plan: true, ink_balance: 20 };

  beforeEach(() => {
    decision = new Subject<boolean>();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => decision }) } }
    ] });
    service = TestBed.inject(SubscriptionService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const endpoint = (path: string) => http.expectOne(req => req.url.endsWith(path));

  it('envía el plan sin solicitar un cargo en Tinta', () => {
    service.sendChat('session', 'Hola').subscribe();
    endpoint('/ai/usage/').flush(usage);
    const chat = endpoint('/ai/chat/');
    expect(chat.request.body.payment_mode).toBe('plan');
    expect(chat.request.body.request_id).toBeTruthy();
    chat.flush({ reply: 'Hola', usage });
  });

  it('cancelar la cotización no envía un chat pagado', () => {
    let cancelled = false;
    service.sendChat('session', 'Hola').subscribe({ error: err => cancelled = err.cancelled });
    endpoint('/ai/usage/').flush({ ...usage, plan_available: false });
    endpoint('/ai/chat/quote/').flush({ quote_id: 'quote', ink_cost: 2 });
    http.expectNone(req => req.url.endsWith('/ai/chat/'));
    decision.next(false);
    expect(cancelled).toBeTrue();
  });

  it('sólo envía Tinta después de aceptar la cotización vinculada', () => {
    service.sendChat('session', 'Hola').subscribe();
    endpoint('/ai/usage/').flush({ ...usage, plan_available: false });
    endpoint('/ai/chat/quote/').flush({ quote_id: 'quote', ink_cost: 2 });
    decision.next(true);
    const chat = endpoint('/ai/chat/');
    expect(chat.request.body.quote_id).toBe('quote');
    expect(chat.request.body.payment_mode).toBe('ink');
    chat.flush({ reply: 'Hola', usage });
  });

  it('reutiliza el identificador tras perder la respuesta en la red', () => {
    service.sendChat('session', 'Hola').subscribe({ error: () => {} });
    endpoint('/ai/usage/').flush(usage);
    const first = endpoint('/ai/chat/');
    const id = first.request.body.request_id;
    first.error(new ProgressEvent('offline'), { status: 0 });
    service.sendChat('session', 'Hola').subscribe();
    const retry = endpoint('/ai/chat/');
    expect(retry.request.body.request_id).toBe(id);
    retry.flush({ reply: 'Respuesta recuperada', usage });
  });

  it('si otra pestaña agota el cupo, pide consentimiento antes de usar Tinta', () => {
    service.sendChat('session', 'Hola').subscribe();
    endpoint('/ai/usage/').flush(usage);
    endpoint('/ai/chat/').flush({ error: 'AI_TOKEN_LIMIT', usage: { ...usage, plan_available: false } }, { status: 402, statusText: 'Payment Required' });
    endpoint('/ai/chat/quote/').flush({ quote_id: 'quote', ink_cost: 2 });
    http.expectNone(req => req.url.endsWith('/ai/chat/'));
    decision.next(true);
    const chat = endpoint('/ai/chat/');
    expect(chat.request.body.payment_mode).toBe('ink');
    chat.flush({ reply: 'Hola', usage });
  });

  it('conserva el identificador ante un error de servidor cuyo resultado es incierto', () => {
    service.sendChat('session', 'Hola').subscribe({ error: () => {} });
    endpoint('/ai/usage/').flush(usage);
    const first = endpoint('/ai/chat/');
    const id = first.request.body.request_id;
    first.flush({}, { status: 500, statusText: 'Internal Server Error' });
    service.sendChat('session', 'Hola').subscribe();
    const retry = endpoint('/ai/chat/');
    expect(retry.request.body.request_id).toBe(id);
    retry.flush({ reply: 'Respuesta recuperada', usage });
  });
});
