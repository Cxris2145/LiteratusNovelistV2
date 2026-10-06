import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input,
  NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { TavernTableScene } from './tavern-table.scene';
import { TavernTableAction, TavernTableAnchor } from './tavern-table.types';

/** Cuadros por segundo de la mesa: fluida mientras alguien interactúa, en reposo el resto del tiempo. */
const ACTIVE_FPS = 30;
const IDLE_FPS = 15;
/** Sin puntero, resaltado ni reacción durante este tiempo, la mesa pasa a reposo. */
const IDLE_AFTER_MS = 4000;

/** La escena se carga al abrir la taberna; WebGL no entra en el bundle inicial. */
@Component({
  selector: 'app-tavern-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <canvas #canvas aria-hidden="true"></canvas>
    <button *ngFor="let anchor of anchors" type="button" class="tt-object"
      [style.left.%]="anchor.x" [style.top.%]="anchor.y"
      [attr.aria-label]="labels[anchor.action]" (click)="activate(anchor.action)"
      (pointerenter)="highlight(anchor.action)" (pointerleave)="highlight(null)"
      (focus)="highlight(anchor.action)" (blur)="highlight(null)">
      <span>{{ labels[anchor.action] }}</span>
    </button>`,
  // El objeto 3D se eleva por sí solo al pasar; aquí solo se suma un charco de luz sobre la
  // madera y una etiqueta que sale del objeto. Nada de recuadros sobre la escena.
  styles: [`
    :host { display: block; aspect-ratio: 1000 / 360; --tt-ease: var(--ease-out, cubic-bezier(.23, 1, .32, 1)); }
    canvas { display: block; width: 100%; height: 100%; }
    .tt-object { position: absolute; translate: -50% -50%; width: 12%; min-width: 44px;
      height: 26%; min-height: 44px; padding: 0; border: 0; border-radius: 50%;
      background: transparent; color: #fff0cd; cursor: pointer; pointer-events: auto; }
    .tt-object::before { content: ''; position: absolute; left: -14%; right: -14%; bottom: -8%; height: 48%;
      border-radius: 50%; background: radial-gradient(closest-side, #ffc86a66, #ffc86a00);
      opacity: 0; transform: scale(.8); transition: opacity .2s ease, transform .28s var(--tt-ease); pointer-events: none; }
    .tt-object span { position: absolute; bottom: calc(100% + 6px); left: 50%; translate: -50% 0;
      width: max-content; max-width: 190px; padding: 6px 11px; border-radius: 9px; background: #251a13f2;
      border: 1px solid #bc8846; box-shadow: 0 6px 16px #0d080670; font: 600 .74rem/1.3 var(--font-ui);
      opacity: 0; transform: translateY(4px) scale(.96); transform-origin: 50% 100%;
      transition: opacity .15s ease, transform .18s var(--tt-ease); pointer-events: none; }
    .tt-object span::after { content: ''; position: absolute; top: 100%; left: 50%; width: 8px; height: 8px;
      translate: -50% -50%; rotate: 45deg; background: #251a13; border: solid #bc8846; border-width: 0 1px 1px 0; }
    .tt-object:focus-visible { outline: 2px solid #ffc062; outline-offset: 2px; }
    .tt-object:focus-visible::before { opacity: 1; transform: none; }
    .tt-object:focus-visible span { opacity: 1; transform: none; }
    @media (hover: hover) and (pointer: fine) {
      .tt-object:hover::before { opacity: 1; transform: none; }
      .tt-object:hover span { opacity: 1; transform: none; }
    }
    @container (max-width: 580px) { .tt-object { display: none; } }
    @media (prefers-reduced-motion: reduce) {
      .tt-object span, .tt-object::before { transition: opacity .15s ease; transform: none; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TavernTableComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas', { static: true }) private canvas!: ElementRef<HTMLCanvasElement>;
  @Input() toasting = false;
  @Input() reaction = '';
  @Input() reactionTick = 0;
  @Input() hoverAction: TavernTableAction | null = null;
  @Output() readyChange = new EventEmitter<boolean>();
  @Output() action = new EventEmitter<TavernTableAction>();
  anchors: TavernTableAnchor[] = [];
  readonly labels: Record<TavernTableAction, string> = {
    book: 'Compartir una lectura',
    invite: 'Invitar y brindar',
    rewards: 'Mis recompensas semanales',
    cat: 'Acariciar al gato',
    potions: 'Poción de lectura',
    hourglass: 'Tiempo de lectura',
  };

  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private scene?: TavernTableScene;
  private resize?: ResizeObserver;
  private intersection?: IntersectionObserver;
  private motion = matchMedia('(prefers-reduced-motion: reduce)');
  private stage?: HTMLElement;
  private frame = 0;
  private lastFrame = 0;
  private elapsed = 0;
  private visible = true;
  private lastActivity = 0;
  private destroyed = false;
  private contextLost = false;

  async ngAfterViewInit(): Promise<void> {
    try {
      const { createTavernTable } = await import('./tavern-table.scene');
      if (this.destroyed) return;
      this.zone.runOutsideAngular(() => {
        this.scene = createTavernTable(this.canvas.nativeElement);
        this.scene.setToast(this.toasting);
        this.scene.setHover(this.hoverAction);
        this.resize = new ResizeObserver(() => {
          this.scene?.resize();
          this.scene?.render(this.elapsed, !this.motion.matches);
          this.updateAnchors();
        });
        this.resize.observe(this.canvas.nativeElement);
        this.intersection = new IntersectionObserver(entries => {
          this.visible = entries[0]?.isIntersecting ?? false;
          this.syncAnimation();
        });
        this.intersection.observe(this.canvas.nativeElement);
        this.stage = this.canvas.nativeElement.closest('.ts-stage') ?? undefined;
        this.stage?.addEventListener('pointermove', this.onPointer, { passive: true });
        this.stage?.addEventListener('pointerleave', this.onPointerLeave);
        document.addEventListener('visibilitychange', this.syncAnimation);
        this.motion.addEventListener('change', this.syncAnimation);
        this.canvas.nativeElement.addEventListener('webglcontextlost', this.onContextLost);
        this.canvas.nativeElement.addEventListener('webglcontextrestored', this.onContextRestored);
        this.scene.render(0, false);
        this.updateAnchors();
        this.syncAnimation();
      });
      this.readyChange.emit(true);
    } catch {
      // La mesa ilustrada sigue disponible si el equipo no puede usar WebGL.
      this.release();
      if (!this.destroyed) this.readyChange.emit(false);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['hoverAction'] || changes['reactionTick'] || changes['toasting']) this.wake();
    this.scene?.setToast(this.toasting);
    if (changes['hoverAction']) this.scene?.setHover(this.hoverAction);
    if (changes['reactionTick']) this.scene?.react(this.reaction, this.elapsed);
    if (this.motion.matches) this.scene?.render(this.elapsed, false);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.release();
  }

  activate(action: TavernTableAction): void {
    this.wake();
    this.scene?.react(action === 'book' ? '📖' : action === 'rewards' ? '✨' : '🍺', this.elapsed);
    this.action.emit(action);
  }

  highlight(action: TavernTableAction | null): void {
    this.wake();
    this.scene?.setHover(action);
  }

  private updateAnchors(): void {
    this.zone.run(() => {
      this.anchors = this.scene?.anchors() ?? [];
      this.cdr.markForCheck();
    });
  }

  private syncAnimation = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastFrame = 0;
    if (!this.scene || document.hidden || !this.visible || this.destroyed || this.contextLost) return;
    if (this.motion.matches) {
      this.scene.render(this.elapsed, false);
      return;
    }
    this.zone.runOutsideAngular(() => { this.frame = requestAnimationFrame(this.animate); });
  };

  private animate = (now: number): void => {
    if (!this.scene || this.destroyed) return;
    if (this.motion.matches || document.hidden || !this.visible || this.contextLost) {
      this.syncAnimation();
      return;
    }
    if (!this.lastFrame) this.lastFrame = now;
    const delta = now - this.lastFrame;
    // Las llamas y el vapor avanzan con `elapsed`: en reposo se ven al mismo ritmo, con menos cuadros.
    const fps = now - this.lastActivity < IDLE_AFTER_MS ? ACTIVE_FPS : IDLE_FPS;
    // 2 ms de holgura: en una pantalla de 60 Hz los cuadros llegan cada 16,7 ms y, sin ella,
    // 30 cps se volvían 20 (y 15, 12).
    if (delta >= 1000 / fps - 2) {
      this.elapsed += Math.min(delta, 100) / 1000;
      this.lastFrame = now;
      this.scene.render(this.elapsed, true);
    }
    this.frame = requestAnimationFrame(this.animate);
  };

  private onPointer = (event: PointerEvent): void => {
    if (this.motion.matches || event.pointerType !== 'mouse' || !this.stage) return;
    this.wake();
    const box = this.stage.getBoundingClientRect();
    this.scene?.setPointer((event.clientX - box.left) / box.width * 2 - 1, (event.clientY - box.top) / box.height * 2 - 1);
  };
  private onPointerLeave = (): void => { this.wake(); this.scene?.setPointer(0, 0); };
  /** Vuelve a 30 cps: el puntero se movió, algo se resaltó o hubo una reacción. */
  private wake(): void { this.lastActivity = performance.now(); }
  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.anchors = [];
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.zone.run(() => this.readyChange.emit(false));
  };
  private onContextRestored = (): void => {
    this.contextLost = false;
    this.updateAnchors();
    this.zone.run(() => this.readyChange.emit(true));
    this.syncAnimation();
  };

  private release(): void {
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    this.intersection?.disconnect();
    this.stage?.removeEventListener('pointermove', this.onPointer);
    this.stage?.removeEventListener('pointerleave', this.onPointerLeave);
    document.removeEventListener('visibilitychange', this.syncAnimation);
    this.motion.removeEventListener('change', this.syncAnimation);
    this.canvas.nativeElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.nativeElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.scene?.dispose();
    this.scene = undefined;
  }
}
