import { HttpEvent, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject, defer, filter, finalize, shareReplay, startWith, switchMap, take, takeUntil } from 'rxjs';

/** Comparte solamente lecturas en vuelo; los balances nunca tienen un TTL. */
@Injectable({ providedIn: 'root' })
export class ProfileRequestService {
  private pending = new Map<string, Observable<HttpEvent<unknown>>>();
  private invalidated$ = new Subject<void>();
  private sessionChanged$ = new Subject<void>();
  private revision = 0;

  get sessionRevision(): number { return this.revision; }

  share(url: string, request: () => Observable<HttpEvent<unknown>>): Observable<HttpEvent<unknown>> {
    return defer(() => {
      const key = `${this.revision}:${url}`;
      const pending = this.pending.get(key);
      if (pending) return pending;

      const stream$ = this.invalidated$.pipe(
        startWith(undefined),
        // Si una escritura termina antes que la lectura, descarta esta última y
        // vuelve a leer: una respuesta antigua no debe pisar la tinta recién guardada.
        switchMap(() => request()),
        filter(event => event instanceof HttpResponse),
        take(1),
        takeUntil(this.sessionChanged$),
        finalize(() => {
          if (this.pending.get(key) === stream$) this.pending.delete(key);
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
      this.pending.set(key, stream$);
      return stream$;
    });
  }

  invalidate(): void {
    this.invalidated$.next();
  }

  resetSession(): void {
    this.revision++;
    this.pending.clear();
    this.sessionChanged$.next();
  }
}
