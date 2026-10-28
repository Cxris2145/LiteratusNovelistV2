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
  { label: 'Cuentos e infantil', slug: 'cuentos', icon: 'auto_stories' },
  { label: 'Aventuras', slug: 'accion-y-aventura', icon: 'sailing' },
  { label: 'Ciencia ficción y fantasía', slug: 'ciencia-ficcion', icon: 'rocket_launch' },
  { label: 'Terror y misterio', slug: 'terror', icon: 'search_insights' },
  { label: 'Romance', slug: 'romantica', icon: 'favorite' },
  { label: 'Novela clásica', slug: 'ficcion-clasica', icon: 'menu_book' },
  { label: 'Novela histórica', slug: 'ficcion-historica', icon: 'history_edu' },
];

/** Los cinco primeros van como filtros rápidos bajo el buscador. */
export const QUICK_GENRES = NAV_GENRES.slice(0, 5);
