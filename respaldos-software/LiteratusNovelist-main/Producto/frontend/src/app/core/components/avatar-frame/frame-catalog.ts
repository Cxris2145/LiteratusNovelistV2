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

/** [arriba, derecha, abajo, izquierda], en fracciones del diámetro del retrato. */
export type FrameReach = readonly [number, number, number, number];

const NO_REACH: FrameReach = [0, 0, 0, 0];

/**
 * Cuánto se salen del retrato los adornos de cada marco en tamaño lg (alas, cabezas, gorros,
 * brasas...), como fracción de su diámetro. Lo usa quien tiene que dejarles espacio, como la
 * ficha de la Taberna, que es una caja con scroll y recorta lo que se sale. Solo figuran los
 * marcos que pasan de su propio anillo. Son las cajas de los adornos de avatar-frame*.css
 * medidas en el navegador, con un poco de holgura: si se agranda un adorno, hay que actualizar
 * su fila.
 */
export const FRAME_REACH: Readonly<Record<string, FrameReach>> = {
  'frame-eternal-flame': [0.31, 0, 0, 0],
  'frame-owl': [0.25, 0, 0, 0],
  'frame-summit': [0, 0, 0.24, 0],

  'frame-xmas-snow': [0.29, 0.26, 0, 0],
  'frame-xmas-wreath': [0, 0, 0.39, 0],
  'frame-xmas-star': [0.66, 0, 0, 0],
  'frame-xmas-santa': [0.63, 0, 0, 0],

  'frame-ny-confetti': [0.49, 0.25, 0, 0.25],
  'frame-ny-champagne': [0.22, 0, 0, 0],
  'frame-ny-clock': [0.43, 0, 0, 0],
  'frame-ny-fireworks': [0.43, 0.35, 0.35, 0.41],

  'frame-hw-bats': [0.35, 0.35, 0.35, 0.35],
  'frame-hw-pumpkin': [0.47, 0.34, 0.31, 0],
  'frame-hw-web': [0.38, 0, 0, 0.37],
  'frame-hw-ghost': [0.35, 0.35, 0.22, 0.3],
  'frame-hw-bloodmoon': [0.43, 0.43, 0.41, 0.46],

  'frame-wolf': [0.41, 0.38, 0, 0],
  'frame-ouroboros': [0.37, 0.37, 0.37, 0.37],
  'frame-kraken': [0, 0.58, 0.25, 0.58],
  'frame-unicorn': [0.55, 0, 0, 0],
  'frame-phoenix': [0.68, 0.68, 0, 0.68],
  'frame-dragon-emerald': [0.6, 0.76, 0.29, 0.76],
  'frame-dragon-fire': [0.87, 0.81, 0, 0.81],

  'frame-forest': [0.41, 0.41, 0.41, 0.41],
  'frame-ice': [0.5, 0.27, 0, 0],
  'frame-tempest': [0.49, 0.41, 0, 0],
  'frame-galaxy': [0.55, 0.3, 0.3, 0.55],

  'frame-sakura': [0.33, 0.35, 0, 0.35],
  'frame-aurora': [0.41, 0.41, 0.41, 0.41],

  'frame-bw-piano': [0.31, 0.31, 0, 0.34],
  'frame-bw-film': [0, 0.35, 0.33, 0],
  'frame-bw-eclipse': [0.38, 0.38, 0.38, 0.38],
};

export function frameReach(value: string | null | undefined): FrameReach {
  return (value && FRAME_REACH[value]) || NO_REACH;
}

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
