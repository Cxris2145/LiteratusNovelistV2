import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, NgZone, OnChanges, ViewChild, inject } from '@angular/core';
import { prefersReducedMotion } from '../../../core/utils/motion.util';

/** Tintero del hero de la Taberna: el nivel del líquido refleja el saldo real de Tinta. */
@Component({
  selector: 'app-inkwell',
  templateUrl: './inkwell.component.html',
  styleUrls: ['./inkwell.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InkwellComponent implements OnChanges, AfterViewInit {
  @Input() balance = 0;
  @Input() anonymous = false;
  /** Enciende el "+N" flotante; el padre lo activa después de la primera carga del saldo. */
  @Input() showDelta = false;

  @ViewChild('bottle', { static: true }) private bottle!: ElementRef<HTMLElement>;
  @ViewChild('splash', { static: true }) private splashRing!: ElementRef<HTMLElement>;

  readonly motes = [0, 1, 2, 3, 4, 5];
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private ready = false;

  /** Escala logarítmica: 20 Tinta ya se notan y 5.000 llenan el tintero. */
  get level(): number {
    if (this.anonymous) return 0.5;
    const balance = Math.max(0, Number(this.balance) || 0);
    if (!balance) return 0.04;
    return Math.min(1, Math.max(0.1, Math.log10(balance + 1) / Math.log10(5001)));
  }

  format(value: number): string { return Number(value || 0).toLocaleString('es-CL'); }

  ngOnChanges(): void { if (this.ready) this.applyLevel(); }

  ngAfterViewInit(): void {
    // Arranca vacío y se llena dos cuadros después, para que se vea subir la tinta.
    this.host.nativeElement.style.setProperty('--level', '0');
    this.zone.runOutsideAngular(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      this.ready = true;
      this.applyLevel();
    })));
  }

  /** Elemento al que apuntan las gotas que vuelan hacia el tintero. */
  target(): HTMLElement { return this.bottle.nativeElement; }

  splash(): void {
    if (prefersReducedMotion()) return;
    this.zone.runOutsideAngular(() => {
      this.splashRing.nativeElement.animate(
        [{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }],
        { duration: 750, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      this.bottle.nativeElement.animate(
        [{ transform: 'none' }, { transform: 'translateY(3px) scaleY(.98)' }, { transform: 'none' }],
        { duration: 420, easing: 'ease-out' });
    });
  }

  private applyLevel(): void { this.host.nativeElement.style.setProperty('--level', this.level.toFixed(3)); }
}
