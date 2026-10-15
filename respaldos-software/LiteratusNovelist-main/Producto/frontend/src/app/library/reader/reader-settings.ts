/**
 * Ajustes de la hoja "Aa" del lector: tipos, valores de fábrica, opciones que muestra la hoja y la
 * validación con que se leen. Funciones puras (sin Angular): las prueba reader-settings.spec.ts.
 */

export type ReaderTheme = 'dark' | 'light' | 'sepia' | 'nocturno' | 'gris';
export type ReaderFontId = 'times' | 'literata' | 'merriweather' | 'garamond' | 'georgia' | 'palatino'
  | 'outfit' | 'opensans' | 'atkinson' | 'lexend' | 'opendyslexic' | 'cinzel';
export type ReaderLayoutMode = 'paged' | 'scroll';
export type ReaderMargins = 'narrow' | 'normal' | 'wide';
export type ReaderPageTurn = 'slide' | 'none';
export type TextAlign = 'left' | 'justify';
/** Sin espacio entre párrafos (con sangría) | un renglón | dos renglones. */
export type ParaSpacing = 'tight' | 'normal' | 'relaxed';
export type HighlightColor = 'gold' | 'blue' | 'green' | 'pink';
/** Lectura asistida: atenúa todo salvo la palabra, la frase o el párrafo activos. */
export type FocusMode = 'off' | 'word' | 'sentence' | 'paragraph';
export type ReaderPresetId = 'clasico' | 'noche' | 'enfoque' | 'accesible';
/** Pestañas de la hoja "Aa". */
export type SettingsTab = 'texto' | 'apariencia' | 'enfoque';

/** Todo lo que se ajusta en la hoja "Aa" y se recuerda entre visitas. */
export interface ReaderSettings {
  fontSize: number;          // px, FONT_MIN–FONT_MAX
  fontFamily: ReaderFontId;
  theme: ReaderTheme;
  lineHeight: number;        // 1.4 (libro) | 1.5 | 1.75 | 2
  margins: ReaderMargins;
  textAlign: TextAlign;
  paraSpacing: ParaSpacing;
  letterSpacing: number;     // em, -0.01–0.08
  wordSpacing: number;       // em, 0–0.6
  brightness: number;        // Atenuar: 0.6–1, capa sobre el papel y la tinta
  highContrast: boolean;
  highlightColor: HighlightColor;
  layoutMode: ReaderLayoutMode;
  pageTurn: ReaderPageTurn;
  sceneImages: boolean;
  hideProgress: boolean;
  bionic: boolean;
  focusMode: FocusMode;
  ruler: boolean;
  concentration: boolean;
  longParaSplit: boolean;
  tapToScroll: boolean;
  autoScrollSpeed: number;   // px/s, 10–120
  wpm: number;               // palabras por minuto, 80–500
  wpmAuto: boolean;          // el ritmo se calibra solo con el avance real
  showReadingTime: boolean;
}

export const FONT_MIN = 14;
export const FONT_MAX = 32;
export const DEFAULT_FONT_SIZE = 20;

/** Cómo viene el lector de fábrica (lo que aplica "Restablecer"): el aspecto de un libro impreso. */
export const DEFAULT_READER_SETTINGS: Readonly<ReaderSettings> = {
  fontSize: DEFAULT_FONT_SIZE, fontFamily: 'times', theme: 'light', lineHeight: 1.4,
  margins: 'normal', textAlign: 'justify', paraSpacing: 'tight', letterSpacing: 0, wordSpacing: 0,
  brightness: 1, highContrast: false, highlightColor: 'gold', layoutMode: 'paged', pageTurn: 'slide', sceneImages: true,
  hideProgress: false, bionic: false, focusMode: 'off', ruler: false, concentration: false,
  longParaSplit: false, tapToScroll: false, autoScrollSpeed: 35, wpm: 200, wpmAuto: true,
  showReadingTime: true,
};

export const READER_SETTINGS_KEY = 'reader-settings-v2';

export interface FontOption { id: ReaderFontId; label: string; group: string; note?: string }

export const FONT_OPTIONS: readonly FontOption[] = [
  { id: 'times', label: 'Times', group: 'Clásicas', note: 'Times New Roman, la de los libros impresos' },
  { id: 'literata', label: 'Literata', group: 'Clásicas', note: 'Diseñada para leer libros en pantalla' },
  { id: 'merriweather', label: 'Merriweather', group: 'Clásicas' },
  { id: 'garamond', label: 'Garamond', group: 'Clásicas' },
  { id: 'georgia', label: 'Georgia', group: 'Clásicas' },
  { id: 'palatino', label: 'Palatino', group: 'Clásicas' },
  { id: 'outfit', label: 'Outfit', group: 'Modernas' },
  { id: 'opensans', label: 'Open Sans', group: 'Modernas' },
  { id: 'atkinson', label: 'Alta legibilidad', group: 'Accesibilidad', note: 'Atkinson Hyperlegible' },
  { id: 'lexend', label: 'Lexend', group: 'Accesibilidad' },
  { id: 'opendyslexic', label: 'OpenDyslexic', group: 'Accesibilidad', note: 'Diseñada para dislexia' },
  { id: 'cinzel', label: 'Cinzel', group: 'Literaria', note: 'Mejor para títulos' },
];

/** Grupos fijos (no un getter: en *ngFor recrearía los botones en cada pasada y se tragaría el clic). */
export const FONT_GROUPS: readonly { name: string; fonts: FontOption[] }[] =
  ['Clásicas', 'Modernas', 'Accesibilidad', 'Literaria']
    .map(name => ({ name, fonts: FONT_OPTIONS.filter(f => f.group === name) }))
    .filter(g => g.fonts.length > 0);

/** Ids de tipografía de versiones anteriores del lector. */
const FONT_ID_MIGRATION: Record<string, ReaderFontId> = {
  serif: 'merriweather', sans: 'outfit', dyslexic: 'atkinson', medieval: 'cinzel',
  helvetica: 'opensans', garamond: 'garamond', georgia: 'georgia', palatino: 'palatino', opensans: 'opensans',
};

export const THEME_OPTIONS: readonly { id: ReaderTheme; label: string }[] = [
  { id: 'light', label: 'Claro' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'gris', label: 'Gris suave' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'nocturno', label: 'OLED' },
];

export const LINE_HEIGHT_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1.4, label: 'Libro' },
  { value: 1.5, label: 'Compacto' },
  { value: 1.75, label: 'Normal' },
  { value: 2, label: 'Amplio' },
];

export const HIGHLIGHT_COLOR_OPTIONS: readonly { id: HighlightColor; label: string; hex: string }[] = [
  { id: 'gold', label: 'Dorado', hex: '#eab308' },
  { id: 'blue', label: 'Azul', hex: '#3b82f6' },
  { id: 'green', label: 'Verde', hex: '#22c55e' },
  { id: 'pink', label: 'Rosa', hex: '#ec4899' },
];

export const READER_PRESETS: readonly { id: ReaderPresetId; label: string; icon: string; detail: string }[] = [
  { id: 'clasico', label: 'Clásico', icon: 'menu_book', detail: 'Times y justificado' },
  { id: 'noche', label: 'Noche', icon: 'dark_mode', detail: 'Fondo negro y papel atenuado' },
  { id: 'enfoque', label: 'Enfoque', icon: 'center_focus_strong', detail: 'Foco por frase y regla' },
  { id: 'accesible', label: 'Accesible', icon: 'accessibility_new', detail: 'Letra legible y más aire' },
];

const THEMES: readonly ReaderTheme[] = ['dark', 'light', 'sepia', 'nocturno', 'gris'];
const LINE_HEIGHTS: readonly number[] = [1.4, 1.5, 1.75, 2];

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? value as T : fallback;
const bool = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback;
const num = (value: unknown): number => typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
/** Un número dentro del rango; fuera de él (o inválido) vale el de fábrica. */
const inRange = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = num(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type ReaderSettingsInput = Partial<Record<keyof ReaderSettings | 'doublePage' | 'readingWidth', unknown>>;

/** Valida los ajustes y migra el formato anterior de reader-settings-v2. */
export function sanitizeReaderSettings(raw: ReaderSettingsInput): ReaderSettings {
  const d = DEFAULT_READER_SETTINGS;
  const fontSize = num(raw.fontSize);
  const wpm = num(raw.wpm);
  const oldMargins = { narrow: 'wide', medium: 'normal', wide: 'narrow' } as const;
  const margins = raw.margins ?? oldMargins[raw.readingWidth as keyof typeof oldMargins];
  const layoutMode = raw.layoutMode ?? (typeof raw.doublePage === 'boolean' ? raw.doublePage ? 'paged' : 'scroll' : undefined);
  return {
    // La letra se reencuadra al rango (una guardada en 12 px pasa a 14), como hacía el lector.
    fontSize: Number.isFinite(fontSize) ? clamp(Math.round(fontSize), FONT_MIN, FONT_MAX) : d.fontSize,
    fontFamily: pick(raw.fontFamily, FONT_OPTIONS.map(f => f.id), d.fontFamily),
    theme: pick(raw.theme, THEMES, d.theme),
    lineHeight: pick(num(raw.lineHeight), LINE_HEIGHTS, d.lineHeight),
    margins: pick(margins, ['narrow', 'normal', 'wide'] as const, d.margins),
    textAlign: pick(raw.textAlign, ['left', 'justify'] as const, d.textAlign),
    paraSpacing: pick(raw.paraSpacing, ['tight', 'normal', 'relaxed'] as const, d.paraSpacing),
    letterSpacing: Math.round(inRange(raw.letterSpacing, -0.01, 0.08, d.letterSpacing) * 1000) / 1000,
    wordSpacing: Math.round(inRange(raw.wordSpacing, 0, 0.6, d.wordSpacing) * 100) / 100,
    brightness: Math.min(1, inRange(raw.brightness, 0.6, 1.1, d.brightness)),
    highContrast: bool(raw.highContrast, d.highContrast),
    highlightColor: pick(raw.highlightColor, HIGHLIGHT_COLOR_OPTIONS.map(h => h.id), d.highlightColor),
    layoutMode: pick(layoutMode, ['paged', 'scroll'] as const, d.layoutMode),
    pageTurn: pick(raw.pageTurn, ['slide', 'none'] as const, d.pageTurn),
    sceneImages: bool(raw.sceneImages, d.sceneImages),
    hideProgress: bool(raw.hideProgress, d.hideProgress),
    bionic: bool(raw.bionic, d.bionic),
    focusMode: pick(raw.focusMode, ['off', 'word', 'sentence', 'paragraph'] as const, d.focusMode),
    ruler: bool(raw.ruler, d.ruler),
    concentration: bool(raw.concentration, d.concentration),
    longParaSplit: bool(raw.longParaSplit, d.longParaSplit),
    tapToScroll: bool(raw.tapToScroll, d.tapToScroll),
    autoScrollSpeed: Math.round(inRange(raw.autoScrollSpeed, 10, 120, d.autoScrollSpeed)),
    wpm: Number.isFinite(wpm) && wpm >= 80 && wpm <= 500 ? Math.round(wpm) : d.wpm,
    wpmAuto: bool(raw.wpmAuto, d.wpmAuto),
    showReadingTime: bool(raw.showReadingTime, d.showReadingTime),
  };
}

/**
 * Lee las claves sueltas de las versiones anteriores (reader-font-size, reader-theme, …) con los
 * mismos criterios que tenía el lector. Devuelve null si no había ninguna.
 */
export function readLegacyReaderSettings(get: (key: string) => string | null): Partial<ReaderSettings> | null {
  const legacy: ReaderSettingsInput = {};
  let found = false;
  const read = (key: string): string | null => {
    const value = get(`reader-${key}`);
    if (value !== null) found = true;
    return value;
  };
  const flag = (key: string): boolean | undefined => {
    const value = read(key);
    return value === null ? undefined : value === 'true';
  };

  legacy.fontSize = read('font-size') ?? undefined;
  const font = read('font-family');
  legacy.fontFamily = font && FONT_ID_MIGRATION[font] && !FONT_OPTIONS.some(f => f.id === font) ? FONT_ID_MIGRATION[font] : font;
  legacy.theme = read('theme');
  legacy.doublePage = flag('double-page');
  legacy.lineHeight = read('line-height') ?? undefined;
  legacy.readingWidth = read('width');
  legacy.textAlign = read('align');
  legacy.paraSpacing = read('para-spacing');
  legacy.letterSpacing = read('letter-spacing') ?? undefined;
  legacy.wordSpacing = read('word-spacing') ?? undefined;
  legacy.brightness = read('brightness') ?? undefined;
  legacy.highContrast = flag('high-contrast');
  legacy.concentration = flag('concentration');
  legacy.focusMode = read('focus-mode');
  legacy.ruler = flag('ruler');
  legacy.highlightColor = read('highlight-color');
  legacy.longParaSplit = flag('long-para-split');
  legacy.tapToScroll = flag('tap-to-scroll');
  legacy.autoScrollSpeed = read('autoscroll-speed') ?? undefined;
  legacy.wpm = read('wpm') ?? undefined;
  legacy.wpmAuto = flag('wpm-auto');
  legacy.showReadingTime = flag('show-reading-time');
  legacy.hideProgress = flag('hide-progress');
  legacy.bionic = flag('bionic-reading');
  legacy.sceneImages = flag('show-images');
  return found ? sanitizeReaderSettings(legacy) : null;
}

/** Lo que aplica cada ajuste rápido (solo ajustes que ya existen). */
export function presetPatch(id: ReaderPresetId, current: ReaderSettings): Partial<ReaderSettings> {
  switch (id) {
    case 'clasico': // como un libro impreso: Times, justificado, sangría y sin espacio entre párrafos
      return { fontFamily: 'times', margins: 'normal', lineHeight: 1.4, paraSpacing: 'tight', textAlign: 'justify', letterSpacing: 0 };
    case 'noche':
      return { theme: 'nocturno', brightness: 0.82 };
    case 'enfoque':
      return { margins: 'wide', lineHeight: 2, paraSpacing: 'relaxed', concentration: true, focusMode: 'sentence', ruler: true };
    case 'accesible':
      return { fontFamily: 'atkinson', fontSize: Math.max(20, current.fontSize), lineHeight: 2, paraSpacing: 'relaxed', letterSpacing: 0.02, highContrast: true };
  }
}

/** Un ajuste rápido se marca cuando lo que tienes puesto coincide con lo que él aplica. */
export function isPresetActive(id: ReaderPresetId, s: ReaderSettings): boolean {
  switch (id) {
    case 'clasico':
      return s.fontFamily === 'times' && s.margins === 'normal' && s.lineHeight === 1.4
        && s.paraSpacing === 'tight' && s.textAlign === 'justify' && s.letterSpacing === 0;
    case 'noche':
      return s.theme === 'nocturno' && s.brightness === 0.82;
    case 'enfoque':
      return s.margins === 'wide' && s.lineHeight === 2 && s.paraSpacing === 'relaxed'
        && s.concentration && s.focusMode === 'sentence' && s.ruler;
    case 'accesible':
      return s.fontFamily === 'atkinson' && s.fontSize >= 20 && s.lineHeight === 2
        && s.paraSpacing === 'relaxed' && s.letterSpacing === 0.02 && s.highContrast;
  }
}

/** ¿Algo distinto de fábrica? Con el ritmo automático, las palabras por minuto las calibra el lector. */
export function differsFromDefaults(s: ReaderSettings): boolean {
  return (Object.keys(DEFAULT_READER_SETTINGS) as (keyof ReaderSettings)[])
    .some(key => !(key === 'wpm' && s.wpmAuto) && s[key] !== DEFAULT_READER_SETTINGS[key]);
}
