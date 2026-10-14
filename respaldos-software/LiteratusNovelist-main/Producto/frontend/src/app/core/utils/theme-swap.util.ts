/**
 * Cambia de paleta de una sola vez.
 *
 * Sin esto, al cambiar el tema cientos de elementos (header, menús, botones; en el lector, el
 * lienzo con miles de palabras) animan su color y fondo a la vez: el navegador repinta toda la
 * página en cada cuadro durante 0,2–0,3 s. Aquí las transiciones se apagan mientras se aplica
 * el tema (html.theme-switching, ver styles.css) y, si el navegador lo permite, la página hace
 * un fundido corto con View Transitions, que la GPU pinta como una sola imagen.
 */
let activeFades = 0;

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

  const start = (document as any).startViewTransition as
    ((cb: () => void) => { ready: Promise<void>; finished: Promise<void> }) | undefined;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!start || reduceMotion || document.visibilityState !== 'visible') {
    run();
    return;
  }
  // Con dos cambios seguidos, el primer fundido termina (se omite) mientras corre el segundo:
  // solo el último quita la clase.
  root.classList.add('theme-fade');
  activeFades++;
  const transition = start.call(document, run);
  // Un fundido omitido rechaza `ready` con AbortError; sin este catch llegaba como
  // promesa no atendida y mostraba el aviso rojo de error global.
  transition.ready.catch(() => {});
  transition.finished.finally(() => {
    if (--activeFades === 0) root.classList.remove('theme-fade');
  });
}
