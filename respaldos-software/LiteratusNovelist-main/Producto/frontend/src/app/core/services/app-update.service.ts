import { Injectable, inject } from '@angular/core';
import { NavigationError, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { NotificationService } from './notification.service';

/** Cómo avisan Chrome/Edge, Safari y Firefox que no llegó el archivo de una sección. */
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i;

/** Última recarga hecha aquí: si la misma sección vuelve a fallar enseguida, no se insiste. */
const RELOAD_KEY = 'literatus_chunk_reload';
const RELOAD_WINDOW_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');
  return CHUNK_ERROR.test(message);
}

/**
 * Las secciones que se descargan al abrirlas (La Senda, los juegos, Logros…) viven en archivos
 * con su contenido en el nombre (chunk-XXXX.js), y cada publicación en Vercel cambia los nombres
 * de los que se modificaron. Quien seguía con la versión anterior (una pestaña abierta desde
 * antes, o el service worker que la guardó y la sirve al volver) pide un nombre que ya no existe;
 * Vercel responde la portada en su lugar, el import falla y el router se queda donde estaba:
 * el botón "no hace nada" hasta recargar.
 *
 * Aquí se hace esa recarga sola, directo a la sección pedida, que trae la versión vigente.
 * Una sola vez por sección: si vuelve a fallar (sin conexión, por ejemplo) se avisa.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly swUpdate = inject(SwUpdate, { optional: true });

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationError => event instanceof NavigationError && isChunkLoadError(event.error)))
      .subscribe(event => this.recover(event.url));
    // El service worker ya no encuentra (404) archivos de la versión que usa esta pestaña.
    if (this.swUpdate?.isEnabled) {
      this.swUpdate.unrecoverable.subscribe(() => this.fullLoad(window.location.href));
    }
  }

  private recover(url: string): void {
    // Sin poder anotar la recarga no se recarga: sería un bucle si el archivo falta de verdad.
    if (navigator.onLine && !this.reloadedRecently(url) && this.rememberReload(url)) {
      this.fullLoad(url);
      return;
    }
    this.notifications.error('Revisa tu conexión e inténtalo de nuevo.', 'No se pudo abrir la sección');
  }

  /** Carga completa de la página (no navegación interna): trae index.html y archivos nuevos. */
  protected fullLoad(url: string): void {
    window.location.assign(url);
  }

  private reloadedRecently(url: string): boolean {
    try {
      const last = JSON.parse(sessionStorage.getItem(RELOAD_KEY) || 'null') as { url: string; at: number } | null;
      return !!last && last.url === url && Date.now() - last.at < RELOAD_WINDOW_MS;
    } catch {
      return false;
    }
  }

  private rememberReload(url: string): boolean {
    try {
      sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ url, at: Date.now() }));
      return true;
    } catch {
      return false;
    }
  }
}
