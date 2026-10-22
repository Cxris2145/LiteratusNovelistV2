import { Injectable, NgZone, effect, inject } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { sendGuestLeave } from '../utils/guest-leave';

/** Cada cuánto la página de prueba avisa que sigue abierta (el servidor la borra a los 3 min sin aviso). */
const PING_MS = 60_000;

/**
 * Avisa al servidor que una cuenta de prueba no es para siempre:
 * - un latido cada minuto mientras la página siga abierta (también en segundo plano);
 * - al cerrar la página (pagehide; cambiar de pestaña no cuenta), que se fue. Si solo se recargó,
 *   el primer latido la revive;
 *   si no, el servidor la borra al minuto (ver users/guests.py en el backend).
 * Cerrar sesión la borra al instante (AuthService.logout).
 */
@Injectable({ providedIn: 'root' })
export class GuestSessionService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly zone = inject(NgZone);
  private timer: ReturnType<typeof setInterval> | null = null;

  private readonly onPageHide = () => sendGuestLeave(false);
  /** Volvió desde la caché de atrás/adelante: el latido la revive antes de que venza. */
  private readonly onPageShow = (event: PageTransitionEvent) => { if (event.persisted) this.ping(); };

  constructor() {
    effect(() => {
      if (this.auth.currentUser()?.is_guest) this.start();
      else this.stop();
    });
  }

  private start(): void {
    if (this.timer) return;
    this.ping();
    this.zone.runOutsideAngular(() => {
      this.timer = setInterval(() => this.ping(), PING_MS);
      window.addEventListener('pagehide', this.onPageHide);
      window.addEventListener('pageshow', this.onPageShow);
    });
  }

  private stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
  }

  private ping(): void {
    // Si el servidor ya la borró, el 401 cierra la sesión (interceptor) y el login lo explica.
    this.api.post('users/guest/ping/', {}).subscribe({ error: () => {} });
  }
}
