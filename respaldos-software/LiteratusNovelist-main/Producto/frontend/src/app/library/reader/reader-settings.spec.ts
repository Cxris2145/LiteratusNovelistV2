import { TestBed } from '@angular/core/testing';

import { ReaderSettingsService } from './reader-settings.service';
import {
  BOOK_VIEW_MIGRATION_KEY, DEFAULT_READER_SETTINGS, READER_SETTINGS_KEY, differsFromDefaults, isPresetActive, migrateToBookView,
  presetPatch, readLegacyReaderSettings, sanitizeReaderSettings,
} from './reader-settings';

describe('ajustes del lector', () => {
  describe('sanitizeReaderSettings', () => {
    it('completa lo que falta con los valores de fábrica', () => {
      expect(sanitizeReaderSettings({})).toEqual({ ...DEFAULT_READER_SETTINGS });
    });

    it('migra la vista y el ancho anteriores sin invertir la medida de lectura', () => {
      expect(sanitizeReaderSettings({ doublePage: false, readingWidth: 'narrow' })).toEqual(
        jasmine.objectContaining({ layoutMode: 'scroll', margins: 'wide', pageTurn: 'flip' }));
      expect(sanitizeReaderSettings({ doublePage: true }).layoutMode).toBe('book');
      expect(sanitizeReaderSettings({ doublePage: true, readingWidth: 'wide' }).margins).toBe('narrow');
      expect(sanitizeReaderSettings({ readingWidth: 'medium' }).margins).toBe('normal');
    });

    it('los ajustes nuevos mandan sobre los heredados y atenúan entre 60 y 100 %', () => {
      const s = sanitizeReaderSettings({ layoutMode: 'scroll', doublePage: true, margins: 'narrow', readingWidth: 'narrow', pageTurn: 'none', brightness: 0.6 });
      expect(s.layoutMode).toBe('scroll');
      expect(s.margins).toBe('narrow');
      expect(s.pageTurn).toBe('none');
      expect(s.brightness).toBe(0.6);
      expect(sanitizeReaderSettings({ brightness: 1.1 }).brightness).toBe(1);
      expect(sanitizeReaderSettings({ brightness: 0.59 }).brightness).toBe(1);
    });

    it('descarta valores inválidos y reencuadra la letra', () => {
      const s = sanitizeReaderSettings({
        fontSize: 12, theme: 'neon', lineHeight: 1.6, letterSpacing: 0.5, brightness: 2, focusMode: 'x', wpm: 9000,
      });
      expect(s.fontSize).toBe(14);
      expect(s.theme).toBe('light');
      expect(s.lineHeight).toBe(1.4);
      expect(s.letterSpacing).toBe(0);
      expect(s.brightness).toBe(1);
      expect(s.focusMode).toBe('off');
      expect(s.wpm).toBe(200);
    });
  });

  describe('migrateToBookView', () => {
    it('lleva lo de fábrica de antes (Páginas, Deslizar) a la vista Libro con la hoja', () => {
      const s = migrateToBookView({ ...DEFAULT_READER_SETTINGS, layoutMode: 'paged', pageTurn: 'slide' });
      expect(s.layoutMode).toBe('book');
      expect(s.pageTurn).toBe('flip');
    });

    it('respeta Desplazamiento y "Sin animación"', () => {
      const s = migrateToBookView({ ...DEFAULT_READER_SETTINGS, layoutMode: 'scroll', pageTurn: 'none' });
      expect(s.layoutMode).toBe('scroll');
      expect(s.pageTurn).toBe('none');
    });

    it('acepta las tres vistas y los tres pasos de página', () => {
      for (const layoutMode of ['book', 'paged', 'scroll'] as const) {
        expect(sanitizeReaderSettings({ layoutMode }).layoutMode).toBe(layoutMode);
      }
      for (const pageTurn of ['flip', 'slide', 'none'] as const) {
        expect(sanitizeReaderSettings({ pageTurn }).pageTurn).toBe(pageTurn);
      }
    });
  });

  describe('readLegacyReaderSettings', () => {
    it('devuelve null si no hay claves antiguas', () => {
      expect(readLegacyReaderSettings(() => null)).toBeNull();
    });

    it('lee las claves sueltas de antes con sus mismos criterios', () => {
      const old: Record<string, string> = {
        'reader-font-size': '22', 'reader-font-family': 'serif', 'reader-theme': 'sepia',
        'reader-double-page': 'false', 'reader-line-height': '1.75', 'reader-width': 'narrow',
        'reader-align': 'left', 'reader-para-spacing': 'normal', 'reader-letter-spacing': '0.02',
        'reader-word-spacing': '0.1', 'reader-brightness': '0.9', 'reader-high-contrast': 'true',
        'reader-focus-mode': 'sentence', 'reader-highlight-color': 'blue', 'reader-long-para-split': 'true',
        'reader-tap-to-scroll': 'true', 'reader-autoscroll-speed': '55', 'reader-wpm': '230',
        'reader-wpm-auto': 'false', 'reader-show-reading-time': 'false', 'reader-hide-progress': 'true',
        'reader-bionic-reading': 'true', 'reader-show-images': 'false',
      };
      const s = readLegacyReaderSettings(key => old[key] ?? null)!;
      expect(s).toEqual(jasmine.objectContaining({
        fontSize: 22, fontFamily: 'merriweather', theme: 'sepia', layoutMode: 'scroll', pageTurn: 'flip', lineHeight: 1.75,
        margins: 'wide', textAlign: 'left', paraSpacing: 'normal', letterSpacing: 0.02, wordSpacing: 0.1,
        brightness: 0.9, highContrast: true, focusMode: 'sentence', highlightColor: 'blue', longParaSplit: true,
        tapToScroll: true, autoScrollSpeed: 55, wpm: 230, wpmAuto: false, showReadingTime: false,
        hideProgress: true, bionic: true, sceneImages: false,
      }));
    });

    it('sin la clave de una opción conserva el valor de fábrica', () => {
      const s = readLegacyReaderSettings(key => key === 'reader-theme' ? 'dark' : null)!;
      expect(s.theme).toBe('dark');
      expect(s.layoutMode).toBe('book');
      expect(s.wpmAuto).toBeTrue();
      expect(s.sceneImages).toBeTrue();
    });
  });

  describe('ajustes rápidos', () => {
    it('cada uno queda marcado después de aplicarlo', () => {
      for (const id of ['clasico', 'noche', 'enfoque', 'accesible'] as const) {
        const applied = sanitizeReaderSettings({ ...DEFAULT_READER_SETTINGS, ...presetPatch(id, DEFAULT_READER_SETTINGS) });
        expect(isPresetActive(id, applied)).withContext(id).toBeTrue();
      }
    });

    it('"Accesible" no achica una letra ya grande', () => {
      expect(presetPatch('accesible', { ...DEFAULT_READER_SETTINGS, fontSize: 26 }).fontSize).toBe(26);
    });
  });

  it('con el ritmo automático, las palabras por minuto calibradas no cuentan como cambio', () => {
    expect(differsFromDefaults({ ...DEFAULT_READER_SETTINGS, wpm: 260 })).toBeFalse();
    expect(differsFromDefaults({ ...DEFAULT_READER_SETTINGS, wpm: 260, wpmAuto: false })).toBeTrue();
  });

  describe('ReaderSettingsService', () => {
    const legacyKeys = ['reader-theme', 'reader-font-size', 'reader-double-page'];
    const clean = () => [READER_SETTINGS_KEY, BOOK_VIEW_MIGRATION_KEY, ...legacyKeys].forEach(key => localStorage.removeItem(key));
    const create = () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [ReaderSettingsService] });
      return TestBed.inject(ReaderSettingsService);
    };

    beforeEach(clean);
    afterEach(clean);

    it('migra las claves antiguas a la clave nueva una sola vez', () => {
      localStorage.setItem('reader-theme', 'sepia');
      localStorage.setItem('reader-font-size', '24');
      localStorage.setItem('reader-double-page', 'false');
      const service = create();
      expect(service.value.theme).toBe('sepia');
      expect(service.value.fontSize).toBe(24);
      expect(service.value.layoutMode).toBe('scroll');
      expect(JSON.parse(localStorage.getItem(READER_SETTINGS_KEY)!).fontSize).toBe(24);

      // Desde ahora manda la clave nueva aunque las antiguas sigan ahí.
      localStorage.setItem('reader-font-size', '30');
      expect(create().value.fontSize).toBe(24);
    });

    it('pasa una sola vez de Páginas a la vista Libro', () => {
      localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify({ ...DEFAULT_READER_SETTINGS, layoutMode: 'paged', pageTurn: 'slide' }));
      const service = create();
      expect(service.value.layoutMode).toBe('book');
      expect(service.value.pageTurn).toBe('flip');
      expect(localStorage.getItem(BOOK_VIEW_MIGRATION_KEY)).toBe('1');

      // Quien después elige Páginas a propósito, la conserva.
      service.update({ layoutMode: 'paged' });
      expect(create().value.layoutMode).toBe('paged');
    });

    it('reescribe el v2 anterior con vista y márgenes nuevos', () => {
      localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify({ doublePage: false, readingWidth: 'wide', fontSize: 23, brightness: 1.1 }));
      const service = create();
      expect(service.value).toEqual(jasmine.objectContaining({ layoutMode: 'scroll', margins: 'narrow', fontSize: 23, brightness: 1 }));
      const saved = JSON.parse(localStorage.getItem(READER_SETTINGS_KEY)!);
      expect(saved.doublePage).toBeUndefined();
      expect(saved.readingWidth).toBeUndefined();
      expect(saved.layoutMode).toBe('scroll');
      expect(saved.margins).toBe('narrow');
      expect(create().value).toEqual(service.value);
    });

    it('aplica los márgenes a la medida y Atenuar a una capa sobre el papel', () => {
      const service = create();
      const style = document.documentElement.style;
      service.update({ margins: 'narrow', brightness: 0.6 });
      expect(style.getPropertyValue('--reader-measure')).toBe('78ch');
      expect(style.getPropertyValue('--reader-page-margin')).toBe('clamp(18px, 3vw, 40px)');
      expect(style.getPropertyValue('--reader-dim-opacity')).toBe('0.4');
      expect(style.getPropertyValue('--reader-brightness')).toBe('');
      service.update({ margins: 'wide', brightness: 1 });
      expect(style.getPropertyValue('--reader-measure')).toBe('54ch');
      expect(style.getPropertyValue('--reader-dim-opacity')).toBe('0');
    });

    it('guarda cada cambio, avisa qué cambió y aplica las variables CSS', () => {
      const service = create();
      const changes: string[][] = [];
      service.changes$.subscribe(keys => changes.push(keys));
      service.update({ fontSize: 24, lineHeight: 2 });
      expect(changes).toEqual([['fontSize', 'lineHeight']]);
      expect(document.documentElement.style.getPropertyValue('--reader-renglon-height')).toBe('48px');
      expect(create().value.lineHeight).toBe(2);
      service.update({ fontSize: 24 });
      expect(changes.length).toBe(1); // sin cambios, sin aviso
    });

    it('el modo sin distracciones oculta la línea de progreso', () => {
      const service = create();
      service.update({ concentration: true });
      expect(service.value.hideProgress).toBeTrue();
    });

    it('Restablecer vuelve a fábrica y Deshacer recupera todo, incluida la línea de progreso', () => {
      const service = create();
      service.update({ fontSize: 26, concentration: true, hideProgress: false, wpm: 300, wpmAuto: false });
      expect(service.hasCustom).toBeTrue();
      service.reset();
      expect(service.value).toEqual({ ...DEFAULT_READER_SETTINGS });
      expect(service.hasCustom).toBeFalse();
      service.undoReset();
      expect(service.value).toEqual(jasmine.objectContaining({ fontSize: 26, concentration: true, hideProgress: false, wpm: 300, wpmAuto: false }));
    });

    it('marca el ajuste rápido que coincide', () => {
      const service = create();
      expect(service.activePresets.clasico).toBeTrue();
      service.applyPreset('enfoque');
      expect(service.activePresets.enfoque).toBeTrue();
      expect(service.value.ruler).toBeTrue();
      expect(service.activePresets.clasico).toBeFalse();
    });
  });
});
