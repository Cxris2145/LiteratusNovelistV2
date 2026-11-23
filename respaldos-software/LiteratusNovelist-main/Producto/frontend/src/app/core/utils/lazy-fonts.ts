/**
 * Tipografías que solo usan algunas pantallas. Antes iban como hojas de Google Fonts en index.html y
 * cada visita (también desde el celular) esperaba esas dos hojas antes de pintar la primera pantalla.
 * Ahora se piden la primera vez que se abre la pantalla que las usa. Las cuatro familias del sitio
 * (Cinzel, Cormorant Garamond, EB Garamond y Plus Jakarta Sans) se sirven desde /assets/fonts.
 */
const SHEETS = {
  /** Opciones de «Aa → Tipografía» del lector y del cuaderno, y el modo Dislexia de la portada. */
  reader: 'https://fonts.googleapis.com/css2?family=Literata:ital,wght@0,400;0,700;1,400&family=Merriweather:wght@400;700&family=Outfit:wght@400;500;600&family=Open+Sans:wght@400;600&family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@400;500&display=swap',
  /** Letra «Space Grotesk» del cuaderno. */
  notebook: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap',
} as const;

export type LazyFontSheet = keyof typeof SHEETS;

export function loadFontSheet(name: LazyFontSheet): void {
  if (typeof document === 'undefined') return;
  const id = `lazy-font-${name}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = SHEETS[name];
  document.head.appendChild(link);
}
