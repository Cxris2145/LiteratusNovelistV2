import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, tap, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HOME_SNAPSHOT_MAX_AGE_MS, PublicHome, parsePublicHome } from '../data/public-home.mjs';

export type { PublicHome, PublicHomeBook } from '../data/public-home.mjs';
export type HomeBook = PublicHome['books'][number];

@Injectable({ providedIn: 'root' })
export class HomeDataService {
  // Public data must never inherit Authorization or session-refresh handling.
  private readonly http = new HttpClient(inject(HttpBackend));
  private home$?: Observable<PublicHome>;
  private validUntil = 0;

  getHome(): Observable<PublicHome> {
    if (this.home$ && Date.now() < this.validUntil) return this.home$;

    const api$ = this.http.get<unknown>(`${environment.apiUrl}catalog/home/`).pipe(
      map(data => parsePublicHome(data))
    );
    const source$ = environment.production
      ? this.http.get<unknown>('/api/public-home', { headers: { 'ngsw-bypass': 'true' } }).pipe(
        timeout(1500),
        map(data => parsePublicHome(data)),
        catchError(() => this.http.get<unknown>('/assets/data/home-public.json', { headers: { 'ngsw-bypass': 'true' } }).pipe(
          timeout(2000),
          map(data => parsePublicHome(data)),
          catchError(() => api$)
        ))
      )
      : api$;

    this.validUntil = Date.now() + 5 * 60 * 1000;
    this.home$ = source$.pipe(
      tap(home => {
        this.validUntil = Math.min(Date.now() + 5 * 60 * 1000, Date.parse(home.generated_at) + HOME_SNAPSHOT_MAX_AGE_MS);
      }),
      catchError(error => {
        this.validUntil = 0;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.home$;
  }
}
