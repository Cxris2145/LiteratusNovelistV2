export type NavPanel = 'categories' | 'authors' | 'library';

export interface NavItem {
  label: string;
  icon: string;
  link: string;
  /** Rutas que marcan la sección como activa (prefijos). */
  match: string[];
  panel?: NavPanel;
}

/** Secciones principales: las usan la barra del encabezado y, en el celular, la barra inferior. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Explorar', icon: 'explore', link: '/catalog', match: ['/catalog', '/book/'] },
  { label: 'Categorías', icon: 'grid_view', link: '/categories', match: ['/categories'], panel: 'categories' },
  { label: 'Autores', icon: 'history_edu', link: '/authors', match: ['/authors', '/author/'], panel: 'authors' },
  { label: 'Personajes', icon: 'groups', link: '/characters', match: ['/characters', '/demo-chat', '/chat/'] },
  { label: 'La Taberna', icon: 'local_cafe', link: '/tavern', match: ['/tavern'] },
  { label: 'Mi Biblioteca', icon: 'menu_book', link: '/library', match: ['/library', '/favorites', '/flashcards'], panel: 'library' },
  { label: 'La Senda', icon: 'map', link: '/learn', match: ['/learn'] },
  { label: 'El Enigma', icon: 'extension', link: '/games/enigma', match: ['/games/enigma'] },
  { label: 'Interrogatorio', icon: 'visibility_off', link: '/games/interrogatorio', match: ['/games/interrogatorio', '/games/blind-interrogation', '/interrogatorio'] },
  { label: 'Logros', icon: 'emoji_events', link: '/achievements', match: ['/achievements'] },
];
