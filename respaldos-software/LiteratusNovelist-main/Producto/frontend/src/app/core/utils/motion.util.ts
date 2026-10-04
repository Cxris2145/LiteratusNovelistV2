/**
 * true si la persona pidió reducir el movimiento. Sin `matchMedia` (pruebas, SSR) se asume
 * que sí, para que ninguna animación decorativa dependa de una API ausente.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** true si alguna parte del elemento está dentro del viewport. */
export function isInViewport(el: Element | null | undefined): el is Element {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}
