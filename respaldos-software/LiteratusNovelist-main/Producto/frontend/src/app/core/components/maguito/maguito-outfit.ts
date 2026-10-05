/**
 * Vestuario de Maguito. El backend guarda en Profile.outfit un objeto por espacio
 * ({ head: 'crown', face: 'beard' }) y los artículos del Bazar llevan `value = 'espacio:variante'`.
 * Lo que no viene (o una variante que este frontend aún no sabe dibujar) usa el atuendo de siempre.
 */
export type WearSlot = 'head' | 'eyes' | 'face' | 'neck' | 'cape';
export type MaguitoOutfit = Partial<Record<WearSlot, string>>;
export type MaguitoLook = Record<WearSlot, string>;

export const OUTFIT_DEFAULTS: MaguitoLook = {
  head: 'wizard',
  eyes: 'round',
  face: 'none',
  neck: 'none',
  cape: 'gold',
};

export const KNOWN_VARIANTS: Record<WearSlot, readonly string[]> = {
  head: ['wizard', 'crown', 'tophat', 'pirate', 'beret', 'witch-flower', 'aviator'],
  eyes: ['round', 'none', 'halfmoon', 'monocle', 'star'],
  face: ['none', 'beard', 'mustache'],
  neck: ['none', 'scarf-red', 'bowtie'],
  cape: ['gold', 'royal', 'emerald', 'red'],
};

export const WEAR_SLOTS = Object.keys(KNOWN_VARIANTS) as WearSlot[];

export const SLOT_LABELS: Record<WearSlot, string> = {
  head: 'Cabeza',
  eyes: 'Ojos',
  face: 'Cara',
  neck: 'Cuello',
  cape: 'Capa',
};

export function resolveOutfit(outfit?: MaguitoOutfit | null): MaguitoLook {
  const look = { ...OUTFIT_DEFAULTS };
  for (const slot of WEAR_SLOTS) {
    const variant = outfit?.[slot];
    if (variant && KNOWN_VARIANTS[slot].includes(variant)) look[slot] = variant;
  }
  return look;
}

/** 'head:crown' → { slot: 'head', variant: 'crown' }; null si no es un accesorio válido. */
export function parseWear(value: string | null | undefined): { slot: WearSlot; variant: string } | null {
  const [slot, variant] = String(value || '').split(':');
  return (WEAR_SLOTS as string[]).includes(slot) && variant ? { slot: slot as WearSlot, variant } : null;
}
