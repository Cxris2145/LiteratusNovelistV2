import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy,
  inject,
} from '@angular/core';

import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';

/** Cada cuánto brindan los amigos del fondo, y cuánto dura el choque de jarras. */
const CHEERS_EVERY_MS = 6500;
const CHEERS_FOR_MS = 1900;

/**
 * La vida del fondo de La Taberna: magos que cruzan el salón, la mesera con su bandeja, un duelo
 * de varitas, amigos que brindan y dos que conversan. Es decoración pura (sin clics, oculta para
 * los lectores de pantalla) y vive en la misma caja que la pintura del salón, así cada uno pisa
 * el piso de la pintura sin importar el tamaño de la ventana.
 *
 * Cada personaje usa el mismo Maguito SVG del resto de la aplicación. Las animaciones CSS
 * se pausan fuera de pantalla y con la pestaña oculta; con "reducir movimiento" todos quedan
 * quietos en su lugar.
 */
@Component({
  selector: 'app-tavern-crowd',
  templateUrl: './tavern-crowd.component.html',
  styleUrls: ['./tavern-crowd.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', 'data-renderer': 'svg' },
})
export class TavernCrowdComponent implements AfterViewInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  get reduced(): boolean { return this.motion.matches; }
  paused = document.hidden;
  /** Los amigos del fondo chocan las jarras un momento y vuelven a conversar. */
  toasting = false;

  readonly look: Record<string, MaguitoOutfit> = {
    walkerA: { head: 'pirate', face: 'beard', cape: 'red' },
    walkerB: { head: 'tophat', eyes: 'monocle', cape: 'emerald' },
    waitress: { head: 'witch-flower', neck: 'bowtie', cape: 'royal' },
    duelL: { head: 'wizard', eyes: 'halfmoon', cape: 'midnight' },
    duelR: { head: 'feather', face: 'mustache', cape: 'red' },
    friend1: { head: 'beret', neck: 'scarf-red', cape: 'gold' },
    friend2: { head: 'graduate', eyes: 'reading', cape: 'midnight' },
    friend3: { head: 'laurel', face: 'beard', cape: 'emerald' },
    chatL: { head: 'deerstalker', cape: 'royal' },
    chatR: { head: 'crown', eyes: 'star', cape: 'gold' },
  };

  /** Comensales detrás de la barra y de las mesas, con la cara original de Maguito. */
  readonly seats: ReadonlyArray<{
    x: number; bottom: number; width: number; far: boolean; left: boolean; outfit: MaguitoOutfit;
  }> = [
    { x: 2.5, bottom: 49.5, width: 6, far: true, left: false, outfit: { head: 'wizard', cape: 'gold' } },
    { x: 9, bottom: 49.5, width: 6, far: true, left: true, outfit: { head: 'witch-flower', cape: 'royal' } },
    { x: 21, bottom: 49.5, width: 5.5, far: true, left: false, outfit: { head: 'wizard', cape: 'gold' } },
    { x: 27, bottom: 49.7, width: 5.5, far: true, left: true, outfit: { head: 'beret', cape: 'emerald' } },
    { x: 35, bottom: 50, width: 5.5, far: true, left: false, outfit: { head: 'wizard', cape: 'royal' } },
    { x: 56, bottom: 50, width: 5.5, far: true, left: true, outfit: { head: 'wizard', cape: 'gold' } },
    { x: 6.2, bottom: 42, width: 8.3, far: false, left: false, outfit: { head: 'wizard', cape: 'gold' } },
    { x: 14.5, bottom: 40.8, width: 8.3, far: false, left: true, outfit: { head: 'beret', cape: 'royal' } },
    { x: 77, bottom: 44, width: 8.3, far: false, left: false, outfit: { head: 'wizard', cape: 'gold' } },
    { x: 84, bottom: 44, width: 8.3, far: false, left: false, outfit: { head: 'witch-flower', cape: 'royal' } },
    { x: 91, bottom: 44.2, width: 8.3, far: false, left: true, outfit: { head: 'wizard', cape: 'gold' } },
  ];

  private cheersTimer: ReturnType<typeof setInterval> | null = null;
  private cheersOff: ReturnType<typeof setTimeout> | null = null;
  private intersection?: IntersectionObserver;
  private visible = true;
  private destroyed = false;

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      document.addEventListener('visibilitychange', this.syncAnimation);
      this.motion.addEventListener('change', this.onMotionChange);
      this.intersection = new IntersectionObserver(entries => {
        this.visible = entries[0]?.isIntersecting ?? false;
        this.syncAnimation();
      });
      this.intersection.observe(this.host);
      this.syncAnimation();
    });
  }

  private startCheers(): void {
    if (this.cheersTimer || this.paused || this.reduced) return;
    this.zone.runOutsideAngular(() => {
      this.cheersTimer = setInterval(() => {
        if (this.paused || this.reduced) return;
        this.setToasting(true);
        this.cheersOff = setTimeout(() => this.setToasting(false), CHEERS_FOR_MS);
      }, CHEERS_EVERY_MS);
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.intersection?.disconnect();
    this.stopCheers();
    document.removeEventListener('visibilitychange', this.syncAnimation);
    this.motion.removeEventListener('change', this.onMotionChange);
  }

  private stopCheers(): void {
    if (this.cheersTimer) clearInterval(this.cheersTimer);
    if (this.cheersOff) clearTimeout(this.cheersOff);
    this.cheersTimer = null;
    this.cheersOff = null;
    this.toasting = false;
  }

  private setToasting(on: boolean): void {
    if (this.destroyed) return;
    this.toasting = on;
    this.cdr.detectChanges();
  }

  private readonly onMotionChange = (): void => {
    if (this.destroyed) return;
    this.syncAnimation();
    this.cdr.detectChanges();
  };

  private readonly syncAnimation = (): void => {
    if (this.destroyed) return;
    const paused = document.hidden || !this.visible;
    const pauseChanged = this.paused !== paused;
    const wasToasting = this.toasting;
    this.host.classList.toggle('is-paused', paused);
    this.paused = paused;
    if (this.paused || this.reduced) this.stopCheers();
    else this.startCheers();
    if (pauseChanged || wasToasting !== this.toasting) this.cdr.detectChanges();
  };
}
