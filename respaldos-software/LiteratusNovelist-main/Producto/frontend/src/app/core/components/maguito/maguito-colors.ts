/**
 * maguito-colors.ts — Modelo, paletas temáticas y utilidades de color para Maguito.
 * Permite personalizar los ropajes, sombrero, cuerpo y aura mágica del personaje.
 */

export interface MaguitoCustomColors {
  capeA: string;
  capeB: string;
  capeTrim: string;
  hatA: string;
  hatB: string;
  hatBand: string;
  bodyA: string;
  bodyB: string;
  magicAura: string;
  magicSparks: string;
  metal: string;
}

export interface MaguitoPresetPalette {
  id: string;
  name: string;
  flavor: string;
  colors: MaguitoCustomColors;
}

export const DEFAULT_MAGUITO_COLORS: MaguitoCustomColors = {
  capeA: '#f8bf55',
  capeB: '#e59a2f',
  capeTrim: '#b86a14',
  hatA: '#9d5fd8',
  hatB: '#6d2fad',
  hatBand: '#6a2aa6',
  bodyA: '#86a3f7',
  bodyB: '#3452c6',
  magicAura: '#a855f7',
  magicSparks: '#ffe08a',
  metal: '#d6a64f',
};

export const MAGUITO_COLOR_PRESETS: MaguitoPresetPalette[] = [
  {
    id: 'classic',
    name: 'Mago de Taberna',
    flavor: 'La túnica dorada tradicional bañada en aroma a tinta y madera vieja.',
    colors: { ...DEFAULT_MAGUITO_COLORS },
  },
  {
    id: 'midnight',
    name: 'Crepúsculo Astral',
    flavor: 'Tejido con el cielo estrellado y el frío misterio de la medianoche.',
    colors: {
      capeA: '#6f79bf',
      capeB: '#303b78',
      capeTrim: '#b2b8e7',
      hatA: '#394780',
      hatB: '#182045',
      hatBand: '#c5b778',
      bodyA: '#5e72e4',
      bodyB: '#1a237e',
      magicAura: '#7986cb',
      magicSparks: '#e8eaf6',
      metal: '#cfd8dc',
    },
  },
  {
    id: 'emerald',
    name: 'Pocionario del Bosque',
    flavor: 'Tinturas de musgo milenario, rocío de trébol y hojas de mandrágora.',
    colors: {
      capeA: '#6fe0a8',
      capeB: '#1f8f5f',
      capeTrim: '#0f5a3a',
      hatA: '#2e7d32',
      hatB: '#1b5e20',
      hatBand: '#c8e6c9',
      bodyA: '#80cbc4',
      bodyB: '#00695c',
      magicAura: '#66bb6a',
      magicSparks: '#a5d6a7',
      metal: '#d4af37',
    },
  },
  {
    id: 'ember',
    name: 'Brumas de Chimenea',
    flavor: 'Chispas de la chimenea central de la taberna y carbón encendido.',
    colors: {
      capeA: '#ff8a65',
      capeB: '#d84315',
      capeTrim: '#ffccbc',
      hatA: '#b71c1c',
      hatB: '#4a148c',
      hatBand: '#ffd54f',
      bodyA: '#ff7043',
      bodyB: '#bf360c',
      magicAura: '#ff9800',
      magicSparks: '#fff59d',
      metal: '#ffb300',
    },
  },
  {
    id: 'arcane_rose',
    name: 'Néctar de Elixir',
    flavor: 'Destilado en frascos de cristal encantado y esencias de pétalo feérico.',
    colors: {
      capeA: '#f48fb1',
      capeB: '#ad1457',
      capeTrim: '#fce4ec',
      hatA: '#880e4f',
      hatB: '#4a148c',
      hatBand: '#f06292',
      bodyA: '#ba68c8',
      bodyB: '#6a1b9a',
      magicAura: '#e91e63',
      magicSparks: '#f8bbd0',
      metal: '#fbc02d',
    },
  },
  {
    id: 'mead_gold',
    name: 'Cosecha de Malta & Miel',
    flavor: 'Inspirado en los barriles de hidromiel dorada y panes recién horneados.',
    colors: {
      capeA: '#f6c358',
      capeB: '#b37812',
      capeTrim: '#ffebaa',
      hatA: '#7d4a1b',
      hatB: '#4a2808',
      hatBand: '#f9d272',
      bodyA: '#e4aa60',
      bodyB: '#8a5214',
      magicAura: '#e69818',
      magicSparks: '#fff2b2',
      metal: '#ffd54f',
    },
  },
];

/** Paleta de swatches rápidos optimizados para tocar con los dedos. */
export const MAGUITO_SWATCHES = [
  '#f8bf55', '#e59a2f', '#e63946', '#ad1457', '#9d5fd8',
  '#6f79bf', '#3b82f6', '#0284c7', '#10b981', '#1f8f5f',
  '#d97706', '#475569', '#1e293b', '#f1f5f9', '#ffd700',
];

/** Inyecta las variables CSS correspondientes en un elemento o estilo. */
export function getMaguitoCssVariables(colors?: Partial<MaguitoCustomColors> | null): Record<string, string> {
  const c = { ...DEFAULT_MAGUITO_COLORS, ...colors };
  return {
    '--mg-cape-a': c.capeA,
    '--mg-cape-b': c.capeB,
    '--mg-cape-c': c.capeB,
    '--mg-cape-seam': c.capeTrim,
    '--mg-sleeve': c.capeB,
    '--mg-sleeve-hi': c.capeA,

    '--mg-hat-a': c.hatA,
    '--mg-hat-b': c.hatB,
    '--mg-hat-c': c.hatB,
    '--mg-brim-a': c.hatA,
    '--mg-brim-b': c.hatB,
    '--mg-brim-c': c.hatB,
    '--mg-band-a': c.hatBand,
    '--mg-band-b': c.hatB,
    '--mg-hat-glow': c.magicAura,

    '--mg-body-a': c.bodyA,
    '--mg-body-b': c.bodyB,
    '--mg-body-c': c.bodyB,
    '--mg-body-d': c.bodyB,
    '--mg-limb-a': c.bodyA,
    '--mg-limb-b': c.bodyB,

    '--mg-aura-glow': c.magicAura,
    '--mg-spark-glow': c.magicSparks,
    '--mg-metal-acc': c.metal,
  };
}

export function applyMaguitoColors(host: HTMLElement, colors?: Partial<MaguitoCustomColors> | null): void {
  if (!host) return;
  const vars = getMaguitoCssVariables(colors);
  for (const [key, value] of Object.entries(vars)) {
    host.style.setProperty(key, value);
  }
}

