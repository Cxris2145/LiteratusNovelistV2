import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Subject } from 'rxjs';

import { swapTheme } from '../../core/utils/theme-swap.util';
import {
  BOOK_VIEW_MIGRATION_KEY, DEFAULT_READER_SETTINGS, HIGHLIGHT_COLOR_OPTIONS, READER_PRESETS, READER_SETTINGS_KEY, ReaderPresetId,
  ReaderSettings, differsFromDefaults, isPresetActive, migrateToBookView, presetPatch, readLegacyReaderSettings, sanitizeReaderSettings,
} from './reader-settings';

/**
 * Los ajustes de la hoja "Aa": se leen una vez, se guardan juntos en `reader-settings-v2` (antes
 * eran ~25 claves sueltas `reader-*`, que se migran la primera vez) y se vuelcan como variables
 * CSS --reader-* en <html>, que el lienzo y la hoja leen. Cada cambio avisa por `changes$` qué
 * ajustes cambiaron, para que el lector vuelva a maquetar o mueva la regla.
 *
 * Se provee en ReaderComponent: lo comparten el lector y sus hojas.
 */
@Injectable()
export class ReaderSettingsService {
  private readonly doc = inject(DOCUMENT);
  private state: ReaderSettings;
  private beforeReset: ReaderSettings | null = null;

  /** Ajustes que cambiaron en cada actualización. */
  readonly changes$ = new Subject<(keyof ReaderSettings)[]>();
  /** Hay algo distinto de fábrica (habilita "Restablecer"). Se calcula al cambiar, no en cada pasada. */
  hasCustom = false;
  /** Ajustes rápidos que coinciden con lo puesto. */
  activePresets: Record<ReaderPresetId, boolean> = { clasico: false, noche: false, enfoque: false, accesible: false };

  constructor() {
    this.state = this.load();
    this.recompute();
  }

  get value(): Readonly<ReaderSettings> {
    return this.state;
  }

  /**
   * Cambia uno o varios ajustes: los valida, los guarda y los aplica. Un cambio de tema hace un
   * fundido corto (swapTheme) en vez de que miles de palabras animen su color.
   * Activar el modo sin distracciones oculta también la línea de progreso, salvo que el mismo
   * cambio diga otra cosa (al deshacer "Restablecer" se vuelve exactamente a lo que había).
   */
  update(patch: Partial<ReaderSettings>): void {
    const next = sanitizeReaderSettings({ ...this.state, ...patch });
    if (patch.concentration && !this.state.concentration && !('hideProgress' in patch)) next.hideProgress = true;
    const changed = (Object.keys(next) as (keyof ReaderSettings)[]).filter(key => next[key] !== this.state[key]);
    if (!changed.length) return;
    const commit = () => {
      this.state = next;
      this.save();
      this.applyToDocument();
      this.recompute();
      this.changes$.next(changed);
    };
    if (changed.includes('theme')) swapTheme(commit);
    else commit();
  }

  /** "Restablecer": vuelve a fábrica y recuerda lo anterior para "Deshacer". */
  reset(): void {
    this.beforeReset = { ...this.state };
    this.update(DEFAULT_READER_SETTINGS);
  }

  undoReset(): void {
    if (this.beforeReset) this.update(this.beforeReset);
    this.beforeReset = null;
  }

  forgetReset(): void {
    this.beforeReset = null;
  }

  applyPreset(id: ReaderPresetId): void {
    this.update(presetPatch(id, this.state));
  }

  /** Variables CSS en <html> (ancestro de <app-reader>, así el ajuste en vivo llega a todo) y tema en <body>. */
  applyToDocument(): void {
    const s = this.state;
    const style = this.doc.documentElement.style;
    const renglon = Math.round(s.fontSize * s.lineHeight);
    style.setProperty('--font-size-reader', `${s.fontSize}px`);
    style.setProperty('--reader-font-size', `${s.fontSize}px`);
    style.setProperty('--reader-line-height', String(s.lineHeight));
    style.setProperty('--reader-renglon-height', `${renglon}px`);
    style.setProperty('--reader-measure', { narrow: '78ch', normal: '66ch', wide: '54ch' }[s.margins]);
    style.setProperty('--reader-page-margin', {
      narrow: 'clamp(18px, 3vw, 40px)', normal: 'clamp(28px, 5vw, 72px)', wide: 'clamp(42px, 8vw, 116px)',
    }[s.margins]);
    style.setProperty('--reader-align', s.textAlign);
    style.setProperty('--reader-para-indent', s.paraSpacing === 'tight' || s.textAlign === 'justify' ? '1.5em' : '0em');
    // Espacio entre párrafos en renglones enteros: la regla de lectura sigue calzando.
    style.setProperty('--reader-para-gap', { tight: '0px', normal: `${renglon}px`, relaxed: `${renglon * 2}px` }[s.paraSpacing]);
    style.setProperty('--reader-letter-spacing', `${s.letterSpacing}em`);
    style.setProperty('--reader-word-spacing', `${s.wordSpacing}em`);
    style.setProperty('--reader-dim-opacity', String(Math.round((1 - s.brightness) * 100) / 100));
    style.removeProperty('--reader-brightness');
    const hl = HIGHLIGHT_COLOR_OPTIONS.find(h => h.id === s.highlightColor);
    if (hl) style.setProperty('--reader-highlight-hex', hl.hex);

    const body = this.doc.body.classList;
    body.remove('theme-dark', 'theme-light', 'theme-sepia', 'theme-nocturno', 'theme-gris');
    body.add(`theme-${s.theme}`);
  }

  private recompute(): void {
    this.hasCustom = differsFromDefaults(this.state);
    for (const preset of READER_PRESETS) this.activePresets[preset.id] = isPresetActive(preset.id, this.state);
  }

  private load(): ReaderSettings {
    const storage = this.storage();
    const migrated = this.readFlag(storage, BOOK_VIEW_MIGRATION_KEY);
    try {
      const saved = storage?.getItem(READER_SETTINGS_KEY);
      if (saved) {
        let settings = sanitizeReaderSettings(JSON.parse(saved));
        // Una sola vez: "Páginas" y "Deslizar" (lo de fábrica de antes) pasan a la vista Libro.
        if (!migrated) settings = migrateToBookView(settings);
        this.state = settings;
        // También normaliza la versión v2 anterior: doublePage/readingWidth dejan de mandar.
        if (JSON.stringify(settings) !== saved) this.save();
        this.writeFlag(storage, BOOK_VIEW_MIGRATION_KEY);
        return settings;
      }
    } catch { /* guardado dañado: se parte de nuevo */ }
    this.writeFlag(storage, BOOK_VIEW_MIGRATION_KEY);
    // Primera vez con esta versión: se toman las claves sueltas de antes. Quedan donde están, por
    // si se vuelve a una versión anterior del lector; desde ahora manda la clave nueva.
    const legacy = storage ? readLegacyReaderSettings(key => storage.getItem(key)) : null;
    const settings = legacy ? sanitizeReaderSettings({ ...DEFAULT_READER_SETTINGS, ...legacy }) : { ...DEFAULT_READER_SETTINGS };
    this.state = settings;
    if (legacy) this.save();
    return settings;
  }

  private save(): void {
    try {
      this.storage()?.setItem(READER_SETTINGS_KEY, JSON.stringify(this.state));
    } catch { /* sin almacenamiento (modo privado): los ajustes duran esta visita */ }
  }

  private readFlag(storage: Storage | null, key: string): boolean {
    try {
      return storage?.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  private writeFlag(storage: Storage | null, key: string): void {
    try {
      storage?.setItem(key, '1');
    } catch { /* sin almacenamiento: la migración se repite en la próxima visita, sin daño */ }
  }

  private storage(): Storage | null {
    try {
      return this.doc.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
