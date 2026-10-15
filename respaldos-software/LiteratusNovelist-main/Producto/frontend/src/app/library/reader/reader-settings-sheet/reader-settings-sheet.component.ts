import { Component, OnDestroy, inject } from '@angular/core';

import { ReaderComponent } from '../reader.component';
import { ReaderSettingsService } from '../reader-settings.service';
import {
  DEFAULT_FONT_SIZE, FONT_GROUPS, FONT_MAX, FONT_MIN, FONT_OPTIONS, HIGHLIGHT_COLOR_OPTIONS, LINE_HEIGHT_OPTIONS,
  READER_PRESETS, ReaderSettings, SettingsTab, THEME_OPTIONS,
} from '../reader-settings';

/**
 * Hoja "Aa" del lector: pestañas Texto / Apariencia / Lectura asistida, muestra en vivo fija
 * arriba (la hoja tapa el libro en el celular), ajustes rápidos y "Restablecer" con "Deshacer".
 * Los ajustes van por ReaderSettingsService; lo que corre en el lector (avance automático,
 * temporizador de pausas, pantalla completa) y la pestaña abierta los lleva ReaderComponent.
 */
@Component({
  selector: 'app-reader-settings-sheet',
  templateUrl: './reader-settings-sheet.component.html',
  styleUrl: './reader-settings-sheet.component.css',
})
export class ReaderSettingsSheetComponent implements OnDestroy {
  readonly reader = inject(ReaderComponent);
  readonly settings = inject(ReaderSettingsService);

  readonly FONT_MIN = FONT_MIN;
  readonly FONT_MAX = FONT_MAX;
  readonly DEFAULT_FONT_SIZE = DEFAULT_FONT_SIZE;
  readonly fontGroups = FONT_GROUPS;
  readonly themeOptions = THEME_OPTIONS;
  readonly lineHeightOptions = LINE_HEIGHT_OPTIONS;
  readonly highlightColorOptions = HIGHLIGHT_COLOR_OPTIONS;
  readonly readerPresets = READER_PRESETS;
  readonly settingsTabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'texto', label: 'Texto', icon: 'text_fields' },
    { id: 'apariencia', label: 'Apariencia', icon: 'palette' },
    { id: 'enfoque', label: 'Lectura asistida', icon: 'psychology' },
  ];

  /** Aviso de "Restablecer" con su "Deshacer" (8 s). */
  resetNotice = false;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  /** Lo que corría en el lector antes de restablecer (avance automático, pausas), para "Deshacer". */
  private runningBeforeReset: { autoScroll: boolean; sessionMinutes: number } | null = null;

  trackFont = (_: number, f: { id: string }) => f.id;
  trackGroup = (_: number, g: { name: string }) => g.name;

  get s(): Readonly<ReaderSettings> {
    return this.settings.value;
  }

  get hasCustom(): boolean {
    return this.settings.hasCustom || this.reader.autoScrollActive || this.reader.sessionTimerMinutes > 0;
  }

  set(patch: Partial<ReaderSettings>): void {
    this.settings.update(patch);
  }

  changeFontSize(delta: number): void {
    this.set({ fontSize: this.s.fontSize + delta });
  }

  resetFontSize(): void {
    this.set({ fontSize: DEFAULT_FONT_SIZE });
  }

  setTab(tab: SettingsTab): void {
    this.reader.settingsTab = tab;
  }

  /** Flechas, Inicio y Fin recorren las pestañas (patrón de pestañas WAI-ARIA). */
  onSettingsTabKey(event: KeyboardEvent): void {
    const ids = this.settingsTabs.map(t => t.id);
    const current = ids.indexOf(this.reader.settingsTab);
    const target: Record<string, number> = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: ids.length - 1 };
    if (!(event.key in target)) return;
    event.preventDefault();
    this.setTab(ids[(target[event.key] + ids.length) % ids.length]);
    setTimeout(() => document.getElementById(`sheet-tab-${this.reader.settingsTab}`)?.focus());
  }

  // Textos de la hoja (valores legibles para la vista previa y los deslizadores)
  get currentFontLabel(): string {
    return FONT_OPTIONS.find(f => f.id === this.s.fontFamily)?.label || '';
  }
  get currentFontNote(): string {
    return FONT_OPTIONS.find(f => f.id === this.s.fontFamily)?.note || '';
  }
  get lineHeightLabel(): string {
    return (LINE_HEIGHT_OPTIONS.find(o => o.value === this.s.lineHeight)?.label || '').toLowerCase();
  }
  get letterSpacingLabel(): string {
    const v = this.s.letterSpacing;
    return v === 0 ? 'Normal' : `${v > 0 ? '+' : '−'}${Math.abs(v)} em`;
  }
  get wordSpacingLabel(): string {
    return this.s.wordSpacing === 0 ? 'Normal' : `+${this.s.wordSpacing} em`;
  }
  get brightnessLabel(): string {
    return `${Math.round(this.s.brightness * 100)} %`;
  }
  /** Parte llena del deslizador (la pinta el CSS con --fill). */
  rangeFill(value: number, min: number, max: number): string {
    return `${((value - min) / (max - min)) * 100}%`;
  }

  // ── Restablecer (con deshacer) ──
  reset(): void {
    this.runningBeforeReset = { autoScroll: this.reader.autoScrollActive, sessionMinutes: this.reader.sessionTimerMinutes };
    this.settings.reset();
    if (this.reader.autoScrollActive) this.reader.toggleAutoScroll(false);
    if (this.reader.sessionTimerMinutes) this.reader.setSessionTimer(0);
    this.resetNotice = true;
    this.clearResetTimer();
    this.resetTimer = setTimeout(() => this.forgetReset(), 8000);
  }

  undoReset(): void {
    this.settings.undoReset();
    const running = this.runningBeforeReset;
    if (running?.sessionMinutes) this.reader.setSessionTimer(running.sessionMinutes);
    if (running?.autoScroll) this.reader.toggleAutoScroll(true);
    this.runningBeforeReset = null;
    this.resetNotice = false;
    this.clearResetTimer();
  }

  ngOnDestroy(): void {
    this.forgetReset();
  }

  private forgetReset(): void {
    this.resetNotice = false;
    this.runningBeforeReset = null;
    this.settings.forgetReset();
    this.clearResetTimer();
  }

  private clearResetTimer(): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = null;
  }
}
