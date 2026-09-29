/**
 * core/utils/font-loader.util.ts
 *
 * Carga una hoja de Google Fonts solo cuando una pantalla la necesita, una vez
 * por sesión. Así la portada no descarga las tipografías que solo usa el lector.
 */
export const READER_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Literata:ital,wght@0,400;0,700;1,400'
  + '&family=Merriweather:wght@400;700&family=Open+Sans:wght@400;600'
  + '&family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@400;500&display=swap';

export const MERRIWEATHER_HREF = 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap';

/** Iconos Outlined: solo los usa el panel de administración. */
export const OUTLINED_ICONS_HREF =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block';

export function loadFontStylesheet(href: string): void {
  if (typeof document === 'undefined') return;
  const already = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .some(link => link.href === href);
  if (already) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
