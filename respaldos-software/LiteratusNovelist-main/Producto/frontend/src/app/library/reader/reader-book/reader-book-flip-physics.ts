/**
 * Movimiento de la hoja que se da vuelta (funciones puras; las prueba reader-book-flip-physics.spec.ts).
 *
 * Lo que se anima es la esquina de la hoja (ver reader-book-fold.ts), con un resorte sin rebote en
 * cada eje: parte desde donde esté y con la velocidad que traiga (la del dedo al soltar), así que se
 * puede agarrar a mitad de camino y devolver sin saltos.
 */

export interface SpringState {
  /** Posición (px). */
  x: number;
  /** Velocidad (px por segundo). */
  v: number;
}

/** Respuesta del resorte (s) al pasar por clic o teclado: cuánto tarda en llegar, sin ser una duración fija. */
export const TURN_RESPONSE = 0.45;
/** En el libro delgado del celular la hoja es más angosta: un poco más ágil. */
export const TURN_RESPONSE_COMPACT = 0.4;
/** Al soltar la hoja arrastrada: ya trae impulso. */
export const RELEASE_RESPONSE = 0.36;
/** La esquina que se levanta al acercar el mouse. */
export const PEEL_RESPONSE = 0.28;

/**
 * Avanza el resorte `dt` segundos hacia `target`. Amortiguación 1 = sin rebote. Se integra en
 * pasos chicos para que un cuadro largo (pestaña en segundo plano) no lo descontrole.
 */
export function stepSpring(state: SpringState, target: number, dt: number, response = TURN_RESPONSE, damping = 1): SpringState {
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

/** Ya llegó: a menos de `tolerance` px y casi quieta (la cola final no se nota y retrasaría el texto real). */
export function isSettled(state: SpringState, target: number, tolerance = 1.5): boolean {
  return Math.abs(target - state.x) < tolerance && Math.abs(state.v) < tolerance * 25;
}

/**
 * Velocidad inicial de un giro por clic o teclado: la hoja se mueve desde el primer cuadro (no espera
 * a acelerar) pero sin pasarse del destino, que en un resorte sin rebote pasa desde ω·distancia.
 */
export function launchVelocity(from: number, to: number, response = TURN_RESPONSE): number {
  const omega = (2 * Math.PI) / Math.max(0.05, response);
  return (to - from) * omega * 0.25;
}

/** Limita la velocidad que trae el dedo hacia el destino para que el resorte no se pase (ni choque con el lomo). */
export function capVelocity(velocity: number, from: number, to: number, response = RELEASE_RESPONSE): number {
  if (!Number.isFinite(velocity)) return 0;
  const omega = (2 * Math.PI) / Math.max(0.05, response);
  const toward = Math.sign(to - from);
  const max = Math.abs(to - from) * omega * 0.9;
  return toward !== 0 && velocity * toward > max ? toward * max : velocity;
}

/** Hasta dónde llevaría el impulso (deceleración 0,99, como al soltar una lista con inercia). */
export function projectMomentum(velocity: number, decelerationRate = 0.99): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Al soltar: una sacudida decide por su sentido; si no, dónde quedaría la hoja con el impulso que
 * trae (más allá de la mitad, termina de dar vuelta). `velocity` es px/s hacia el lado que da vuelta.
 */
export function shouldCommitTurn(progress: number, velocity: number, travel: number): boolean {
  if (Math.abs(velocity) > 320) return velocity > 0;
  const projected = progress + (travel > 0 ? projectMomentum(velocity) / travel : 0);
  return projected >= 0.5;
}

/** Cuánto se levanta la esquina en un giro por clic (px): nada al empezar y al terminar, más a mitad. */
export function turnLift(progress: number, height: number): number {
  return Math.max(0, height) * 0.085 * Math.sin(Math.PI * clamp(progress, 0, 1));
}

export interface FoldShading {
  /** Sombra de la curva sobre la página de abajo. */
  cast: number;
  /** Brillo y sombra de la curva del papel junto al pliegue. */
  curl: number;
  /** El reverso queda algo más en sombra que el frente. */
  dim: number;
  /** Sombra de la solapa sobre lo que tapa. */
  drop: number;
}

/** Luz y sombra según cuánto se dio vuelta la hoja: nada con la hoja plana, más fuerte en medio. */
export function foldShading(progress: number): FoldShading {
  const lift = Math.sin(Math.PI * clamp(progress, 0, 1));
  return {
    cast: Math.min(1, 2.2 * lift),
    curl: Math.min(1, 2.2 * lift),
    dim: 0.1 * lift,
    drop: Math.min(1, 1.8 * lift),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
