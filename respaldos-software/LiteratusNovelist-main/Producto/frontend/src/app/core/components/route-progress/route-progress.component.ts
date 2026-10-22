import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import {
  NavigationCancel, NavigationCancellationCode, NavigationEnd, NavigationError, NavigationSkipped, NavigationStart, Router,
} from '@angular/router';

/** Si la sección abre antes, la barra ni aparece: así no parpadea en cada clic. */
const SHOW_AFTER_MS = 150;
/** Lo que dura el remate (llenarse y desvanecerse) antes de volver a esconderse. */
const FINISH_MS = 400;

/**
 * Barra fina arriba de la pantalla mientras se abre una sección. Las que se descargan al
 * abrirlas (La Senda, los juegos, Logros…) tardan con mala señal, y sin una pista el botón
 * parecía no responder.
 */
@Component({
  selector: 'app-route-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rp-bar" [class.is-loading]="state() === 'loading'" [class.is-done]="state() === 'done'"
         role="progressbar" aria-label="Abriendo la sección" [attr.aria-hidden]="state() !== 'loading'"></div>
  `,
  styles: [`
    :host {
      position: fixed;
      inset: 0 0 auto;
      z-index: 100001;
      height: 3px;
      pointer-events: none;
    }
    .rp-bar {
      height: 100%;
      background: var(--color-accent, #FFB353);
      box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent, #FFB353) 70%, transparent);
      transform: scaleX(0);
      transform-origin: left center;
      opacity: 0;
    }
    /* Avanza rápido al principio y cada vez más lento: nunca llega al final mientras espera. */
    .rp-bar.is-loading {
      opacity: 1;
      transform: scaleX(0.9);
      transition: transform 10s cubic-bezier(0.08, 0.7, 0.2, 1), opacity 0.15s ease-out;
    }
    .rp-bar.is-done {
      opacity: 0;
      transform: scaleX(1);
      transition: transform 0.2s ease-out, opacity 0.2s ease-out 0.15s;
    }
    @media (prefers-reduced-motion: reduce) {
      .rp-bar.is-loading { transform: scaleX(1); opacity: 0.75; transition: opacity 0.15s ease-out; }
      .rp-bar.is-done { transition: opacity 0.2s ease-out; }
    }
  `],
})
export class RouteProgressComponent {
  readonly state = signal<'idle' | 'loading' | 'done'>('idle');
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const sub = inject(Router).events.subscribe(event => {
      if (event instanceof NavigationStart) this.start();
      else if (event instanceof NavigationCancel) {
        // Un guard que redirige (ej. al login) o un segundo clic traen otra navegación enseguida.
        if (event.code !== NavigationCancellationCode.Redirect
          && event.code !== NavigationCancellationCode.SupersededByNewNavigation) this.finish();
      } else if (event instanceof NavigationEnd || event instanceof NavigationError
        || event instanceof NavigationSkipped) this.finish();
    });
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      clearTimeout(this.showTimer);
      clearTimeout(this.hideTimer);
    });
  }

  private start(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    // Tras una redirección o un segundo clic la barra que ya se veía sigue donde iba.
    if (this.state() === 'loading') return;
    this.state.set('idle');
    this.showTimer = setTimeout(() => this.state.set('loading'), SHOW_AFTER_MS);
  }

  private finish(): void {
    clearTimeout(this.showTimer);
    if (this.state() !== 'loading') return;
    this.state.set('done');
    this.hideTimer = setTimeout(() => this.state.set('idle'), FINISH_MS);
  }
}
