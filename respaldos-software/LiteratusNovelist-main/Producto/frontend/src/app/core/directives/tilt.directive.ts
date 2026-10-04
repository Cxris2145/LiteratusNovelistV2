import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnDestroy, inject } from '@angular/core';
import { prefersReducedMotion } from '../utils/motion.util';

/**
 * Inclinación 3D que sigue al puntero. Solo escribe variables CSS (--rx, --ry, --gx, --gy)
 * una vez por cuadro y fuera de la zona de Angular; el CSS del componente decide cómo usarlas.
 * Se desactiva en pantallas táctiles y con movimiento reducido. Mientras inclina, el host
 * lleva la clase `is-tilting`.
 */
@Directive({ selector: '[appTilt]' })
export class TiltDirective implements AfterViewInit, OnDestroy {
  @Input() tiltMax = 6;

  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private frame = 0;
  private rect: DOMRect | null = null;
  private x = 0;
  private y = 0;
  private detach?: () => void;

  ngAfterViewInit(): void {
    if (prefersReducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const el = this.el.nativeElement;
    this.zone.runOutsideAngular(() => {
      const enter = () => { this.rect = el.getBoundingClientRect(); el.classList.add('is-tilting'); };
      const move = (event: PointerEvent) => {
        this.x = event.clientX;
        this.y = event.clientY;
        if (!this.rect) enter();
        if (!this.frame) this.frame = requestAnimationFrame(this.apply);
      };
      const leave = () => {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.rect = null;
        el.classList.remove('is-tilting');
        el.style.removeProperty('--rx');
        el.style.removeProperty('--ry');
      };
      el.addEventListener('pointerenter', enter);
      el.addEventListener('pointermove', move, { passive: true });
      el.addEventListener('pointerleave', leave);
      this.detach = () => {
        el.removeEventListener('pointerenter', enter);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerleave', leave);
      };
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.detach?.();
  }

  private apply = () => {
    this.frame = 0;
    const rect = this.rect;
    if (!rect) return;
    const px = Math.min(1, Math.max(0, (this.x - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (this.y - rect.top) / rect.height));
    const style = this.el.nativeElement.style;
    style.setProperty('--rx', `${((0.5 - py) * 2 * this.tiltMax).toFixed(2)}deg`);
    style.setProperty('--ry', `${((px - 0.5) * 2 * this.tiltMax).toFixed(2)}deg`);
    style.setProperty('--gx', `${Math.round(px * rect.width)}px`);
    style.setProperty('--gy', `${Math.round(py * rect.height)}px`);
  };
}
