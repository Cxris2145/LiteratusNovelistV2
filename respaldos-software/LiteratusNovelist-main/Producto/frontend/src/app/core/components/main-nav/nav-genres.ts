/**
 * Géneros destacados del header: los filtros rápidos bajo el buscador y la lista del
 * menú de Categorías. Curados a mano (los slugs existen en catalog/genres/).
 */
export interface NavGenre {
  label: string;
  slug: string;
  icon: string;
}

export const NAV_GENRES: NavGenre[] = [
  { label: 'Cuentos clásicos', slug: 'cuentos', icon: 'auto_stories' },
  { label: 'Aventuras', slug: 'accion-y-aventura', icon: 'sailing' },
  { label: 'Fantasía', slug: 'fantasia', icon: 'castle' },
  { label: 'Misterio', slug: 'policiaca-negra-y-suspense', icon: 'search_insights' },
  { label: 'Ciencia ficción', slug: 'ciencia-ficcion', icon: 'rocket_launch' },
  { label: 'Romance', slug: 'romantica', icon: 'favorite' },
  { label: 'Terror', slug: 'terror', icon: 'skull' },
];

/** Los cinco primeros van como filtros rápidos bajo el buscador. */
export const QUICK_GENRES = NAV_GENRES.slice(0, 5);
