import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/**
 * Baja en segundo plano las páginas marcadas con `data: { preload: true }` unos segundos
 * después de abrir la app, cuando ya se dibujó la primera página y el navegador está libre.
 * Así salen del paquete inicial pero abren al instante cuando se tocan. Con «Ahorro de datos»
 * o una red 2G no se precarga nada (se bajan al abrirlas, como el resto).
 */
@Injectable({ providedIn: 'root' })
export class IdlePreloadStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!route.data?.['preload'] || this.saveData()) return of(null);
    return timer(3000).pipe(switchMap(() => this.whenIdle()), switchMap(load));
  }

  private whenIdle(): Observable<void> {
    return new Observable<void>(subscriber => {
      const done = () => { subscriber.next(); subscriber.complete(); };
      if (!('requestIdleCallback' in window)) { done(); return; }
      const id = window.requestIdleCallback(done, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    });
  }

  private saveData(): boolean {
    const connection = (navigator as any).connection;
    return !!connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType ?? ''));
  }
}
