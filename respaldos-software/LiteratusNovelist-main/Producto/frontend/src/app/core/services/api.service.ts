import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface CacheEntry {
  value: unknown;                 // respuesta ya emitida (para lecturas síncronas)
  stream$: Observable<unknown>;   // shareReplay: comparte una petición en vuelo entre suscriptores
  expires: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  /** Caché en memoria para datos estables (catálogo, categorías, autores…). */
  private cache = new Map<string, CacheEntry>();

  get<T>(endpoint: string, params?: HttpParams): Observable<T> {
    // Antes se añadía `_t=<timestamp>` a cada GET: hacía cada URL única y
    // anulaba TODA la caché del navegador (y las revalidaciones 304).
    // El backend controla su propio Cache-Control; aquí ya no rompemos nada.
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, { params: params || new HttpParams() });
  }

  /**
   * GET con caché en memoria + de-duplicación de peticiones en vuelo.
   * Úsalo SÓLO para datos que no cambian a cada segundo (listados de catálogo,
   * categorías, autores, detalle de libro). Para datos de usuario (progreso,
   * tinta, biblioteca) usa `get()` normal.
   *
   * `Explorar → Biblioteca → Explorar` deja de re-descargar lo mismo.
   */
  getCached<T>(endpoint: string, params?: HttpParams, ttlMs = 5 * 60 * 1000): Observable<T> {
    const key = endpoint + '?' + (params ? params.toString() : '');
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.expires > now) {
      return hit.stream$ as Observable<T>;
    }
    const stream$ = this.http.get<T>(`${this.baseUrl}${endpoint}`, { params: params || new HttpParams() }).pipe(
      tap(value => {
        const e = this.cache.get(key);
        if (e) e.value = value;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    ) as Observable<unknown>;
    this.cache.set(key, { value: undefined, stream$, expires: now + ttlMs });
    return stream$ as Observable<T>;
  }

  /** Lectura síncrona del último valor cacheado (o null). Útil para pintar al
   *  instante y refrescar en segundo plano. */
  peekCached<T>(endpoint: string, params?: HttpParams): T | null {
    const key = endpoint + '?' + (params ? params.toString() : '');
    const hit = this.cache.get(key);
    return (hit && hit.value !== undefined ? hit.value : null) as T | null;
  }

  /** Invalida una entrada (p. ej. tras comprar un libro) o todo el caché. */
  invalidate(endpointPrefix?: string): void {
    if (!endpointPrefix) { this.cache.clear(); return; }
    for (const k of Array.from(this.cache.keys())) {
      if (k.startsWith(endpointPrefix)) this.cache.delete(k);
    }
  }

  post<T>(endpoint: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, body);
  }

  patch<T>(endpoint: string, body: any): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${endpoint}`, body);
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`);
  }

  getBlob(endpoint: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}${endpoint}`, { responseType: 'blob' });
  }
}
