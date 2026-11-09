import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnDestroy,
  QueryList, ViewChildren, inject,
} from '@angular/core';

import { MAGUITO_BASIC_COLORS, MaguitoCustomColors } from '../../core/components/maguito/maguito-colors';
import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';
import { MaguitoComponent } from '../../core/components/maguito/maguito.component';
import { TavernLight } from '../tavern-daylight';

/** Cada cuánto brindan los amigos del fondo, y cuánto dura el choque de jarras. */
const CHEERS_EVERY_MS = 6500;
const CHEERS_FOR_MS = 1900;
/** Cada cuánto alguien del salón hace un gesto suelto (saluda, celebra, se sorprende). */
const GESTURE_EVERY_MS = 2300;
const GESTURE_JITTER_MS = 1600;
/** La charla del fondo: cada uno habla por turnos y gesticula mientras se ve su globito. */
const TALK_EVERY_MS = 3400;
const TALK_FOR_MS = 2300;
type CrowdGesture = 'greet' | 'success' | 'poke' | 'chat';
/** Gestos al azar, con su peso: saludar con el sombrero es lo más común. */
const GESTURES: ReadonlyArray<[CrowdGesture, number]> = [
  ['greet', 5], ['chat', 3], ['success', 2], ['poke', 2],
];
/** Cuánto dura el movimiento de cuerpo que acompaña a cada gesto (el brazo solo no se ve de lejos). */
const ACCENT_MS: Record<CrowdGesture, number> = { greet: 1300, chat: 1100, success: 950, poke: 520 };
const TALK_EMOJI: Record<'l' | 'r', readonly string[]> = {
  l: ['📚', '📖', '✨', '🧙', '🐉'],
  r: ['😂', '😮', '👏', '💛', '🤔'],
};

/** Los mismos colores que el lector puede elegir para su Maguito, así el salón se ve variado. */
const TINT: Record<string, MaguitoCustomColors> = Object.fromEntries(
  MAGUITO_BASIC_COLORS.map(palette => [palette.id, palette.colors]),
);

/** Halo de una fuente de luz pintada: posición y tamaño en % de la pintura, y su parpadeo. */
interface Glow { x: number; y: number; size: number; ratio?: number; o: number; d: number; delay: number; fire?: boolean }
/** Mota de polvo (o brasa) que sube despacio por la luz. `dx` y `rise` en px. */
interface Mote { x: number; y: number; size: number; dx: number; rise: number; d: number; delay: number; ember?: boolean }
/** Estrella que titila en el cielo de un ventanal. */
interface Star { x: number; y: number; size: number; d: number; delay: number }

/**
 * La vida del fondo de La Taberna: magos que cruzan el salón, la mesera con su bandeja, dos que
 * se lanzan una pelotita mágica con las varitas, amigos que brindan, dos que conversan, y la luz
 * de las velas, el polvo y las estrellas de los ventanales. Es decoración pura (sin clics, oculta
 * para los lectores de pantalla) y vive en la misma caja que la pintura del salón, así cada uno
 * pisa el piso de la pintura sin importar el tamaño de la ventana.
 *
 * Nadie se da vuelta: quien cruza el salón entra por un costado y sale por el otro, y el bucle
 * vuelve a empezar fuera de la pintura.
 *
 * Cada personaje usa el mismo Maguito SVG del resto de la aplicación, en modo `calm`: caminan,
 * brindan y parpadean, pero sin respiración ni balanceo continuos. Son una veintena de SVG chicos
 * y esos gestos finos (que a ese tamaño no se ven) obligaban a repintar la sala en cada cuadro.
 * Las animaciones CSS se pausan fuera de pantalla y con la pestaña oculta; con "reducir
 * movimiento" todos quedan quietos en su lugar.
 */
@Component({
  selector: 'app-tavern-crowd',
  templateUrl: './tavern-crowd.component.html',
  styleUrls: ['./tavern-crowd.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', 'data-renderer': 'svg', '[attr.data-light]': 'light' },
})
export class TavernCrowdComponent implements AfterViewInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  get reduced(): boolean { return this.motion.matches; }
  paused = document.hidden;
  /** La hora del día de la sala: cambia la luz de las velas, el sol o la luna por los ventanales y
   *  cuánto alumbra a los personajes. */
  @Input() light: TavernLight = 'night';
  /** Los amigos del fondo chocan las jarras un momento y vuelven a conversar. */
  toasting = false;

  /**
   * Con capa de tela (roja, esmeralda…) el color pinta cuerpo y sombrero y la capa conserva su
   * tela; sin capa, el color va de pies a cabeza. Algunos se quedan con el azul de siempre.
   */
  readonly look: Record<string, MaguitoOutfit> = {
    walkerA: { head: 'pirate', face: 'beard', cape: 'red', colors: TINT['teal'] },
    walkerB: { head: 'tophat', eyes: 'monocle', cape: 'emerald', colors: TINT['black'] },
    waitress: { head: 'witch-flower', neck: 'bowtie', cape: 'royal', colors: TINT['pink'] },
    duelL: { head: 'wizard', eyes: 'halfmoon', colors: TINT['green'] },
    duelR: { head: 'feather', face: 'mustache', colors: TINT['orange'] },
    friend1: { head: 'beret', neck: 'scarf-red', colors: TINT['yellow'] },
    friend2: { head: 'graduate', eyes: 'reading', cape: 'midnight' },
    friend3: { head: 'laurel', face: 'beard', cape: 'emerald', colors: TINT['brown'] },
    chatL: { head: 'deerstalker', colors: TINT['red'] },
    chatR: { head: 'crown', eyes: 'star', colors: TINT['purple'] },
  };

  /**
   * Comensales sentados detrás de la barra y de las mesas del fondo: unos clásicos y otros de
   * colores. Solo se sientan donde el mueble es una franja lisa (barra y mesas largas del fondo):
   * el borde les tapa un tercio del cuerpo y se ven sentados, no parados encima. En las mesas de
   * los costados no hay nadie: sus sillas recortaban a los Maguitos de forma rara.
   * `bottom` = borde del mueble menos un tercio del alto del Maguito (alto = ancho × 1,7).
   */
  readonly seats: ReadonlyArray<{
    x: number; bottom: number; width: number; left: boolean; outfit: MaguitoOutfit;
  }> = [
    // Detrás de la barra (borde a 50,3 %). En x 7,8 está la mesera, con su jarra.
    { x: 2.5, bottom: 46.3, width: 6, left: false, outfit: { head: 'wizard', colors: TINT['red'] } },
    { x: 21, bottom: 46.6, width: 5.5, left: false, outfit: { head: 'wizard', colors: TINT['teal'] } },
    { x: 27, bottom: 46.6, width: 5.5, left: true, outfit: { head: 'beret', cape: 'emerald' } },
    // Mesas del fondo (borde a 50 %).
    { x: 35, bottom: 46.9, width: 5.5, left: false, outfit: { head: 'wizard', colors: TINT['pink'] } },
    { x: 56, bottom: 46.9, width: 5.5, left: true, outfit: { head: 'wizard', colors: TINT['white'] } },
  ];

  /**
   * La luz del salón: un halo sobre cada vela, farol y chimenea de la pintura, que respira con su
   * propio ritmo. Solo cambian opacidad y escala, así el navegador lo compone sin repintar.
   */
  readonly glows: ReadonlyArray<Glow> = [
    { x: 51, y: 13.3, size: 22, o: .5, d: 4.6, delay: -1.2 },
    { x: 8.9, y: 21.9, size: 13, o: .5, d: 3.8, delay: -2.6 },
    { x: 39.6, y: 39, size: 10, o: .95, d: 1.6, delay: -.4, fire: true },
    { x: 20, y: 39.3, size: 7, o: .8, d: 3.1, delay: -1.9 },
    { x: 10.2, y: 40.6, size: 5, o: .7, d: 2.7, delay: -.8 },
    { x: 30.4, y: 41.4, size: 5, o: .7, d: 3.4, delay: -2.2 },
    { x: 33.8, y: 42.5, size: 5, o: .7, d: 2.9, delay: -1.1 },
    { x: 58.7, y: 30.1, size: 6, o: .7, d: 3.6, delay: -3 },
    { x: 63.9, y: 41.4, size: 5, o: .7, d: 2.6, delay: -.3 },
    { x: 79.9, y: 20.8, size: 8, o: .7, d: 3.3, delay: -2.4 },
    { x: 99, y: 38.4, size: 7, o: .7, d: 3.9, delay: -1.5 },
    { x: 49, y: 48.6, size: 26, ratio: 3.4, o: .5, d: 4.2, delay: -2 },
    { x: 15, y: 48.6, size: 20, ratio: 3, o: .45, d: 3.7, delay: -.9 },
    { x: 18.5, y: 55.7, size: 8, o: .85, d: 2.8, delay: -1.4 },
    { x: 86, y: 54.2, size: 8, o: .85, d: 3.2, delay: -2.8 },
  ];

  /** Polvo que flota en la luz de los ventanales y unas brasas que suben de la chimenea. */
  readonly motes: ReadonlyArray<Mote> = [
    { x: 72, y: 52, size: .22, dx: 18, rise: 70, d: 11, delay: -2 },
    { x: 76, y: 47, size: .18, dx: -14, rise: 90, d: 14, delay: -7 },
    { x: 82, y: 56, size: .25, dx: 10, rise: 60, d: 12, delay: -4 },
    { x: 89, y: 50, size: .2, dx: -20, rise: 80, d: 16, delay: -11 },
    { x: 93, y: 45, size: .18, dx: 12, rise: 70, d: 13, delay: -5 },
    { x: 47, y: 50, size: .2, dx: -12, rise: 75, d: 12, delay: -9 },
    { x: 53, y: 44, size: .18, dx: 16, rise: 85, d: 15, delay: -3 },
    { x: 58, y: 52, size: .24, dx: -10, rise: 60, d: 11, delay: -6 },
    { x: 22, y: 47, size: .2, dx: 14, rise: 70, d: 13, delay: -8 },
    { x: 28, y: 52, size: .18, dx: -16, rise: 90, d: 15, delay: -12 },
    { x: 39, y: 41, size: .16, dx: 6, rise: 55, d: 5.5, delay: -1, ember: true },
    { x: 40.4, y: 40.5, size: .14, dx: -8, rise: 65, d: 6.5, delay: -3.6, ember: true },
    { x: 39.8, y: 41.5, size: .15, dx: 3, rise: 50, d: 4.8, delay: -2.2, ember: true },
  ];

  /** El cielo de los ventanales: arriba de los cerros, entre los vidrios emplomados. */
  readonly stars: ReadonlyArray<Star> = [
    { x: 71.8, y: 32, size: .3, d: 3.4, delay: -.6 },
    { x: 76.9, y: 27.2, size: .24, d: 4.6, delay: -2.1 },
    { x: 74.5, y: 36.8, size: .2, d: 2.9, delay: -1.3 },
    { x: 73, y: 21.3, size: .26, d: 5.2, delay: -3.8 },
    { x: 87.3, y: 33.1, size: .28, d: 3.8, delay: -2.7 },
    { x: 93, y: 28.8, size: .22, d: 4.2, delay: -.2 },
    { x: 90.6, y: 37.4, size: .2, d: 3.1, delay: -1.8 },
    { x: 94.8, y: 21.9, size: .3, d: 4.9, delay: -4.1 },
    { x: 48.6, y: 32, size: .22, d: 3.6, delay: -1 },
    { x: 78.6, y: 34.6, size: .22, d: 4.4, delay: -3.2 },
    { x: 95.2, y: 33.8, size: .26, d: 3.7, delay: -.9 },
  ];

  /** Todos los Maguitos del salón y sus elementos, en el mismo orden (para leer `data-gesture`). */
  @ViewChildren(MaguitoComponent) private maguitos?: QueryList<MaguitoComponent>;
  @ViewChildren(MaguitoComponent, { read: ElementRef }) private maguitoEls?: QueryList<ElementRef<HTMLElement>>;

  private cheersTimer: ReturnType<typeof setInterval> | null = null;
  private cheersOff: ReturnType<typeof setTimeout> | null = null;
  private gestureTimer: ReturnType<typeof setTimeout> | null = null;
  private talkTimer: ReturnType<typeof setInterval> | null = null;
  private talkOff: ReturnType<typeof setTimeout> | null = null;
  private talkTurn: 'l' | 'r' = 'l';
  private lastGesture: MaguitoComponent | null = null;
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
    this.stopLife();
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

  // ── Gestos sueltos y charla ─────────────────────────────────────────
  // Usan los gestos propios del Maguito (saludo con el sombrero, celebración, sorpresa). Solo uno a
  // la vez y por poco rato: así el resto del salón sigue quieto y no se repinta de más.

  private startLife(): void {
    if (this.gestureTimer || this.talkTimer || this.paused || this.reduced) return;
    this.zone.runOutsideAngular(() => {
      this.scheduleGesture();
      this.talkTimer = setInterval(() => this.talk(), TALK_EVERY_MS);
    });
  }

  private stopLife(): void {
    if (this.gestureTimer) clearTimeout(this.gestureTimer);
    if (this.talkTimer) clearInterval(this.talkTimer);
    if (this.talkOff) clearTimeout(this.talkOff);
    this.gestureTimer = null;
    this.talkTimer = null;
    this.talkOff = null;
    this.host.querySelectorAll('.cr-say.is-on').forEach(el => el.classList.remove('is-on'));
  }

  private scheduleGesture(): void {
    this.gestureTimer = setTimeout(() => {
      this.gestureTimer = null;
      if (this.destroyed || this.paused || this.reduced) return;
      this.randomGesture();
      this.scheduleGesture();
    }, GESTURE_EVERY_MS + Math.random() * GESTURE_JITTER_MS);
  }

  /** Los Maguitos marcados con `data-gesture` (las dos listas vienen en el mismo orden). */
  private maguitosOf(kind: (value: string | undefined) => boolean): Array<[MaguitoComponent, HTMLElement]> {
    const comps = this.maguitos?.toArray() ?? [];
    const els = this.maguitoEls?.toArray() ?? [];
    return comps
      .map((comp, i): [MaguitoComponent, HTMLElement | undefined] => [comp, els[i]?.nativeElement])
      .filter((pair): pair is [MaguitoComponent, HTMLElement] => !!pair[1] && kind(pair[1].dataset['gesture']));
  }

  /** Alguien sentado (o uno de los amigos, si no están brindando) hace un gesto al azar. */
  private randomGesture(): void {
    const pool = this.maguitosOf(kind => kind === 'seat' || (kind === 'friend' && !this.toasting))
      .filter(([comp]) => comp !== this.lastGesture);
    if (!pool.length) return;
    const [comp, el] = pool[Math.floor(Math.random() * pool.length)];
    this.lastGesture = comp;
    this.gesture(comp, el, this.pickGesture());
  }

  /** El gesto del Maguito (brazo, cara) más un movimiento de todo el cuerpo que se lee de lejos. */
  private gesture(comp: MaguitoComponent, el: HTMLElement, gesture: CrowdGesture): void {
    comp.play(gesture);
    el.classList.remove('cr-gest-greet', 'cr-gest-chat', 'cr-gest-success', 'cr-gest-poke');
    void el.offsetWidth; // reinicia la animación si repite el mismo gesto
    el.classList.add('cr-gest-' + gesture);
    setTimeout(() => el.classList.remove('cr-gest-' + gesture), ACCENT_MS[gesture]);
  }

  private pickGesture(): CrowdGesture {
    const total = GESTURES.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * total;
    for (const [gesture, weight] of GESTURES) {
      roll -= weight;
      if (roll < 0) return gesture;
    }
    return 'greet';
  }

  /** Habla uno de los dos de la charla: aparece su globito con otro emoji y mueve el brazo. */
  private talk(): void {
    if (this.destroyed || this.paused || this.reduced) return;
    const side = this.talkTurn;
    this.talkTurn = side === 'l' ? 'r' : 'l';
    const bubble = this.host.querySelector<HTMLElement>(side === 'l' ? '.cr-say-a' : '.cr-say-b');
    const [speaker] = this.maguitosOf(kind => kind === 'talk-' + side);
    // Quien responde le quita la palabra al otro: un globito a la vez.
    this.host.querySelectorAll('.cr-say.is-on').forEach(el => el.classList.remove('is-on'));
    if (bubble) {
      const options = TALK_EMOJI[side];
      bubble.textContent = options[Math.floor(Math.random() * options.length)];
      bubble.classList.add('is-on');
    }
    if (speaker) this.gesture(speaker[0], speaker[1], 'chat');
    if (this.talkOff) clearTimeout(this.talkOff);
    this.talkOff = setTimeout(() => bubble?.classList.remove('is-on'), TALK_FOR_MS);
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
    if (this.paused || this.reduced) {
      this.stopCheers();
      this.stopLife();
    } else {
      this.startCheers();
      this.startLife();
    }
    if (pauseChanged || wasToasting !== this.toasting) this.cdr.detectChanges();
  };
}
