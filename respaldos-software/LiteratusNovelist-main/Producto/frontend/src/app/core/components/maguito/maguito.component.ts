import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, NgZone,
  OnChanges, OnDestroy, Output, SimpleChanges, inject,
} from '@angular/core';

import { MaguitoLook, MaguitoOutfit, WearSlot, resolveOutfit } from './maguito-outfit';

/**
 * Estados de Maguito:
 * - idle: respira, parpadea, mira alrededor (o sigue al puntero) y el sombrero lo acompaña.
 * - greet: mira al usuario y saluda con el brazo (una vez; luego vuelve a idle).
 * - loading: agita la pluma-varita, suelta chispas y las estrellas orbitan (se mantiene).
 * - success: pequeño salto de celebración con estrellas (una vez).
 * - chat: saludo corto para cuando se abre el asistente (una vez).
 */
export type MaguitoState = 'idle' | 'greet' | 'loading' | 'success' | 'chat';

type ShownState = MaguitoState | 'poke';

/** Estados que se reproducen una vez y después vuelven al estado de base. */
const ONE_SHOT_MS: Partial<Record<ShownState, number>> = {
  greet: 2600,
  chat: 1900,
  success: 1500,
  poke: 520,
};

/** Hacia dónde mira en cada estado (-1..1); null = sigue al puntero o mira alrededor. */
const GAZE: Partial<Record<ShownState, { x: number; y: number }>> = {
  greet: { x: 0, y: 0.15 },
  chat: { x: 0, y: 0.15 },
  loading: { x: -0.85, y: -0.8 },   // la punta de la pluma
  success: { x: 0, y: -0.2 },
};

const DEF_NAMES = ['aura', 'aviator-cap', 'band', 'beard', 'body', 'body-shade', 'brim', 'brim-under', 'cape', 'crown', 'eye-l', 'eye-r',
  'feather', 'glow', 'goggle-glass', 'hat', 'hat-glow', 'iris', 'lens', 'lid', 'limb', 'metal', 'mustache', 'nib', 'scarf', 'sclera', 'spark', 'star', 'tophat', 'velvet', 'witch-brim', 'witch-hat'];

const DETAIL_FRAMES: Record<WearSlot, string> = {
  head: '92 0 284 190', eyes: '138 178 170 78', face: '157 236 117 117',
  neck: '143 259 164 97', cape: '117 238 240 126',
};
const HEAD_FRAMES: Record<string, string> = {
  crown: '147 96 148 90', tophat: '139 70 171 118', pirate: '126 84 198 102',
  beret: '149 102 157 80', aviator: '143 78 164 155',
  graduate: '129 94 188 98', feather: '126 48 200 141',
  laurel: '144 108 165 85', deerstalker: '131 93 190 98',
};

/**
 * Maguito, la mascota de Literatus, dibujado en SVG por capas y animado por partes:
 * parpadeo, pupilas, giro de cabeza, respiración, sombrero, brazo que saluda, pluma-varita,
 * estrellas y partículas. Las animaciones son CSS (transform/opacity); este componente solo
 * decide el estado, programa los parpadeos y mueve la mirada, todo fuera de la zona de
 * Angular para no disparar detección de cambios. Se pausa fuera de pantalla y respeta
 * prefers-reduced-motion.
 */
@Component({
  selector: 'app-maguito',
  templateUrl: './maguito.component.html',
  styleUrl: './maguito.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': "label ? 'img' : null",
    '[attr.aria-label]': 'label || null',
    '[attr.aria-hidden]': "label ? null : 'true'",
    '[class.mg-interactive]': 'interactive',
    '[class.mg-with-aura]': 'aura',
    '[class.mg-crop-bust]': "crop === 'bust'",
    '[class.mg-crop-detail]': "crop === 'detail'",
    '[class.mg-calm]': 'calm',
    '[class.mg-has-mug]': 'mug',
    '[class.mg-toasting]': 'toasting',
    '[attr.data-cape]': 'look.cape',
    '[attr.data-face]': 'look.face',
    '[attr.data-eyes]': 'look.eyes',
    '[attr.data-detail-slot]': "crop === 'detail' ? detailSlot : null",
    '(click)': 'poke()',
  },
})
export class MaguitoComponent implements OnChanges, AfterViewInit, OnDestroy {
  private static instances = 0;
  private readonly zone = inject(NgZone);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  @Input() state: MaguitoState = 'idle';
  /** Saluda la primera vez que aparece en pantalla. */
  @Input() greetOnEnter = false;
  /** Halo morado y dorado detrás (pantallas de carga, héroes). */
  @Input() aura = false;
  /** Al tocarlo reacciona y emite (poked). */
  @Input() interactive = true;
  /** Sus ojos siguen al puntero (solo con mouse; en táctil mira alrededor solo). */
  @Input() followPointer = true;
  /** Texto para lectores de pantalla; vacío = decorativo. */
  @Input() label = '';
  /** Congela todo (p. ej. cuando su pantalla de carga quedó oculta pero sigue en el DOM). */
  @Input() paused = false;
  /** 'bust' encuadra cabeza y sombrero, para avatares pequeños. */
  @Input() crop: 'full' | 'bust' | 'detail' = 'full';
  /** Encuadre de la pieza real para las miniaturas del Bazar. */
  @Input() detailSlot: WearSlot = 'head';
  /**
   * En reposo solo parpadea y mira: sin respiración ni balanceo continuos. Para lugares
   * que están siempre a la vista (la burbuja del asistente en todas las páginas).
   */
  @Input() calm = false;
  /** Sostiene una jarra de madera con espuma de la Taberna. */
  @Input() mug = false;
  /** Brinda chocando la jarra con sus compañeros. */
  @Input() toasting = false;
  /** Accesorios comprados en El Bazar. Sin outfit lleva el atuendo de siempre. */
  @Input() outfit: MaguitoOutfit | null | undefined = null;

  /** El outfit ya resuelto: cada espacio con una variante que este componente sabe dibujar. */
  look: MaguitoLook = resolveOutfit(null);

  get viewBox(): string {
    if (this.crop === 'detail') {
      if (this.detailSlot === 'head') return HEAD_FRAMES[this.look.head] || DETAIL_FRAMES.head;
      if (this.detailSlot === 'eyes' && this.look.eyes === 'monocle') return '138 178 170 132';
      if (this.detailSlot === 'face' && this.look.face === 'mustache') return '171 230 91 41';
      if (this.detailSlot === 'neck' && this.look.neck === 'bowtie') return '187 262 77 43';
      return DETAIL_FRAMES[this.detailSlot];
    }
    return this.crop === 'bust' ? '98 70 250 250' : '0 0 400 380';
  }

  @Output() poked = new EventEmitter<void>();

  // Referencias únicas por instancia: los gradientes de una copia oculta (display: none)
  // no se pintan en otras, así que cada Maguito lleva los suyos.
  readonly ids: Record<string, string> = {};
  readonly refs: Record<string, string> = {};
  readonly hrefs: Record<string, string> = {};

  private shown: ShownState = 'idle';
  private oneShotTimer: any = null;
  private blinkTimer: any = null;
  private glanceTimer: any = null;
  private pointerRaf = 0;
  private pointerX = 0;
  private pointerY = 0;
  private lastPointerAt = 0;
  private glance = { x: 0, y: 0 };
  private onScreen = false;
  private greetedOnEnter = false;
  private viewReady = false;
  private observer?: IntersectionObserver;
  private pupils: SVGGElement[] = [];
  private face: SVGGElement | null = null;
  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly finePointer = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

  constructor() {
    const suffix = `mg${++MaguitoComponent.instances}-`;
    for (const name of DEF_NAMES) {
      this.ids[name] = suffix + name;
      this.refs[name] = `url(#${suffix}${name})`;
      this.hrefs[name] = `#${suffix}${name}`;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Antes del primer render también: el primer ngOnChanges llega sin vista.
    if (changes['outfit']) this.look = resolveOutfit(this.outfit);
    if (!this.viewReady) return;
    if (changes['state']) this.show(this.state);
    if (changes['paused']) this.updateRunning();
  }

  ngAfterViewInit(): void {
    this.pupils = Array.from(this.host.querySelectorAll<SVGGElement>('.mg-pupil'));
    this.face = this.host.querySelector<SVGGElement>('.mg-face');
    this.viewReady = true;
    this.show(this.state);

    this.zone.runOutsideAngular(() => {
      document.addEventListener('visibilitychange', this.onPageVisibility);
      if (this.followPointer && this.finePointer && !this.reducedMotion) {
        window.addEventListener('pointermove', this.onPointerMove, { passive: true });
      }
      if (typeof IntersectionObserver === 'function') {
        this.observer = new IntersectionObserver(entries => this.setOnScreen(entries[0]?.isIntersecting ?? false));
        this.observer.observe(this.host);
      } else {
        this.setOnScreen(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    document.removeEventListener('visibilitychange', this.onPageVisibility);
    window.removeEventListener('pointermove', this.onPointerMove);
    cancelAnimationFrame(this.pointerRaf);
    clearTimeout(this.oneShotTimer);
    this.stopLoops();
  }

  /** Toque o clic: se aplasta, abre los ojos y rebota. */
  poke(): void {
    if (!this.interactive) return;
    this.show('poke');
    this.poked.emit();
  }

  /** Reproduce un gesto suelto desde fuera (p. ej. al probarse ropa en la Taberna) sin emitir (poked). */
  play(gesture: 'poke' | 'success'): void {
    if (this.viewReady) this.show(gesture);
  }

  // ── Estados ─────────────────────────────────────────────────────────

  private show(next: ShownState): void {
    clearTimeout(this.oneShotTimer);
    const classes = this.host.classList;
    classes.remove(`mg--${this.shown}`);
    if (next === this.shown && ONE_SHOT_MS[next]) {
      void this.host.getBoundingClientRect(); // reinicia la animación si se repite el mismo gesto
    }
    this.shown = next;
    classes.add(`mg--${next}`);
    this.applyGaze();

    const duration = ONE_SHOT_MS[next];
    if (duration) {
      this.zone.runOutsideAngular(() => {
        // Al terminar el gesto vuelve al estado pedido (si era un gesto, a idle).
        this.oneShotTimer = setTimeout(() => this.show(ONE_SHOT_MS[this.state] ? 'idle' : this.state), duration);
      });
    }
  }

  // ── Visibilidad: fuera de pantalla todo se pausa ───────────────────

  private setOnScreen(visible: boolean): void {
    this.onScreen = visible;
    this.updateRunning();
    if (visible && this.greetOnEnter && !this.greetedOnEnter && this.state === 'idle') {
      this.greetedOnEnter = true;
      this.show('greet');
    }
  }

  private onPageVisibility = () => this.updateRunning();

  private updateRunning(): void {
    const running = this.onScreen && !this.paused && document.visibilityState !== 'hidden';
    this.host.classList.toggle('mg-paused', !running);
    if (running) {
      this.startLoops();
    } else {
      this.stopLoops();
    }
  }

  private startLoops(): void {
    if (!this.blinkTimer) this.scheduleBlink();
    if (!this.glanceTimer && !this.reducedMotion) this.scheduleGlance();
  }

  private stopLoops(): void {
    clearTimeout(this.blinkTimer);
    clearTimeout(this.glanceTimer);
    this.blinkTimer = null;
    this.glanceTimer = null;
  }

  // ── Parpadeo: cada 2–5,5 s, a veces doble ──────────────────────────

  private scheduleBlink(): void {
    this.blinkTimer = setTimeout(() => {
      this.blink();
      if (Math.random() < 0.18) setTimeout(() => this.blink(), 260);
      this.scheduleBlink();
    }, 2200 + Math.random() * 3300);
  }

  private blink(): void {
    const classes = this.host.classList;
    classes.remove('mg-blink');
    void this.host.getBoundingClientRect();
    classes.add('mg-blink');
    setTimeout(() => classes.remove('mg-blink'), 200);
  }

  // ── Mirada: sigue al puntero o mira alrededor ──────────────────────

  private scheduleGlance(): void {
    this.glanceTimer = setTimeout(() => {
      // Con mouse activo manda el puntero; si no, vistazos cortos, casi siempre cerca del centro.
      if (Date.now() - this.lastPointerAt > 3500) {
        const far = Math.random() < 0.3;
        this.glance = far
          ? { x: Math.random() < 0.5 ? -0.8 : 0.8, y: (Math.random() - 0.6) * 0.8 }
          : { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.4 };
        this.applyGaze();
      }
      this.scheduleGlance();
    }, 1600 + Math.random() * 2800);
  }

  private onPointerMove = (event: PointerEvent) => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.lastPointerAt = Date.now();
    if (this.pointerRaf || !this.onScreen) return;
    this.pointerRaf = requestAnimationFrame(() => {
      this.pointerRaf = 0;
      const rect = this.host.getBoundingClientRect();
      const dx = this.pointerX - (rect.left + rect.width * 0.54);
      const dy = this.pointerY - (rect.top + rect.height * 0.56);
      const distance = Math.max(1, Math.hypot(dx, dy));
      const reach = Math.min(1, distance / 260); // cerca de la cara mira casi al frente
      this.glance = { x: (dx / distance) * reach, y: (dy / distance) * reach };
      this.applyGaze();
    });
  };

  private applyGaze(): void {
    const gaze = GAZE[this.shown] ?? (this.reducedMotion ? { x: 0, y: 0 } : this.glance);
    const pupil = `translate(${(gaze.x * 6).toFixed(2)}px, ${(gaze.y * 5).toFixed(2)}px)`;
    for (const el of this.pupils) el.style.transform = pupil;
    // La cara se corre un poco hacia donde mira: parece que gira la cabeza.
    if (this.face) this.face.style.transform = `translate(${(gaze.x * 3).toFixed(2)}px, ${(gaze.y * 1.6).toFixed(2)}px)`;
  }
}
