import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, inject,
} from '@angular/core';

import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';
import { prefersReducedMotion } from '../../core/utils/motion.util';

/** Cada cuánto brindan los amigos del fondo, y cuánto dura el choque de jarras. */
const CHEERS_EVERY_MS = 6500;
const CHEERS_FOR_MS = 1900;

/**
 * La vida del fondo de La Taberna: magos que cruzan el salón, la mesera con su bandeja, un duelo
 * de varitas, amigos que brindan y dos que conversan. Es decoración pura (sin clics, oculta para
 * los lectores de pantalla) y vive en la misma caja que la pintura del salón, así cada uno pisa
 * el piso de la pintura sin importar el tamaño de la ventana.
 *
 * El movimiento es CSS (corre fuera del hilo principal). Se detiene con la pestaña oculta y,
 * con "reducir movimiento", todos quedan quietos en su lugar.
 */
@Component({
  selector: 'app-tavern-crowd',
  templateUrl: './tavern-crowd.component.html',
  styleUrls: ['./tavern-crowd.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TavernCrowdComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly reduced = prefersReducedMotion();
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

  private cheersTimer: ReturnType<typeof setInterval> | null = null;
  private cheersOff: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    if (this.reduced) return;
    // Fuera de la zona de Angular: un brindis no debe disparar la detección de toda la página.
    this.zone.runOutsideAngular(() => {
      this.cheersTimer = setInterval(() => {
        if (document.hidden) return;
        this.setToasting(true);
        this.cheersOff = setTimeout(() => this.setToasting(false), CHEERS_FOR_MS);
      }, CHEERS_EVERY_MS);
    });
  }

  ngOnDestroy(): void {
    if (this.cheersTimer) clearInterval(this.cheersTimer);
    if (this.cheersOff) clearTimeout(this.cheersOff);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private setToasting(on: boolean): void {
    this.toasting = on;
    this.cdr.detectChanges();
  }

  /** Con la pestaña oculta todo queda en pausa (la clase va directo al host: no hace falta detección). */
  private readonly onVisibility = (): void => {
    this.host.classList.toggle('is-paused', document.hidden);
  };
}
