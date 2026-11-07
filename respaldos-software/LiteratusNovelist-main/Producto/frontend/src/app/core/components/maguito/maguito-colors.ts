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
  /** Líneas de la cara (boca y gafas): un cuerpo oscuro las necesita claras. */
  ink?: string;
  /** Sombra arriba y abajo del cuerpo: cada color la lleva en su propio tono. */
  shade?: string;
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
  ink: '#18215a',
  shade: '#0c1446',
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

/**
 * Los colores que se eligen al crear la cuenta y en el perfil: el Maguito entero, de pies a cabeza.
 * La túnica va más clara que el cuerpo para que se distinga la silueta.
 */
export const MAGUITO_BASIC_COLORS: MaguitoPresetPalette[] = [
  {
    id: 'classic',
    name: 'Clásico',
    flavor: 'El de siempre: azul, con túnica dorada y sombrero morado.',
    colors: { ...DEFAULT_MAGUITO_COLORS },
  },
  {
    id: 'yellow',
    name: 'Amarillo',
    flavor: 'Amarillo de pies a cabeza.',
    colors: {
      capeA: '#fff3b0', capeB: '#f6cf47', capeTrim: '#b88300',
      hatA: '#ffe14d', hatB: '#e6ad00', hatBand: '#8a5a00',
      bodyA: '#ffe680', bodyB: '#e3a908',
      magicAura: '#ffd84a', magicSparks: '#fff3b0', metal: '#b88300',
      ink: '#4a3200', shade: '#6b4700',
    },
  },
  {
    id: 'orange',
    name: 'Naranja',
    flavor: 'Naranja de pies a cabeza.',
    colors: {
      capeA: '#ffd3a1', capeB: '#f79a45', capeTrim: '#a84708',
      hatA: '#ff9a3c', hatB: '#c4500a', hatBand: '#7a2e05',
      bodyA: '#ffb370', bodyB: '#e8650f',
      magicAura: '#ff9a3c', magicSparks: '#ffe0b8', metal: '#d6a64f',
      ink: '#4a1d02', shade: '#5e2406',
    },
  },
  {
    id: 'red',
    name: 'Rojo',
    flavor: 'Rojo de pies a cabeza.',
    colors: {
      capeA: '#ffb3a7', capeB: '#ee5f68', capeTrim: '#8f0f1c',
      hatA: '#e63946', hatB: '#8f0f1c', hatBand: '#f1c867',
      bodyA: '#ff8a80', bodyB: '#cc1f2d',
      magicAura: '#ff5a5f', magicSparks: '#ffd0c8', metal: '#d6a64f',
      ink: '#3f060b', shade: '#45060c',
    },
  },
  {
    id: 'pink',
    name: 'Rosa',
    flavor: 'Rosa de pies a cabeza.',
    colors: {
      capeA: '#ffe0ee', capeB: '#f78fbd', capeTrim: '#b02e6e',
      hatA: '#f472b6', hatB: '#b0246f', hatBand: '#ffe0ee',
      bodyA: '#ffc2dd', bodyB: '#e85a9b',
      magicAura: '#f472b6', magicSparks: '#ffe0ee', metal: '#d6a64f',
      ink: '#4f0f30', shade: '#5e1238',
    },
  },
  {
    id: 'purple',
    name: 'Morado',
    flavor: 'Morado de pies a cabeza.',
    colors: {
      capeA: '#e8d8ff', capeB: '#a77bea', capeTrim: '#4c1f9a',
      hatA: '#9d5fd8', hatB: '#56209c', hatBand: '#f1c867',
      bodyA: '#d3b4ff', bodyB: '#7a3fd6',
      magicAura: '#a855f7', magicSparks: '#e8d8ff', metal: '#d6a64f',
      ink: '#22084f', shade: '#24095a',
    },
  },
  {
    id: 'blue',
    name: 'Azul',
    flavor: 'Azul de pies a cabeza.',
    colors: {
      capeA: '#cfe3ff', capeB: '#6ea4f2', capeTrim: '#123f99',
      hatA: '#4d8cf0', hatB: '#153f9e', hatBand: '#cfe3ff',
      bodyA: '#9cc4ff', bodyB: '#1f5fd6',
      magicAura: '#5b9bff', magicSparks: '#dbe9ff', metal: '#cfd8dc',
      ink: '#0a1f55', shade: '#0b1f5c',
    },
  },
  {
    id: 'teal',
    name: 'Turquesa',
    flavor: 'Turquesa de pies a cabeza.',
    colors: {
      capeA: '#d3faf4', capeB: '#5ad6c8', capeTrim: '#0a6e68',
      hatA: '#2cc4b6', hatB: '#0a6f6a', hatBand: '#d3faf4',
      bodyA: '#9ff0e6', bodyB: '#0f9d94',
      magicAura: '#2dd4bf', magicSparks: '#d3faf4', metal: '#d6a64f',
      ink: '#053b38', shade: '#06403c',
    },
  },
  {
    id: 'green',
    name: 'Verde',
    flavor: 'Verde de pies a cabeza.',
    colors: {
      capeA: '#d8f5cf', capeB: '#6fcf7a', capeTrim: '#1b6b36',
      hatA: '#43b05c', hatB: '#1b6b36', hatBand: '#f1c867',
      bodyA: '#a8e6a1', bodyB: '#2e9e4f',
      magicAura: '#4ade80', magicSparks: '#d8f5cf', metal: '#d6a64f',
      ink: '#0c3a1b', shade: '#0e3f1d',
    },
  },
  {
    id: 'brown',
    name: 'Café',
    flavor: 'Café de pies a cabeza.',
    colors: {
      capeA: '#ecd3b4', capeB: '#b98a5c', capeTrim: '#5c3a1e',
      hatA: '#9c6b40', hatB: '#5c3a1e', hatBand: '#ecd3b4',
      bodyA: '#d7b08a', bodyB: '#8a5a33',
      magicAura: '#c99a6b', magicSparks: '#f3e2cc', metal: '#d6a64f',
      ink: '#2e1a0b', shade: '#33200f',
    },
  },
  {
    id: 'black',
    name: 'Negro',
    flavor: 'Negro de pies a cabeza, con detalles dorados.',
    colors: {
      capeA: '#454855', capeB: '#23242e', capeTrim: '#8a8da0',
      hatA: '#3a3c46', hatB: '#111218', hatBand: '#d6a64f',
      bodyA: '#4a4d5c', bodyB: '#16171f',
      magicAura: '#8b8fa8', magicSparks: '#e7e9f5', metal: '#d6a64f',
      ink: '#e7e9f5', shade: '#000000',
    },
  },
  {
    id: 'white',
    name: 'Blanco',
    flavor: 'Blanco de pies a cabeza, con detalles dorados.',
    colors: {
      capeA: '#ffffff', capeB: '#e4e8f1', capeTrim: '#9aa3b8',
      hatA: '#f4f6fb', hatB: '#b9c1d3', hatBand: '#d6a64f',
      bodyA: '#ffffff', bodyB: '#cfd5e3',
      magicAura: '#e7ebf5', magicSparks: '#ffffff', metal: '#d6a64f',
      ink: '#2b3146', shade: '#5b637a',
    },
  },
];

/** Paleta de swatches rápidos optimizados para tocar con los dedos. */
export const MAGUITO_SWATCHES = [
  '#f8bf55', '#e59a2f', '#e63946', '#ad1457', '#9d5fd8',
  '#6f79bf', '#3b82f6', '#0284c7', '#10b981', '#1f8f5f',
  '#d97706', '#475569', '#1e293b', '#f1f5f9', '#ffd700',
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Mezcla dos colores '#rrggbb': amount = 0 da `from` y amount = 1 da `to`. */
function mix(from: string, to: string, amount: number): string {
  if (!HEX_COLOR.test(from) || !HEX_COLOR.test(to)) return from;
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  let result = '#';
  for (const at of [1, 3, 5]) {
    const value = Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * amount);
    result += value.toString(16).padStart(2, '0');
  }
  return result;
}
const darker = (hex: string, amount: number) => mix(hex, '#000000', amount);
const lighter = (hex: string, amount: number) => mix(hex, '#ffffff', amount);

/**
 * Las variables CSS de esos colores. Los tonos intermedios se calculan con las mismas
 * proporciones del dibujo original, para que los degradados conserven su volumen.
 */
export function getMaguitoCssVariables(colors?: Partial<MaguitoCustomColors> | null): Record<string, string> {
  const c = { ...DEFAULT_MAGUITO_COLORS, ...colors };
  const limbA = mix(c.bodyA, c.bodyB, 0.6);
  return {
    '--mg-cape-a': c.capeA,
    '--mg-cape-b': c.capeB,
    '--mg-cape-c': darker(c.capeB, 0.17),
    '--mg-cape-seam': c.capeTrim,
    '--mg-sleeve': c.capeB,
    '--mg-sleeve-hi': c.capeA,

    '--mg-hat-a': c.hatA,
    '--mg-hat-b': c.hatB,
    '--mg-hat-c': darker(c.hatB, 0.42),
    '--mg-brim-a': mix(c.hatA, c.hatB, 0.25),
    '--mg-brim-b': darker(c.hatB, 0.1),
    '--mg-brim-c': darker(c.hatB, 0.35),
    '--mg-band-a': c.hatBand,
    '--mg-band-b': darker(c.hatBand, 0.27),
    '--mg-hat-glow': c.magicAura,

    '--mg-body-a': c.bodyA,
    '--mg-body-b': limbA,
    '--mg-body-c': c.bodyB,
    '--mg-body-d': darker(c.bodyB, 0.38),
    '--mg-limb-a': limbA,
    '--mg-limb-b': darker(c.bodyB, 0.12),

    '--mg-aura-glow': c.magicAura,
    '--mg-spark-glow': c.magicSparks,
    '--mg-metal-hi': lighter(c.metal, 0.65),
    '--mg-metal-acc': c.metal,
    '--mg-metal-lo': darker(c.metal, 0.4),
    '--mg-ink': c.ink || DEFAULT_MAGUITO_COLORS.ink!,
    '--mg-shade': c.shade || DEFAULT_MAGUITO_COLORS.shade!,
  };
}

/** Las variables de la capa: una capa comprada en El Bazar trae las suyas y se respetan. */
const CAPE_VARIABLES = new Set(['--mg-cape-a', '--mg-cape-b', '--mg-cape-c', '--mg-cape-seam', '--mg-sleeve', '--mg-sleeve-hi']);

export function applyMaguitoColors(
  host: HTMLElement,
  colors?: Partial<MaguitoCustomColors> | null,
  options?: { keepCape?: boolean },
): void {
  if (!host) return;
  for (const [key, value] of Object.entries(getMaguitoCssVariables(colors))) {
    if (options?.keepCape && CAPE_VARIABLES.has(key)) host.style.removeProperty(key);
    else host.style.setProperty(key, value);
  }
}

/** Vuelve a los colores del dibujo original (los que define el :host de Maguito). */
export function clearMaguitoColors(host: HTMLElement): void {
  if (!host) return;
  for (const key of Object.keys(getMaguitoCssVariables())) host.style.removeProperty(key);
}

const COLOR_KEYS = Object.keys(DEFAULT_MAGUITO_COLORS) as (keyof MaguitoCustomColors)[];

export function sameMaguitoColors(
  a: Partial<MaguitoCustomColors> | null | undefined,
  b: Partial<MaguitoCustomColors> | null | undefined,
): boolean {
  const left = { ...DEFAULT_MAGUITO_COLORS, ...a };
  const right = { ...DEFAULT_MAGUITO_COLORS, ...b };
  return COLOR_KEYS.every(key => left[key]?.toLowerCase() === right[key]?.toLowerCase());
}

/** Lo que se guarda en la cuenta: el Maguito clásico no lleva colores. */
export function storedMaguitoColors(colors: Partial<MaguitoCustomColors> | null | undefined): Partial<MaguitoCustomColors> | null {
  return colors && !sameMaguitoColors(colors, null) ? colors : null;
}
