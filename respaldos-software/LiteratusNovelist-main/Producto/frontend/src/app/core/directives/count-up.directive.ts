import { Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { prefersReducedMotion } from '../utils/motion.util';

/**
 * Anima una cifra desde lo que muestra hasta el nuevo valor escribiendo `textContent`
 * fuera de la zona de Angular: cada cuadro no dispara detección de cambios.
 * Es decorativa (márcala con aria-hidden) y el valor final debe estar en texto accesible al lado.
 */
@Directive({ selector: '[appCountUp]' })
export class CountUpDirective implements OnChanges, OnDestroy {
  @Input('appCountUp') value: number | null | undefined = 0;
  @Input() countUpDuration = 900;
  /** Muestra un "+N" / "−N" flotante cuando la cifra cambia. El host necesita un padre posicionado. */
  @Input() countUpDelta = false;

  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private displayed = 0;
  private target: number | null = null;
  private frame = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['value']) return;
    const target = Math.round(Number(this.value) || 0);
    const previous = this.target;
    this.target = target;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (prefersReducedMotion() || target === this.displayed) {
      this.render(target);
      return;
    }
    if (this.countUpDelta && previous !== null && previous !== target) this.float(target - previous);
    const from = this.displayed;
    const start = performance.now();
    const duration = this.countUpDuration;
    this.render(from);
    this.zone.runOutsideAngular(() => {
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        this.render(Math.round(from + (target - from) * eased));
        this.frame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  ngOnDestroy(): void { cancelAnimationFrame(this.frame); }

  private render(value: number): void {
    this.displayed = value;
    this.el.nativeElement.textContent = value.toLocaleString('es-CL');
  }

  private float(delta: number): void {
    const host = this.el.nativeElement;
    const parent = host.parentElement;
    if (!parent || typeof host.animate !== 'function') return;
    const tag = document.createElement('span');
    tag.setAttribute('aria-hidden', 'true');
    tag.textContent = (delta > 0 ? '+' : '−') + Math.abs(delta).toLocaleString('es-CL');
    Object.assign(tag.style, {
      position: 'absolute',
      left: `${host.offsetLeft + host.offsetWidth + 8}px`,
      top: `${host.offsetTop}px`,
      font: '700 0.95rem var(--font-ui)',
      color: delta > 0 ? 'var(--color-warning)' : 'var(--color-error)',
      pointerEvents: 'none',
      whiteSpace: 'nowrap'
    });
    parent.appendChild(tag);
    this.zone.runOutsideAngular(() => {
      tag.animate([
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(-4px)', offset: 0.25 },
        { opacity: 0, transform: 'translateY(-30px)' }
      ], { duration: 1500, easing: 'cubic-bezier(.16, 1, .3, 1)' }).finished.catch(() => undefined).then(() => tag.remove());
    });
  }
}
