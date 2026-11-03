/** Colecciones de marcos, en el orden en que las muestra El Bazar. */
export const FRAME_COLLECTIONS = [
  { id: 'navidad', label: 'Navidad' },
  { id: 'ano-nuevo', label: 'Año Nuevo' },
  { id: 'halloween', label: 'Halloween' },
  { id: 'bestiario', label: 'Bestiario' },
  { id: 'elementos', label: 'Elementos' },
  { id: 'colores', label: 'Colores' },
  { id: 'blanco-negro', label: 'Blanco y negro' },
  { id: 'clasicos', label: 'Clásicos' },
  { id: 'premios', label: 'Premios' },
] as const;

export type FrameCollection = typeof FRAME_COLLECTIONS[number]['id'];

/**
 * Cada marco que sabe dibujar avatar-frame (Profile.equipped_frame / ShopItem.value) y su colección.
 * Un marco nuevo necesita su fila aquí, sus estilos en avatar-frame*.css y su artículo en
 * backend learning/cosmetics_catalog.py (learning/tests_frames.py revisa que estén los tres).
 */
export const FRAME_COLLECTION_OF: Readonly<Record<string, FrameCollection>> = {
  'frame-gold': 'clasicos', 'frame-victorian': 'clasicos', 'frame-parchment': 'clasicos',
  'frame-inkblue': 'clasicos', 'frame-autumn': 'clasicos', 'frame-constellation': 'clasicos',
  'frame-maestro': 'premios', 'frame-laurel': 'premios', 'frame-eternal-flame': 'premios',
  'frame-library': 'premios', 'frame-owl': 'premios', 'frame-summit': 'premios', 'frame-tavern': 'premios',

  'frame-xmas-gingerbread': 'navidad', 'frame-xmas-candy': 'navidad', 'frame-xmas-snow': 'navidad',
  'frame-xmas-wreath': 'navidad', 'frame-xmas-lights': 'navidad', 'frame-xmas-star': 'navidad',
  'frame-xmas-santa': 'navidad',

  'frame-ny-sunrise': 'ano-nuevo', 'frame-ny-confetti': 'ano-nuevo', 'frame-ny-champagne': 'ano-nuevo',
  'frame-ny-clock': 'ano-nuevo', 'frame-ny-fireworks': 'ano-nuevo',

  'frame-hw-potion': 'halloween', 'frame-hw-bats': 'halloween', 'frame-hw-pumpkin': 'halloween',
  'frame-hw-web': 'halloween', 'frame-hw-ghost': 'halloween', 'frame-hw-bloodmoon': 'halloween',

  'frame-wolf': 'bestiario', 'frame-ouroboros': 'bestiario', 'frame-kraken': 'bestiario',
  'frame-unicorn': 'bestiario', 'frame-phoenix': 'bestiario', 'frame-dragon-emerald': 'bestiario',
  'frame-dragon-fire': 'bestiario',

  'frame-lava': 'elementos', 'frame-forest': 'elementos', 'frame-ice': 'elementos',
  'frame-tempest': 'elementos', 'frame-galaxy': 'elementos',

  'frame-ruby': 'colores', 'frame-emerald': 'colores', 'frame-sapphire': 'colores', 'frame-ocean': 'colores',
  'frame-rainbow': 'colores', 'frame-sakura': 'colores', 'frame-neon': 'colores', 'frame-aurora': 'colores',

  'frame-bw-chessboard': 'blanco-negro', 'frame-bw-ink': 'blanco-negro', 'frame-bw-zebra': 'blanco-negro',
  'frame-bw-yinyang': 'blanco-negro', 'frame-bw-piano': 'blanco-negro', 'frame-bw-film': 'blanco-negro',
  'frame-bw-eclipse': 'blanco-negro',
};

export const AVATAR_FRAMES: readonly string[] = Object.keys(FRAME_COLLECTION_OF);

/**
 * Rarezas por precio, de la más cara a la más barata. El backend pone cada marco exactamente en
 * su escalón (FRAME_PRICES en learning/cosmetics_catalog.py: 90 · 160 · 280 · 450 · 750); los
 * umbrales dejan margen por si alguien reajusta un precio a mano.
 */
export const FRAME_TIERS = [
  { id: 'mitico', label: 'Mítico', from: 700 },
  { id: 'legendario', label: 'Legendario', from: 400 },
  { id: 'epico', label: 'Épico', from: 250 },
  { id: 'raro', label: 'Raro', from: 150 },
  { id: 'comun', label: 'Común', from: 0 },
] as const;

export type FrameTier = typeof FRAME_TIERS[number]['id'];

export function frameTier(cost: number): FrameTier {
  return (FRAME_TIERS.find(tier => cost >= tier.from) ?? FRAME_TIERS[FRAME_TIERS.length - 1]).id;
}

export function frameCollection(value: string | null | undefined): FrameCollection {
  return (value && FRAME_COLLECTION_OF[value]) || 'clasicos';
}
