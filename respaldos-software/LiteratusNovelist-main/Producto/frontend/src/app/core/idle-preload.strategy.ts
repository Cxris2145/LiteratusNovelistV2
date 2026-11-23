import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/**
 * Baja en segundo plano las páginas marcadas con `data: { preload: true }` cuando la primera página
 * ya terminó de cargar y el navegador está libre. Así salen del paquete inicial pero abren al instante
 * cuando se tocan.
 *
 * Espera el evento `load` y luego unos segundos: en un celular con 4G lenta la primera pintura llega
 * a los 4–5 s, y empezar a los 3 s le quitaba ancho de banda a las fuentes e imágenes de la portada.
 * En redes 3G espera más; con «Ahorro de datos» o 2G no precarga nada (se bajan al abrirlas).
 */
@Injectable({ providedIn: 'root' })
export class IdlePreloadStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!route.data?.['preload'] || this.saveData()) return of(null);
    return this.pageLoaded().pipe(
      switchMap(() => timer(this.slowNetwork() ? 8000 : 2500)),
      switchMap(() => this.whenIdle()),
      switchMap(load)
    );
  }

  private pageLoaded(): Observable<void> {
    return new Observable<void>(subscriber => {
      const done = () => { subscriber.next(); subscriber.complete(); };
      if (document.readyState === 'complete') { done(); return; }
      window.addEventListener('load', done, { once: true });
      return () => window.removeEventListener('load', done);
    });
  }

  private whenIdle(): Observable<void> {
    return new Observable<void>(subscriber => {
      const done = () => { subscriber.next(); subscriber.complete(); };
      if (!('requestIdleCallback' in window)) { done(); return; }
      const id = window.requestIdleCallback(done, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    });
  }

  private connection(): { saveData?: boolean; effectiveType?: string; downlink?: number } | undefined {
    return (navigator as any).connection;
  }

  private saveData(): boolean {
    const connection = this.connection();
    return !!connection && (!!connection.saveData || /(^|-)2g$/.test(connection.effectiveType ?? ''));
  }

  private slowNetwork(): boolean {
    const connection = this.connection();
    return !!connection && (connection.effectiveType === '3g' || (!!connection.downlink && connection.downlink < 1.5));
  }
}
