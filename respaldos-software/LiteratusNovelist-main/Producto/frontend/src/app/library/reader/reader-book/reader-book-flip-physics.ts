/**
 * Movimiento de la hoja que se dobla (funciones puras; las prueba reader-book-flip-physics.spec.ts).
 *
 * El avance se mide como un ángulo de 0° (la hoja plana en su página) a 180° (plana en la otra).
 * La hoja la mueve un resorte sin rebote: parte desde donde esté y con la velocidad que traiga
 * (la del dedo al soltar), así que se puede agarrar a mitad de camino sin saltos.
 */

export interface SpringState {
  /** Ángulo en grados. */
  x: number;
  /** Velocidad en grados por segundo. */
  v: number;
}

/**
 * Respuesta del resorte (s): cuánto tarda en llegar, sin ser una duración fija. El papel que se
 * pliega pide un poco más de tiempo que una hoja rígida para que se lea la curva (~0,6 s el giro).
 */
export const FLIP_RESPONSE = 0.55;

/**
 * Avanza el resorte `dt` segundos hacia `target`. Amortiguación 1 = sin rebote. Se integra en
 * pasos chicos para que un cuadro largo (pestaña en segundo plano) no lo descontrole.
 */
export function stepSpring(state: SpringState, target: number, dt: number, response = FLIP_RESPONSE, damping = 1): SpringState {
  const omega = (2 * Math.PI) / Math.max(0.05, response);
  const stiffness = omega * omega;
  const friction = 2 * damping * omega;
  let { x, v } = state;
  let remaining = Math.min(Math.max(0, dt), 0.25);
  while (remaining > 0) {
    const h = Math.min(remaining, 1 / 240);
    const a = stiffness * (target - x) - friction * v;
    v += a * h;
    x += v * h;
    remaining -= h;
  }
  return { x, v };
}

/** Ya llegó: a menos de un grado y medio, casi quieta (la cola final no se nota y retrasaría el texto real). */
export function isSettled(state: SpringState, target: number): boolean {
  return Math.abs(target - state.x) < 1.5 && Math.abs(state.v) < 30;
}

/**
 * Ángulo de la hoja mientras se arrastra: recorrer el ancho del libro abierto la da vuelta entera.
 * `direction` 1 = hacia adelante (se arrastra de derecha a izquierda), -1 = hacia atrás.
 */
export function dragAngle(dx: number, spreadWidth: number, direction: 1 | -1): number {
  if (!Number.isFinite(dx) || !Number.isFinite(spreadWidth) || spreadWidth <= 0) return 0;
  const travel = direction === 1 ? -dx : dx;
  return clamp((travel / spreadWidth) * 180, 0, 180);
}

/** Al soltar: una sacudida decide por su sentido; si no, pasó o no pasó la mitad. */
export function shouldCommitFlip(angle: number, velocity: number): boolean {
  if (Math.abs(velocity) > 260) return velocity > 0;
  return angle >= 90;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
