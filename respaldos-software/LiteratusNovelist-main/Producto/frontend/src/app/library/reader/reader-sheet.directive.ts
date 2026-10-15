import { Directive, ElementRef, EventEmitter, NgZone, OnDestroy, OnInit, Output, inject } from '@angular/core';

/** Lo que hay que bajar la hoja (fracción de su alto) o la rapidez del gesto (px/ms) para cerrarla. */
const CLOSE_FRACTION = 0.3;
const CLOSE_VELOCITY = 0.5;
const SLIDE_MS = 200;

/**
 * Hoja inferior que se cierra arrastrándola hacia abajo, desde su asa o su cabecera
 * (los elementos con `data-sheet-grip`). Solo actúa cuando su CSS la deja como hoja inferior
 * (`--sheet-mode: bottom`, en el celular); en escritorio no hace nada. Los movimientos del dedo
 * van fuera de la zona de Angular: solo cerrar entra a ella.
 *
 *   <section rdSheet (rdSheetClose)="cerrar()"> <span class="sheet-grabber" data-sheet-grip></span> …
 */
@Directive({ selector: '[rdSheet]' })
export class ReaderSheetDirective implements OnInit, OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private drag: { id: number; startY: number; dy: number; lastY: number; lastT: number; velocity: number } | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  /** La hoja se bajó lo suficiente: quien la muestra la cierra. */
  @Output() readonly rdSheetClose = new EventEmitter<void>();

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      this.host.addEventListener('pointerdown', this.onDown);
      this.host.addEventListener('pointermove', this.onMove);
      this.host.addEventListener('pointerup', this.onUp);
      this.host.addEventListener('pointercancel', this.onCancel);
    });
  }

  ngOnDestroy(): void {
    this.host.removeEventListener('pointerdown', this.onDown);
    this.host.removeEventListener('pointermove', this.onMove);
    this.host.removeEventListener('pointerup', this.onUp);
    this.host.removeEventListener('pointercancel', this.onCancel);
    if (this.closeTimer) clearTimeout(this.closeTimer);
  }

  private isBottomSheet(): boolean {
    return getComputedStyle(this.host).getPropertyValue('--sheet-mode').trim() === 'bottom';
  }

  private readonly onDown = (event: PointerEvent) => {
    if (event.button > 0 || this.drag || this.closeTimer) return;
    const target = event.target as Element | null;
    const grip = target?.closest('[data-sheet-grip]');
    if (!grip || !this.host.contains(grip) || !this.isBottomSheet()) return;
    // Los botones de la cabecera (cerrar, restablecer) siguen funcionando con un toque.
    if (target?.closest('button, a, input, select, textarea')) return;
    this.drag = { id: event.pointerId, startY: event.clientY, dy: 0, lastY: event.clientY, lastT: Date.now(), velocity: 0 };
    try {
      this.host.setPointerCapture(event.pointerId); // el dedo puede salir de la hoja mientras la baja
    } catch {
      // Un puntero que el navegador ya soltó (o uno sintético): se sigue sin captura.
    }
    this.host.style.transition = 'none';
  };

  private readonly onMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    const now = Date.now(); // al milisegundo basta para un gesto (y en los tests se controla con tick)
    const dt = now - drag.lastT;
    if (dt > 0) drag.velocity = (event.clientY - drag.lastY) / dt;
    drag.lastY = event.clientY;
    drag.lastT = now;
    // Hacia arriba no se mueve: la hoja ya está entera a la vista.
    drag.dy = Math.max(0, event.clientY - drag.startY);
    this.host.style.translate = `0 ${drag.dy}px`;
  };

  private readonly onUp = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    this.drag = null;
    const height = this.host.getBoundingClientRect().height || 1;
    if (drag.dy > height * CLOSE_FRACTION || (drag.dy > 12 && drag.velocity > CLOSE_VELOCITY)) this.slideOut(height);
    else this.settle();
  };

  private readonly onCancel = (event: PointerEvent) => {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    this.drag = null;
    this.settle();
  };

  /** Vuelve a su lugar si no se bajó lo suficiente. */
  private settle(): void {
    this.host.style.transition = `translate ${SLIDE_MS}ms ease-out`;
    this.host.style.translate = '';
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.host.style.transition = '';
    }, SLIDE_MS);
  }

  /**
   * Termina de bajar y avisa. Antes de avisar se quita el desplazamiento sin transición: la hoja
   * que queda montada (el índice) pasa a su estado cerrado en el mismo cuadro, sin parpadeo.
   */
  private slideOut(height: number): void {
    this.host.style.transition = `translate ${SLIDE_MS}ms ease-in`;
    this.host.style.translate = `0 ${height}px`;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.host.style.transition = 'none';
      this.host.style.translate = '';
      this.zone.run(() => this.rdSheetClose.emit());
      requestAnimationFrame(() => (this.host.style.transition = ''));
    }, SLIDE_MS);
  }
}
