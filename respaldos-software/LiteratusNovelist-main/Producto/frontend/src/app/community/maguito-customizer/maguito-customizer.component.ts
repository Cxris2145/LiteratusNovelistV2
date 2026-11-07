import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_MAGUITO_COLORS,
  MAGUITO_BASIC_COLORS,
  MAGUITO_COLOR_PRESETS,
  MAGUITO_SWATCHES,
  MaguitoCustomColors,
  MaguitoPresetPalette,
} from '../../core/components/maguito/maguito-colors';
import { MaguitoOutfit, OUTFIT_DEFAULTS } from '../../core/components/maguito/maguito-outfit';
import { MaguitoThemeService } from '../../core/services/maguito-theme.service';
import { NotificationService } from '../../core/services/notification.service';
import { SharedModule } from '../../shared/shared.module';

export type CustomizerZone = 'presets' | 'cape' | 'hat' | 'body' | 'magic' | 'details';

@Component({
  selector: 'app-maguito-customizer',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedModule],
  templateUrl: './maguito-customizer.component.html',
  styleUrls: ['./maguito-customizer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaguitoCustomizerComponent implements OnInit {
  private themeService = inject(MaguitoThemeService);
  private notification = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);

  @Input() initialColors?: Partial<MaguitoCustomColors> | null;
  @Input() compact = false;
  /** Su ropa actual, para probarse los tintes sobre lo que lleva puesto. */
  @Input() outfit?: MaguitoOutfit | null;
  /** Emite el atuendo completo que quedó guardado en la cuenta. */
  @Output() saved = new EventEmitter<MaguitoOutfit>();
  @Output() canceled = new EventEmitter<void>();

  activeZone: CustomizerZone = 'presets';

  // El clásico ya abre la lista de colores básicos.
  readonly presets: MaguitoPresetPalette[] = [
    ...MAGUITO_BASIC_COLORS,
    ...MAGUITO_COLOR_PRESETS.filter(preset => preset.id !== 'classic'),
  ];
  readonly swatches: string[] = MAGUITO_SWATCHES;

  currentColors: MaguitoCustomColors = { ...DEFAULT_MAGUITO_COLORS };
  isSaving = false;
  hasChanges = false;

  ngOnInit(): void {
    const active = this.initialColors || this.themeService.currentColors;
    this.currentColors = { ...DEFAULT_MAGUITO_COLORS, ...active };
  }

  /** Una capa del Bazar trae su propia tela: la túnica teñida no se ve hasta quitársela. */
  get wearsBoughtCape(): boolean {
    const cape = this.outfit?.cape;
    return !!cape && cape !== OUTFIT_DEFAULTS.cape;
  }

  setZone(zone: CustomizerZone): void {
    this.activeZone = zone;
  }

  applyPreset(preset: MaguitoPresetPalette): void {
    this.currentColors = { ...preset.colors };
    this.hasChanges = true;
  }

  updateColor(prop: keyof MaguitoCustomColors, value: string): void {
    if (!value) return;
    this.currentColors = {
      ...this.currentColors,
      [prop]: value,
    };
    this.hasChanges = true;
  }

  randomize(): void {
    const pick = () => this.swatches[Math.floor(Math.random() * this.swatches.length)];
    this.currentColors = {
      capeA: pick(),
      capeB: pick(),
      capeTrim: pick(),
      hatA: pick(),
      hatB: pick(),
      hatBand: pick(),
      bodyA: pick(),
      bodyB: pick(),
      magicAura: pick(),
      magicSparks: pick(),
      metal: pick(),
    };
    this.hasChanges = true;
  }

  resetOriginal(): void {
    this.currentColors = { ...DEFAULT_MAGUITO_COLORS };
    this.hasChanges = true;
  }

  save(): void {
    this.isSaving = true;
    this.themeService.save(this.currentColors).subscribe({
      next: outfit => {
        this.isSaving = false;
        this.hasChanges = false;
        this.notification.success('Tus amigos ya ven a tu Maguito con estos colores.', 'Taller de Tintes');
        this.saved.emit(outfit);
        this.cdr.markForCheck();
      },
      error: () => {
        this.isSaving = false;
        this.notification.error('No se pudieron guardar los colores. Inténtalo de nuevo.', 'Taller de Tintes');
        this.cdr.markForCheck();
      },
    });
  }

  cancel(): void {
    this.canceled.emit();
  }
}

