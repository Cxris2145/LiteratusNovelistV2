import { prefersReducedMotion } from '../../core/utils/motion.util';

/**
 * Lanza gotas de tinta desde `from` hacia `to`. Sin destino, las gotas saltan y se desvanecen.
 * Solo anima transform y opacity con la Web Animations API, en una capa fija que se elimina
 * al terminar. La promesa se resuelve cuando aterriza la última gota (o de inmediato con
 * movimiento reducido). Llamar fuera de la zona de Angular.
 */
export function flyInkDrops(from: Element | null | undefined, to: Element | null | undefined, count = 10): Promise<void> {
  if (!from || prefersReducedMotion() || typeof (from as HTMLElement).animate !== 'function') return Promise.resolve();
  const start = from.getBoundingClientRect();
  const end = to?.getBoundingClientRect();
  const sx = start.left + start.width / 2;
  const sy = start.top + start.height / 2;
  const layer = document.createElement('div');
  layer.className = 'ink-burst-layer';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2000', overflow: 'hidden', contain: 'strict' });
  document.body.appendChild(layer);

  const flights: Promise<unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const size = 7 + ((i * 5) % 7);
    const drop = document.createElement('span');
    Object.assign(drop.style, {
      position: 'absolute', left: `${sx - size / 2}px`, top: `${sy - size / 2}px`,
      width: `${size}px`, height: `${size}px`, borderRadius: '50% 0 50% 50%', background: 'var(--color-warning)'
    });
    layer.appendChild(drop);
    // Abanico hacia arriba, luego caída curva hasta el destino.
    const angle = -Math.PI / 2 + (i / Math.max(1, count - 1) - 0.5) * Math.PI * 1.1;
    const reach = 48 + (i % 3) * 18;
    const bx = Math.cos(angle) * reach;
    const by = Math.sin(angle) * reach - 26;
    const tx = end ? end.left + end.width / 2 - sx : bx * 1.6;
    const ty = end ? end.top + end.height * 0.3 - sy : by - 110;
    const spin = (i % 2 ? 1 : -1) * 200;
    const flight = drop.animate([
      { transform: 'translate(0, 0) rotate(-45deg) scale(.3)', opacity: 0, easing: 'cubic-bezier(.2, .8, .3, 1)' },
      { transform: `translate(${bx}px, ${by}px) rotate(${-45 + spin / 3}deg) scale(1)`, opacity: 1, offset: 0.32, easing: 'cubic-bezier(.55, 0, .85, .4)' },
      { transform: `translate(${tx}px, ${ty}px) rotate(${-45 + spin}deg) scale(${end ? 0.45 : 0.2})`, opacity: end ? 0.9 : 0 }
    ], { duration: 950 + i * 22, delay: i * 38, fill: 'forwards' });
    flights.push(flight.finished.catch(() => undefined));
  }
  return Promise.all(flights).then(() => layer.remove());
}
