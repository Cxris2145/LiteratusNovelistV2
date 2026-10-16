import { animate, animateChild, query, style, transition, trigger } from '@angular/animations';

import { prefersReducedMotion } from '../core/utils/motion.util';

/** Curva de salida fuerte de la Taberna (la misma que --ease-out de styles.css). */
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Filas que llegan y se van (invitaciones a la mesa, solicitudes de amistad): entran bajando un
 * poco y se van fundiéndose mientras su alto se cierra, así lo de abajo no salta.
 * Con "reducir movimiento" entran y salen solo con opacidad.
 */
export const listItemMotion = trigger('listItem', [
  transition(':enter', [
    style({ opacity: 0, transform: '{{ from }}' }),
    animate(`240ms ${EASE_OUT}`, style({ opacity: 1, transform: 'none' })),
  ], { params: { from: 'translateY(-6px)' } }),
  transition(':leave', [
    style({ overflow: 'hidden' }),
    animate(`180ms ${EASE_OUT}`, style({
      opacity: 0, height: '{{ collapse }}', paddingTop: '{{ collapse }}', paddingBottom: '{{ collapse }}',
      marginTop: '{{ collapse }}', marginBottom: '{{ collapse }}', borderWidth: '{{ collapse }}',
    })),
  ], { params: { collapse: 0 } }),
]);

/** El contenedor deja terminar la salida de sus filas antes de irse (cuando se va la última). */
export const listContainerMotion = trigger('listContainer', [
  transition(':leave', [query('@listItem', animateChild(), { optional: true })]),
]);

/** Parámetros de `listItemMotion` según la preferencia de movimiento de la persona. */
export function listItemParams(): { value: string; params: { from: string; collapse: string | number } } {
  return prefersReducedMotion()
    ? { value: 'soft', params: { from: 'none', collapse: '*' } }
    : { value: 'full', params: { from: 'translateY(-6px)', collapse: 0 } };
}

/**
 * Cambio grande de distribución (modo cine) con View Transitions: la mesa crece desde su lugar y
 * lo demás se funde. Mismo patrón que core/utils/theme-swap.util.ts: sin la API, con la pestaña
 * oculta o si el cambio se interrumpe, se aplica directo. Las curvas viven en styles.css
 * (html.tavern-morph).
 */
export function morphLayout(apply: () => void): void {
  const start = (document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
  }).startViewTransition;
  if (!start || document.visibilityState !== 'visible') {
    apply();
    return;
  }
  const root = document.documentElement;
  const classes = prefersReducedMotion() ? ['tavern-morph', 'tavern-morph-reduced'] : ['tavern-morph'];
  root.classList.add(...classes);
  const transitionRef = start.call(document, apply);
  // Una transición omitida rechaza `ready` con AbortError: no es un error de la página.
  transitionRef.ready.catch(() => {});
  transitionRef.finished.finally(() => root.classList.remove(...classes));
}
