/**
 * Cambia de paleta de una sola vez.
 *
 * Sin esto, al cambiar el tema cientos de elementos (header, menús, botones; en el lector, el
 * lienzo con miles de palabras) animan su color y fondo a la vez: el navegador repinta toda la
 * página en cada cuadro durante 0,2–0,3 s. Aquí las transiciones se apagan mientras se aplica
 * el tema (html.theme-switching, ver styles.css) y, si el navegador lo permite, la página hace
 * un fundido corto con View Transitions, que la GPU pinta como una sola imagen.
 */
export function swapTheme(apply: () => void): void {
  const root = document.documentElement;
  const run = () => {
    root.classList.add('theme-switching');
    apply();
    // Recalcula los estilos ya (no la maquetación), con las transiciones apagadas: al quitar la
    // clase los valores no vuelven a cambiar, así que no arranca ninguna.
    void window.getComputedStyle(document.body).color;
    root.classList.remove('theme-switching');
  };

  const start = (document as any).startViewTransition as ((cb: () => void) => { finished: Promise<void> }) | undefined;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!start || reduceMotion || document.visibilityState !== 'visible') {
    run();
    return;
  }
  root.classList.add('theme-fade');
  start.call(document, run).finished.finally(() => root.classList.remove('theme-fade'));
}
