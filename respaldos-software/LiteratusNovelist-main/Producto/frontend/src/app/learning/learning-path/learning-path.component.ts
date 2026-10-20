// src/app/learning/learning-path/learning-path.component.ts
import {
  AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener,
  NgZone, OnDestroy, OnInit, ViewChild, inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { LearningService, UserStatus, LearningUnit, LearningLevel, PathChest, ChestClaimResult } from '../../core/services/learning.service';
import { ChatService } from '../../core/services/chat.service';
import { MaguitoOutfit, parseWear } from '../../core/components/maguito/maguito-outfit';
import { PATH_REALMS, PathRealm } from './path-realms';

/** Mapa de lado (escritorio con alto suficiente) o recorrido hacia abajo (celular y pantallas bajas). */
export const HORIZONTAL_QUERY = '(min-width: 1024px) and (min-height: 700px)';

/** Caminos de cada unidad, dibujados para un tamaño base: el vertical (720 × 760) y el horizontal (1100 × 600). */
const RIBBON = {
  v: {
    width: 720,
    height: 760,
    trail: 'M360 -14C360 24 360 45 360 76C360 145 470 147 470 213S370 282 370 350S245 420 245 486S360 565 360 638V774',
    branch: 'M370 350Q485 343 554 410',
    x: [50, 65.28, 51.39, 34.03, 50],
    y: [10, 28, 46, 64, 84],
  },
  h: {
    width: 1100,
    height: 600,
    trail: 'M-14 456C150 456 250 372 363 372S450 228 517 228S600 360 671 360S760 216 825 216S910 348 979 348S1060 456 1114 456',
    branch: 'M671 360Q735 395 781 504',
    x: [33, 47, 61, 75, 89],
    y: [62, 38, 60, 36, 58],
  },
} as const;

/**
 * El camino se vuelve a trazar al tamaño real de la pista (sin estirar el SVG). El tramo dorado es su propio
 * path, cortado en la etapa actual: con trazos punteados (dasharray) Chrome lo dibujaba corto o en otro lugar.
 */
export interface RibbonShape { viewBox: string; trail: string; branch: string; litTo: string[]; }

/** Escala un path con comandos absolutos M, L, C, S, Q, H y V. */
export function scalePath(d: string, sx: number, sy: number): string {
  return d.replace(/([MLCSQHV])([^MLCSQHV]*)/g, (_, command: string, args: string) => {
    const numbers = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const scaled = numbers.map((value, index) =>
      command === 'V' ? value * sy : command === 'H' ? value * sx : index % 2 === 0 ? value * sx : value * sy);
    return command + scaled.map(value => +value.toFixed(1)).join(' ');
  });
}

/**
 * Cada camino es M + un tramo por parada (+ la salida): el tramo dorado hasta la parada k son los
 * primeros k + 1 tramos. litTo[k] termina justo en la etapa k.
 */
function litPrefixes(trail: string): string[] {
  const commands = trail.match(/[MLCSQHV][^MLCSQHV]*/g) ?? [];
  return Array.from({ length: 5 }, (_, stop) => commands.slice(0, stop + 2).join(''));
}

function buildShape(base: (typeof RIBBON)['h'] | (typeof RIBBON)['v'], width: number, height: number): RibbonShape {
  const sx = width / base.width, sy = height / base.height;
  const trail = scalePath(base.trail, sx, sy);
  return { viewBox: `0 0 ${width} ${height}`, trail, branch: scalePath(base.branch, sx, sy), litTo: litPrefixes(trail) };
}

/** En el mapa de lado, el camino también ondula entre unidades: por el título del reino, el tesoro y el final. */
const ZONE_RIBBON = 'M0 456C200 456 300 404 500 404S800 456 1000 456';
/** El último tramo termina en el sello del final (50 % · 55 %), no en un corte. */
const END_RIBBON = 'M0 456C200 456 330 456 420 412S500 344 500 330';

/** Hasta qué etapa llega el camino de una unidad (índice de la última abierta) y si ya se terminó. */
export interface UnitTrail { furthest: number; complete: boolean; }
const NO_TRAIL: UnitTrail = { furthest: -1, complete: false };

export type RealmState = 'done' | 'current' | 'open' | 'locked';

/** Gestos que cuentan como «el lector empezó a moverse por el mapa». */
const USER_INPUT = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;

@Component({
  selector: 'app-learning-path',
  templateUrl: './learning-path.component.html',
  styleUrls: ['./learning-path.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LearningPathComponent implements OnInit, OnDestroy, AfterViewChecked {
  private learningService = inject(LearningService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private chatService = inject(ChatService);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private element = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroy$ = new Subject<void>();

  @ViewChild('scroller') private scrollerRef?: ElementRef<HTMLElement>;
  @ViewChild('track') private trackRef?: ElementRef<HTMLElement>;
  @ViewChild('rail') private railRef?: ElementRef<HTMLElement>;
  @ViewChild('lens') private lensRef?: ElementRef<HTMLElement>;
  @ViewChild('view') private viewRef?: ElementRef<HTMLElement>;
  @ViewChild('marker') private markerRef?: ElementRef<HTMLElement>;
  @ViewChild('prevArrow') private prevArrowRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('nextArrow') private nextArrowRef?: ElementRef<HTMLButtonElement>;

  isLoading = true;
  userStatus: UserStatus | null = null;
  units: LearningUnit[] = [];
  realms: PathRealm[] = [];
  chests: PathChest[] = [];
  loadError = '';
  pageHidden = typeof document !== 'undefined' && document.hidden;
  reducedMotion = false;
  /** Mapa de lado en escritorio; recorrido vertical en celular. */
  horizontal = false;
  /** El reino que ocupa el centro de la vista: lo nombra el HUD y lo resalta el mini-mapa. */
  visibleRealm = 0;
  selectedChest: PathChest | null = null;
  chestResult: ChestClaimResult | null = null;
  chestError = '';
  readonly claimingCodes = new Set<string>();
  private motionQuery?: MediaQueryList;
  private layoutQuery?: MediaQueryList;
  private returnFocus: HTMLElement | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private queryChest: string | null = null;
  private queryUnit: string | null = null;
  private focusedQuery = '';
  /** El siguiente nivel por jugar: lleva a Maguito y la vista se centra en él. */
  currentLevelId: string | null = null;
  currentUnitNumber: number | null = null;
  private scrolledToCurrent = false;
  private trails = new Map<number, UnitTrail>();
  completedLevels = 0;
  totalLevels = 0;
  /** Lo que se ve al cargar ya llega dibujado; el camino solo se «dibuja» en las unidades que aparecen al moverte. */
  trailMotion = false;
  private shape: RibbonShape = { viewBox: '0 0 720 760', trail: RIBBON.v.trail, branch: RIBBON.v.branch, litTo: litPrefixes(RIBBON.v.trail) };
  private shapeKey = '';

  // Navegación del mapa (fuera de la zona de Angular: no dispara detección de cambios).
  private boundScroller: HTMLElement | null = null;
  private trackObserver?: ResizeObserver;
  private realmBounds: { start: number; end: number }[] = [];
  private markerAt = 0;
  private viewFrame = 0;
  private wheelTarget: number | null = null;
  private wheelFrame = 0;
  private wheelLast = 0;
  private drag: { x: number; left: number; moved: boolean; id: number } | null = null;
  private suppressClick = false;

  // Modales
  selectedLevel: LearningLevel | null = null;
  selectedUnit: LearningUnit | null = null;
  showLevelModal = false;

  showStreakModal = false;
  streakDetails: any = null;

  /** Prueba de salto: la unidad bloqueada a la que el lector quiere saltar. */
  showSkipModal = false;
  skipUnit: LearningUnit | null = null;

  showHeartsModal = false;
  heartsDetails: any = null;

  ngOnInit(): void {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionQuery.matches;
      this.motionQuery.addEventListener('change', this.motionChanged);
      this.layoutQuery = window.matchMedia(HORIZONTAL_QUERY);
      this.horizontal = this.layoutQuery.matches;
      this.layoutQuery.addEventListener('change', this.layoutChanged);
    }
    this.resetShape();
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.queryChest = params.get('chest');
      this.queryUnit = params.get('unit');
      if (!this.isLoading) this.scrollToCurrent();
    });
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onWindowScroll, { passive: true });
      for (const type of USER_INPUT) window.addEventListener(type, this.armTrailMotion, { passive: true, capture: true });
    });
    this.loadPath();
  }

  /** Tras el primer gesto del lector, las unidades que aparezcan dibujan su tramo dorado. */
  private readonly armTrailMotion = (): void => {
    for (const type of USER_INPUT) window.removeEventListener(type, this.armTrailMotion, { capture: true });
    if (this.trailMotion) return;
    this.zone.run(() => { this.trailMotion = true; this.cdr.markForCheck(); });
  };

  /** El scroller nace con el mapa (tras cargar): se le conectan los gestos la primera vez que aparece. */
  ngAfterViewChecked(): void {
    const scroller = this.scrollerRef?.nativeElement ?? null;
    if (scroller === this.boundScroller) return;
    this.unbindScroller();
    if (scroller) this.bindScroller(scroller);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.motionQuery?.removeEventListener('change', this.motionChanged);
    this.layoutQuery?.removeEventListener('change', this.layoutChanged);
    window.removeEventListener('scroll', this.onWindowScroll);
    for (const type of USER_INPUT) window.removeEventListener(type, this.armTrailMotion, { capture: true });
    this.unbindScroller();
    this.timers.forEach(timer => clearTimeout(timer));
    cancelAnimationFrame(this.viewFrame);
    cancelAnimationFrame(this.wheelFrame);
  }

  private readonly motionChanged = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
    this.cdr.markForCheck();
  };

  /** Al cambiar de mapa de lado a vertical (o al revés) se vuelve a centrar tu etapa. */
  private readonly layoutChanged = (event: MediaQueryListEvent): void => {
    this.zone.run(() => {
      this.horizontal = event.matches;
      this.resetShape();
      this.scrolledToCurrent = false;
      this.cdr.markForCheck();
      this.later(() => { this.measureWorld(); this.scrollToCurrent(); });
    });
  };

  @HostListener('document:visibilitychange') onVisibilityChange(): void {
    this.pageHidden = document.hidden;
    this.cdr.markForCheck();
  }

  private later(callback: () => void, delay = 0): void {
    const timer = setTimeout(() => { this.timers.delete(timer); callback(); }, delay);
    this.timers.add(timer);
  }

  loadPath(): void {
    this.isLoading = true;
    this.loadError = '';
    this.learningService.getPath()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.userStatus = data.user_status;
          this.units = data.units;
          this.chests = data.chests || [];
          this.realms = PATH_REALMS.map(realm => ({
            ...realm,
            units: data.units.filter(unit => Math.ceil(unit.unit_number / 5) === realm.number),
            chest: this.chests.find(chest => chest.kind === 'realm' && chest.realm_number === realm.number),
          })).filter(realm => realm.units.length > 0);
          this.currentLevelId = this.findCurrentLevel(data.units);
          this.currentUnitNumber = data.units.find(unit => unit.levels.some(level => level.id === this.currentLevelId))?.unit_number ?? null;
          this.visibleRealm = Math.max(0, this.realms.findIndex(realm => realm.units.some(unit => unit.unit_number === this.currentUnitNumber)));
          this.buildTrails(data.units);
          this.isLoading = false;
          this.cdr.markForCheck();
          this.scrollToCurrent();
        },
        error: (err) => {
          this.loadError = err.status === 401 ? 'Inicia sesión para continuar tu aventura.' : 'No pudimos cargar La Senda. Revisa tu conexión y vuelve a intentarlo.';
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private findCurrentLevel(units: LearningUnit[]): string | null {
    for (const unit of units) {
      const next = unit.levels.find(level => level.is_unlocked && !level.is_completed);
      if (next) return next.id;
    }
    return null;
  }

  /** El camino se ilumina hasta la última etapa abierta de cada unidad, o entero si ya la terminaste. */
  private buildTrails(units: LearningUnit[]): void {
    this.trails = new Map(units.map(unit => {
      const complete = unit.levels.length > 0 && unit.levels.every(level => level.is_completed);
      const furthest = unit.levels.reduce((last, level, index) => level.is_unlocked ? index : last, -1);
      return [unit.unit_number, { furthest, complete }];
    }));
    const levels = units.flatMap(unit => unit.levels);
    this.totalLevels = levels.length;
    this.completedLevels = levels.filter(level => level.is_completed).length;
  }

  // ── Llegar a un lugar del mapa ────────────────────────────────────

  /** Un enlace a una recompensa tiene prioridad sobre el retorno al nivel actual. */
  private scrollToCurrent(): void {
    const chest = this.chests.find(item => item.code === this.queryChest);
    const unit = this.units.find(item => String(item.unit_number) === this.queryUnit);
    const query = chest ? `chest-${chest.code}` : unit ? `unit-${unit.unit_number}` : '';
    if (query && query !== this.focusedQuery) {
      this.focusedQuery = query;
      this.later(() => {
        const target = this.element.nativeElement.querySelector<HTMLElement>(`[id="${query}"]`);
        if (this.horizontal) target?.scrollIntoView({ inline: chest ? 'center' : 'start', block: 'nearest', behavior: 'auto' });
        else target?.scrollIntoView({ block: chest ? 'center' : 'start', behavior: 'auto' });
        if (chest) target?.focus({ preventScroll: true });
        this.measureWorld();
      });
      return;
    }
    if (query || this.scrolledToCurrent || !this.currentLevelId) { this.later(() => this.measureWorld()); return; }
    this.scrolledToCurrent = true;
    this.later(() => {
      // Al empezar la aventura se conserva la presentación del primer reino.
      if (this.units[0]?.levels[0]?.id !== this.currentLevelId) {
        const node = this.currentNode();
        if (this.horizontal) this.glideTo(node, false);
        else node?.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
      this.measureWorld();
    });
  }

  private currentNode(): HTMLElement | null {
    return this.element.nativeElement.querySelector<HTMLElement>(`[data-level-id="${this.currentLevelId}"]`);
  }

  /** «Mi siguiente etapa»: la cámara viaja hasta tu etapa, el nodo se ilumina y Maguito da un saltito. */
  returnToCurrent(): void {
    const target = this.currentNode();
    if (!target) return;
    const smooth = !this.reducedMotion;
    if (this.horizontal) this.glideTo(target, smooth);
    else target.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
    target.focus({ preventScroll: true });
    this.afterScroll(() => this.ping(target));
  }

  private glideTo(target: HTMLElement | null, smooth: boolean): void {
    const scroller = this.scrollerRef?.nativeElement;
    if (!target || !scroller) return;
    this.wheelTarget = null;
    const box = target.getBoundingClientRect();
    const frame = scroller.getBoundingClientRect();
    const left = scroller.scrollLeft + box.left - frame.left - (scroller.clientWidth - box.width) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  }

  /** Espera a que termine el desplazamiento (scrollend, o un tope de tiempo donde no exista). */
  private afterScroll(callback: () => void): void {
    const source: EventTarget = this.horizontal && this.scrollerRef ? this.scrollerRef.nativeElement : window;
    let done = false;
    const finish = () => { if (done) return; done = true; source.removeEventListener('scrollend', finish); callback(); };
    if ('onscrollend' in window) source.addEventListener('scrollend', finish, { once: true });
    this.later(finish, this.reducedMotion ? 30 : 'onscrollend' in window ? 1400 : 650);
  }

  private ping(target: HTMLElement): void {
    const row = target.closest<HTMLElement>('.node-row');
    if (!row) return;
    row.classList.remove('is-pinged');
    void row.offsetWidth;
    row.classList.add('is-pinged');
    this.later(() => row.classList.remove('is-pinged'), 1100);
  }

  goToRealm(realm: PathRealm): void {
    const target = this.element.nativeElement.querySelector<HTMLElement>(`[id="realm-${realm.number}"]`);
    const smooth = !this.reducedMotion;
    if (this.horizontal) {
      const scroller = this.scrollerRef?.nativeElement;
      const section = target?.closest<HTMLElement>('.realm');
      if (scroller && section) { this.wheelTarget = null; scroller.scrollTo({ left: section.offsetLeft, behavior: smooth ? 'smooth' : 'auto' }); }
    } else {
      target?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    }
    target?.focus({ preventScroll: true });
  }

  /** Las flechas laterales avanzan o retroceden casi una pantalla. */
  pageWorld(direction: 1 | -1): void {
    const scroller = this.scrollerRef?.nativeElement;
    if (!scroller) return;
    this.wheelTarget = null;
    scroller.scrollBy({ left: direction * scroller.clientWidth * 0.8, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }

  // ── Gestos del mapa de lado ───────────────────────────────────────

  private bindScroller(scroller: HTMLElement): void {
    this.boundScroller = scroller;
    this.zone.runOutsideAngular(() => {
      scroller.addEventListener('scroll', this.onWorldScroll, { passive: true });
      scroller.addEventListener('wheel', this.onWheel, { passive: false });
      scroller.addEventListener('pointerdown', this.onPointerDown);
      scroller.addEventListener('pointermove', this.onPointerMove);
      scroller.addEventListener('pointerup', this.onPointerUp);
      scroller.addEventListener('pointercancel', this.onPointerUp);
      scroller.addEventListener('click', this.onClickCapture, true);
      if (typeof ResizeObserver !== 'undefined' && this.trackRef) {
        this.trackObserver = new ResizeObserver(() => this.measureWorld());
        this.trackObserver.observe(this.trackRef.nativeElement);
        this.trackObserver.observe(scroller);
      }
    });
    // Medir fuera de este ciclo de detección de cambios: el camino puede cambiar de forma al medirse.
    this.later(() => this.measureWorld());
  }

  private unbindScroller(): void {
    const scroller = this.boundScroller;
    this.trackObserver?.disconnect();
    this.trackObserver = undefined;
    this.boundScroller = null;
    if (!scroller) return;
    scroller.removeEventListener('scroll', this.onWorldScroll);
    scroller.removeEventListener('wheel', this.onWheel);
    scroller.removeEventListener('pointerdown', this.onPointerDown);
    scroller.removeEventListener('pointermove', this.onPointerMove);
    scroller.removeEventListener('pointerup', this.onPointerUp);
    scroller.removeEventListener('pointercancel', this.onPointerUp);
    scroller.removeEventListener('click', this.onClickCapture, true);
  }

  /** La rueda vertical mueve el mapa hacia los lados, con un deslizamiento corto entre muescas. */
  readonly onWheel = (event: WheelEvent): void => {
    const scroller = this.scrollerRef?.nativeElement;
    if (!this.horizontal || !scroller || event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? scroller.clientWidth : 1;
    const max = scroller.scrollWidth - scroller.clientWidth;
    const base = this.wheelTarget ?? scroller.scrollLeft;
    const next = Math.min(max, Math.max(0, base + event.deltaY * unit));
    if (next === base) return;
    event.preventDefault();
    if (this.reducedMotion) { scroller.scrollLeft = next; return; }
    this.wheelTarget = next;
    if (!this.wheelFrame) this.wheelFrame = requestAnimationFrame(this.wheelStep);
  };

  /** Se acerca al destino con un decaimiento por tiempo (~70 ms): se siente igual a 30, 60 o 144 cuadros. */
  private readonly wheelStep = (now: number): void => {
    const scroller = this.scrollerRef?.nativeElement;
    const target = this.wheelTarget;
    if (!scroller || target === null) { this.wheelFrame = 0; this.wheelLast = 0; return; }
    const distance = target - scroller.scrollLeft;
    if (Math.abs(distance) < 1.5) { scroller.scrollLeft = target; this.wheelTarget = null; this.wheelFrame = 0; this.wheelLast = 0; return; }
    const elapsed = this.wheelLast ? Math.min(64, now - this.wheelLast) : 16;
    this.wheelLast = now;
    scroller.scrollLeft += Math.sign(distance) * Math.max(1.5, Math.abs(distance) * (1 - Math.exp(-elapsed / 70)));
    this.wheelFrame = requestAnimationFrame(this.wheelStep);
  };

  /** Arrastrar con el mouse mueve el mapa; si hubo arrastre, el clic final no abre nada. */
  private readonly onPointerDown = (event: PointerEvent): void => {
    const scroller = this.scrollerRef?.nativeElement;
    if (!this.horizontal || !scroller || event.pointerType !== 'mouse' || event.button !== 0) return;
    this.drag = { x: event.clientX, left: scroller.scrollLeft, moved: false, id: event.pointerId };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const scroller = this.scrollerRef?.nativeElement;
    const drag = this.drag;
    if (!scroller || !drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true;
      this.wheelTarget = null;
      scroller.setPointerCapture(event.pointerId);
      scroller.classList.add('is-panning');
    }
    scroller.scrollLeft = drag.left - dx;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const scroller = this.scrollerRef?.nativeElement;
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    this.drag = null;
    if (!drag.moved || !scroller) return;
    this.suppressClick = true;
    setTimeout(() => { this.suppressClick = false; });
    if (scroller.hasPointerCapture(event.pointerId)) scroller.releasePointerCapture(event.pointerId);
    scroller.classList.remove('is-panning');
  };

  private readonly onClickCapture = (event: MouseEvent): void => {
    if (!this.suppressClick) return;
    this.suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  // ── Mini-mapa: lente, Maguito y reino visible ─────────────────────

  private readonly onWorldScroll = (): void => { if (this.horizontal) this.scheduleView(); };
  private readonly onWindowScroll = (): void => { if (!this.horizontal) this.scheduleView(); };

  private scheduleView(): void {
    if (!this.viewFrame) this.viewFrame = requestAnimationFrame(() => { this.viewFrame = 0; this.updateView(); });
  }

  /** Mide dónde empieza y termina cada reino en el mundo; el mini-mapa reparte un sexto a cada uno. */
  private measureWorld(): void {
    const track = this.trackRef?.nativeElement;
    if (!track) return;
    this.updateShape();
    const sections = Array.from(track.querySelectorAll<HTMLElement>(':scope > .realm'));
    const trackTop = track.getBoundingClientRect().top + window.scrollY;
    this.realmBounds = sections.map(section => this.horizontal
      ? { start: section.offsetLeft, end: section.offsetLeft + section.offsetWidth }
      : { start: section.getBoundingClientRect().top + window.scrollY - trackTop, end: section.getBoundingClientRect().bottom + window.scrollY - trackTop });
    const node = this.currentNode();
    if (node) {
      const box = node.getBoundingClientRect();
      const scroller = this.scrollerRef?.nativeElement;
      this.markerAt = this.horizontal && scroller
        ? scroller.scrollLeft + box.left - scroller.getBoundingClientRect().left + box.width / 2
        : box.top + window.scrollY - trackTop + box.height / 2;
    }
    this.updateView();
  }

  /** Convierte una posición del mundo a píxeles del riel: cada reino cae sobre su propio segmento. */
  private railPosition(position: number, segments: HTMLElement[]): number {
    const bounds = this.realmBounds;
    if (!bounds.length || segments.length !== bounds.length) return 0;
    for (let index = 0; index < bounds.length; index++) {
      const { start, end } = bounds[index];
      if (position < end || index === bounds.length - 1) {
        const local = Math.min(1, Math.max(0, (position - start) / Math.max(1, end - start)));
        const segment = segments[index];
        return segment.offsetLeft + local * segment.offsetWidth;
      }
    }
    return 0;
  }

  private updateView(): void {
    const rail = this.railRef?.nativeElement;
    const lens = this.lensRef?.nativeElement;
    const track = this.trackRef?.nativeElement;
    if (!rail || !lens || !track || !this.realmBounds.length) return;
    let start: number, size: number;
    const scroller = this.scrollerRef?.nativeElement;
    if (this.horizontal && scroller) {
      start = scroller.scrollLeft;
      size = scroller.clientWidth;
      this.updateArrows(scroller);
    } else {
      start = window.scrollY - (track.getBoundingClientRect().top + window.scrollY);
      size = window.innerHeight;
    }
    const segments = Array.from(rail.querySelectorAll<HTMLElement>('.minimap-segment'));
    const centre = start + size / 2;
    const visible = Math.max(0, this.realmBounds.findIndex(({ start: from, end }) => centre >= from && centre < end));
    // La lente enmarca el reino que estás viendo; la marca sobre la barra es la porción visible.
    const segment = segments[visible];
    if (segment) {
      lens.style.transform = `translateX(${(segment.offsetLeft - 5).toFixed(1)}px)`;
      lens.style.width = `${(segment.offsetWidth + 10).toFixed(1)}px`;
    }
    const view = this.viewRef?.nativeElement;
    if (view) {
      const from = this.railPosition(start, segments);
      const to = this.railPosition(start + size, segments);
      view.style.transform = `translateX(${from.toFixed(1)}px)`;
      view.style.width = `${Math.max(6, to - from).toFixed(1)}px`;
    }
    const marker = this.markerRef?.nativeElement;
    if (marker) marker.style.transform = `translateX(${this.railPosition(this.markerAt, segments).toFixed(1)}px)`;
    if (visible !== this.visibleRealm) {
      this.zone.run(() => { this.visibleRealm = visible; this.cdr.markForCheck(); });
      // En celular el segmento visible se ensancha: la lente se recoloca tras ese cambio.
      this.scheduleView();
    }
  }

  private updateArrows(scroller: HTMLElement): void {
    const max = scroller.scrollWidth - scroller.clientWidth - 2;
    const prev = this.prevArrowRef?.nativeElement;
    const next = this.nextArrowRef?.nativeElement;
    if (prev) prev.disabled = scroller.scrollLeft <= 2;
    if (next) next.disabled = scroller.scrollLeft >= max;
  }

  // ── Geometría y estado del camino ─────────────────────────────────

  readonly zoneRibbon = ZONE_RIBBON;
  readonly endRibbon = END_RIBBON;
  get visibleRealmName(): string { return this.realms[this.visibleRealm]?.short ?? ''; }
  get ribbon(): RibbonShape { return this.shape; }
  private get ribbonBase(): (typeof RIBBON)['h'] | (typeof RIBBON)['v'] { return this.horizontal ? RIBBON.h : RIBBON.v; }
  nodeX(index: number): number { return this.ribbonBase.x[index % 5]; }
  nodeY(index: number): number { return this.ribbonBase.y[index % 5]; }
  trail(unit: LearningUnit): UnitTrail { return this.trails.get(unit.unit_number) ?? NO_TRAIL; }
  /** El tramo dorado de la unidad: entero si la terminaste, hasta tu etapa si estás en ella, o nada si está cerrada. */
  litPath(unit: LearningUnit): string | null {
    const { furthest, complete } = this.trail(unit);
    if (complete) return this.shape.trail;
    return furthest < 0 ? null : this.shape.litTo[Math.min(furthest, this.shape.litTo.length - 1)];
  }

  /** Mientras no se mide la pista, el camino usa su tamaño base (con sus paradas ya medidas). */
  private resetShape(): void {
    const base = this.ribbonBase;
    this.shape = { viewBox: `0 0 ${base.width} ${base.height}`, trail: base.trail, branch: base.branch, litTo: litPrefixes(base.trail) };
    this.shapeKey = '';
  }

  /** Traza el camino al tamaño real de la pista: alto del mapa de lado, o ancho de la pista vertical. */
  private updateShape(): void {
    const base = this.ribbonBase;
    let width: number = base.width, height: number = base.height;
    if (this.horizontal) {
      height = this.scrollerRef?.nativeElement.clientHeight || height;
    } else {
      width = this.element.nativeElement.querySelector<HTMLElement>('.unit-path-track')?.clientWidth || width;
    }
    const key = `${this.horizontal ? 'h' : 'v'}:${Math.round(width)}x${Math.round(height)}`;
    if (key === this.shapeKey) return;
    this.shapeKey = key;
    this.shape = buildShape(base, Math.round(width), Math.round(height));
    this.zone.run(() => this.cdr.markForCheck());
  }
  unitChest(unit: LearningUnit): PathChest | undefined { return this.chests.find(chest => chest.kind === 'unit' && chest.unit_number === unit.unit_number); }
  realmProgress(realm: PathRealm): number { return Math.round(realm.units.reduce((sum, unit) => sum + unit.progress_percentage, 0) / Math.max(realm.units.length, 1)); }
  realmState(realm: PathRealm): RealmState {
    if (this.realmProgress(realm) >= 100) return 'done';
    if (realm.units.some(unit => unit.unit_number === this.currentUnitNumber)) return 'current';
    return realm.units[0]?.is_locked ? 'locked' : 'open';
  }
  realmReached(realm: PathRealm): boolean { return !realm.units[0]?.is_locked; }
  chestState(chest: PathChest): string { return { locked: 'Por descubrir', available: 'Abrir cofre', claimed: 'Recogido' }[chest.state]; }
  /** Las lecturas se cuentan solas (1, 2, 3): la sala y el castillo no dejan un hueco en la numeración. */
  levelLabel(level: LearningLevel, unit?: LearningUnit): string {
    if (level.is_exam) return 'Castillo de la unidad';
    if (level.is_chest) return 'Sala de minijuegos';
    const reading = unit ? unit.levels.filter(item => !item.is_exam && !item.is_chest && item.order <= level.order).length : level.level_number;
    return `Lectura ${reading}`;
  }

  get rewardPreview(): NonNullable<LearningLevel['reward_preview']> | null {
    const level = this.selectedLevel;
    if (!level) return null;
    return level.reward_preview || {
      xp: level.is_completed ? 5 : level.xp_reward,
      ink: level.is_completed ? 0 : Math.min(level.ink_reward, 10),
      perfect_bonus_xp: level.is_completed ? 0 : 10,
      perfect_bonus_ink: level.is_completed ? 0 : 3,
      is_practice: level.is_completed,
    };
  }

  get chestOutfit(): MaguitoOutfit | null {
    const wear = parseWear(this.selectedChest?.item?.value);
    return wear ? { [wear.slot]: wear.variant } : null;
  }

  openChest(chest: PathChest): void {
    this.rememberFocus();
    this.selectedChest = chest;
    this.chestResult = null;
    this.chestError = '';
    this.focusDialog();
    this.cdr.markForCheck();
  }

  closeChest(): void {
    this.selectedChest = null;
    this.restoreFocus();
    this.cdr.markForCheck();
  }

  claimChest(): void {
    const chest = this.selectedChest;
    if (!chest || chest.state !== 'available' || this.claimingCodes.has(chest.code)) return;
    this.claimingCodes.add(chest.code);
    this.chestError = '';
    this.cdr.markForCheck();
    this.learningService.claimChest(chest.code).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.claimingCodes.delete(chest.code);
        if (!result.success) {
          this.chestError = 'El cofre sigue cerrado. Inténtalo de nuevo.';
          this.cdr.markForCheck();
          return;
        }
        this.chests = this.chests.map(item => item.code === chest.code ? result.chest : item);
        this.realms = this.realms.map(realm => realm.chest?.code === chest.code ? { ...realm, chest: result.chest } : realm);
        if (this.selectedChest?.code === chest.code) {
          this.selectedChest = result.chest;
          this.chestResult = result;
        }
        if (this.userStatus) this.userStatus = { ...this.userStatus, ink_balance: result.ink_balance };
        this.chatService.updateInkBalance(result.ink_balance);
        this.chatService.notifyProfileUpdate();
        this.cdr.markForCheck();
        this.focusDialog();
      },
      error: error => {
        this.claimingCodes.delete(chest.code);
        if (this.selectedChest?.code === chest.code) {
          this.chestError = error.status === 403 ? 'Aún te quedan etapas por superar. Completa el requisito del cofre.' : 'No se pudo confirmar la apertura. Inténtalo de nuevo; tu premio se entrega una sola vez.';
        }
        this.cdr.markForCheck();
      },
    });
  }

  seeChestWardrobe(): void {
    this.router.navigate(['/tavern'], { queryParams: { bazar: 'ropero' } });
  }

  private rememberFocus(): void { this.returnFocus = document.activeElement as HTMLElement | null; }
  private restoreFocus(): void { this.later(() => this.returnFocus?.isConnected && this.returnFocus.focus({ preventScroll: true })); }
  private focusDialog(): void {
    this.later(() => this.element.nativeElement.querySelector<HTMLElement>('[role="dialog"] .close-btn')?.focus());
  }

  @HostListener('document:keydown', ['$event']) onDialogKeydown(event: KeyboardEvent): void {
    const dialog = this.element.nativeElement.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.selectedChest) this.closeChest();
      else if (this.showLevelModal) this.closeLevelModal();
      else if (this.showSkipModal) this.closeSkipModal();
      else if (this.showStreakModal) this.closeStreakModal();
      else if (this.showHeartsModal) this.closeHeartsModal();
    } else if (event.key === 'Tab') {
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }

  onNodeClick(unit: LearningUnit, level: LearningLevel): void {
    if (!level.is_unlocked) {
      return;
    }
    this.rememberFocus();
    this.selectedUnit = unit;
    this.selectedLevel = level;
    this.showLevelModal = true;
    this.focusDialog();
    this.cdr.markForCheck();
  }

  startLevel(): void {
    if (!this.selectedLevel) return;
    if (this.userStatus && this.userStatus.hearts <= 0) {
      this.showLevelModal = false;
      this.openHeartsModal();
      return;
    }
    this.router.navigate(['/learn/play', this.selectedLevel.id]);
  }

  closeLevelModal(): void {
    this.showLevelModal = false;
    this.selectedLevel = null;
    this.restoreFocus();
    this.cdr.markForCheck();
  }

  openSkipModal(unit: LearningUnit): void {
    this.rememberFocus();
    this.skipUnit = unit;
    this.showSkipModal = true;
    this.focusDialog();
    this.cdr.markForCheck();
  }

  closeSkipModal(): void {
    this.showSkipModal = false;
    this.skipUnit = null;
    this.restoreFocus();
    this.cdr.markForCheck();
  }

  /** «la unidad 1», «las unidades 1 y 2» o «las unidades 1 a 6»: lo que se salta. */
  skippedLabel(target: LearningUnit): string {
    const numbers = this.units
      .filter(unit => unit.order < target.order && unit.progress_percentage < 100)
      .map(unit => unit.unit_number);
    if (numbers.length <= 1) return `la unidad ${numbers[0] ?? target.unit_number - 1}`;
    if (numbers.length === 2) return `las unidades ${numbers[0]} y ${numbers[1]}`;
    return `las unidades ${numbers[0]} a ${numbers[numbers.length - 1]}`;
  }

  startSkip(): void {
    if (!this.skipUnit) return;
    if (this.userStatus && this.userStatus.hearts <= 0) {
      this.closeSkipModal();
      this.openHeartsModal();
      return;
    }
    this.router.navigate(['/learn/skip', this.skipUnit.id]);
  }

  openStreakModal(): void {
    this.rememberFocus();
    this.learningService.getStreakStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.streakDetails = data;
        this.showStreakModal = true;
        this.focusDialog();
        this.cdr.markForCheck();
      });
  }

  closeStreakModal(): void {
    this.showStreakModal = false;
    this.restoreFocus();
    this.cdr.markForCheck();
  }

  repairStreak(): void {
    this.learningService.repairStreak()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.loadPath();
            this.openStreakModal();
          }
        }
      });
  }

  openHeartsModal(): void {
    this.rememberFocus();
    this.learningService.getHeartsStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.heartsDetails = data;
        this.showHeartsModal = true;
        this.focusDialog();
        this.cdr.markForCheck();
      });
  }

  closeHeartsModal(): void {
    this.showHeartsModal = false;
    this.restoreFocus();
    this.cdr.markForCheck();
  }

  refillHearts(): void {
    this.learningService.refillHearts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.openHeartsModal();
            this.loadPath();
          }
        }
      });
  }

  goToTavern(): void {
    this.router.navigate(['/tavern'], { queryParams: { bazar: 'racha' } });
  }

  trackByUnit(index: number, unit: LearningUnit): string {
    return unit.id || `${unit.unit_number}-${index}`;
  }

  trackByLevel(index: number, level: LearningLevel): string {
    return level.id || `${level.level_number}-${index}`;
  }
}
