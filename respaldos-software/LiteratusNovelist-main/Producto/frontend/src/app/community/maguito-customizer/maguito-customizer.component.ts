import {
  ChangeDetectionStrategy,
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
  MAGUITO_COLOR_PRESETS,
  MAGUITO_SWATCHES,
  MaguitoCustomColors,
  MaguitoPresetPalette,
} from '../../core/components/maguito/maguito-colors';
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

  @Input() initialColors?: Partial<MaguitoCustomColors> | null;
  @Input() compact = false;
  @Output() saved = new EventEmitter<MaguitoCustomColors>();
  @Output() canceled = new EventEmitter<void>();

  activeZone: CustomizerZone = 'presets';

  readonly presets: MaguitoPresetPalette[] = MAGUITO_COLOR_PRESETS;
  readonly swatches: string[] = MAGUITO_SWATCHES;

  currentColors: MaguitoCustomColors = { ...DEFAULT_MAGUITO_COLORS };
  isSaving = false;
  hasChanges = false;

  ngOnInit(): void {
    const active = this.initialColors || this.themeService.currentColors;
    this.currentColors = { ...DEFAULT_MAGUITO_COLORS, ...active };
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
    this.themeService.saveColors(this.currentColors);

    setTimeout(() => {
      this.isSaving = false;
      this.hasChanges = false;
      this.notification.success('¡La apariencia mágica de tu Maguito ha sido guardada!', 'Taller de Tintes');
      this.saved.emit(this.currentColors);
    }, 300);
  }

  cancel(): void {
    this.canceled.emit();
  }
}

