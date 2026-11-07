import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges,
  Output, SimpleChanges, ViewChild, inject,
} from '@angular/core';

import { SharedModule } from '../../../shared/shared.module';
import { MAGUITO_BASIC_COLORS, MaguitoCustomColors, sameMaguitoColors, storedMaguitoColors } from '../maguito/maguito-colors';
import { MaguitoOutfit, OUTFIT_DEFAULTS } from '../maguito/maguito-outfit';
import { MaguitoComponent } from '../maguito/maguito.component';

interface ColorOption {
  id: string;
  name: string;
  colors: Partial<MaguitoCustomColors>;
}

const BASIC_OPTIONS: ColorOption[] = MAGUITO_BASIC_COLORS;

/**
 * Elegir el color del Maguito: uno grande que reacciona y una ficha por color, con radios
 * nativos (flechas del teclado y lector de pantalla sin código extra). No guarda nada:
 * emite el color elegido (null = clásico) y quien lo usa decide cuándo guardarlo.
 */
@Component({
  selector: 'app-maguito-color-picker',
  standalone: true,
  imports: [CommonModule, SharedModule],
  templateUrl: './maguito-color-picker.component.html',
  styleUrls: ['./maguito-color-picker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaguitoColorPickerComponent implements OnChanges {
  private static groups = 0;
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() value: Partial<MaguitoCustomColors> | null = null;
  /** Su ropa actual: se ve lo mismo que verán los demás. */
  @Input() outfit: MaguitoOutfit | null | undefined = null;
  /** Primera vez (al crear la cuenta): las fichas entran escalonadas y Maguito saluda. */
  @Input() entrance = false;
  @Output() valueChange = new EventEmitter<Partial<MaguitoCustomColors> | null>();

  @ViewChild('preview') private preview?: MaguitoComponent;
  @ViewChild('ring') private ring?: ElementRef<HTMLElement>;

  readonly groupName = `maguito-color-${++MaguitoColorPickerComponent.groups}`;
  options = BASIC_OPTIONS;
  selected = BASIC_OPTIONS[0];
  bursts: number[] = [];

  private choosingByPointer = false;
  private burstId = 0;
  private ringAnimation?: Animation;

  get wearsBoughtCape(): boolean {
    const cape = this.outfit?.cape;
    return !!cape && cape !== OUTFIT_DEFAULTS.cape;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !sameMaguitoColors(this.value, this.selected.colors)) this.selectValue();
  }

  /**
   * Con clic o toque Maguito reacciona; recorrer los colores con las flechas solo cruza el color.
   * Es un método a propósito: si la plantilla asignara `false` directamente, Angular lo tomaría
   * como un preventDefault y las flechas dejarían de mover la selección.
   */
  noteInput(byPointer: boolean): void {
    this.choosingByPointer = byPointer;
  }

  choose(option: ColorOption): void {
    if (option === this.selected) return;
    this.selected = option;
    this.valueChange.emit(storedMaguitoColors(option.colors));
    if (this.choosingByPointer) {
      this.preview?.play('poke');
      this.pulseRing();
    }
    this.choosingByPointer = false;
  }

  /** Al guardar: Maguito salta contento y suelta chispas de su nuevo color. */
  celebrate(): void {
    this.preview?.play('success');
    if (this.reducedMotion) return;
    this.bursts = [++this.burstId];
    this.cdr.markForCheck();
  }

  onBurstEnd(burst: number): void {
    this.bursts = this.bursts.filter(id => id !== burst);
  }

  trackOption(_: number, option: ColorOption): string {
    return option.id;
  }

  /** Una mezcla del Taller de Tintes no está en la lista: se ofrece aparte para no perderla. */
  private selectValue(): void {
    const basic = BASIC_OPTIONS.find(option => sameMaguitoColors(option.colors, this.value));
    if (basic) {
      this.selected = basic;
      return;
    }
    this.selected = { id: 'custom', name: 'Tu mezcla', colors: this.value || {} };
    this.options = [this.selected, ...BASIC_OPTIONS];
  }

  /** WAAPI y no keyframes: se puede elegir otro color a mitad de camino y el anillo se reinicia limpio. */
  private pulseRing(): void {
    const ring = this.ring?.nativeElement;
    if (!ring || this.reducedMotion || typeof ring.animate !== 'function') return;
    this.ringAnimation?.cancel();
    this.ringAnimation = ring.animate(
      [{ transform: 'scale(0.7)', opacity: 0.6 }, { transform: 'scale(1.25)', opacity: 0 }],
      { duration: 420, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }, // --ease-out de styles.css
    );
  }

  private get reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
