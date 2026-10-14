/**
 * Teclado en pantalla del celular.
 *
 * - `--kb-inset` (en <html>): cuánto tapa el teclado el fondo de la pantalla. En iOS el teclado
 *   no achica la página, así que lo fijo abajo (el Asistente a pantalla completa) usa
 *   `bottom: var(--kb-inset)` para quedar sobre él. En Android, con
 *   `interactive-widget=resizes-content` en el viewport, la página ya se achica y vale 0.
 * - `--vv-top`: cuánto bajó iOS la vista al enfocar un campo (lo fijo arriba se corre igual).
 * - `body.keyboard-open`: hay un campo de texto enfocado en una pantalla táctil; la barra
 *   inferior se esconde para no quedar flotando sobre el teclado.
 *
 * Se llama una vez al iniciar la app, fuera de Angular (no necesita detección de cambios).
 */
export function watchKeyboard(): void {
  const root = document.documentElement;
  const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;

  const isTextField = (el: Element | null): boolean =>
    el instanceof HTMLElement &&
    (el.isContentEditable ||
      el.matches('textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]):not([type=file])'));

  document.addEventListener('focusin', event => {
    if (coarse?.matches && isTextField(event.target as Element)) document.body.classList.add('keyboard-open');
  });
  document.addEventListener('focusout', () => {
    // El foco puede pasar de un campo a otro: se mira después de que termine de moverse.
    setTimeout(() => {
      if (!isTextField(document.activeElement)) document.body.classList.remove('keyboard-open');
    });
  });

  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
