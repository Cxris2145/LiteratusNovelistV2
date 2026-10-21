/**
 * Geometría del pliegue de la hoja que se da vuelta (funciones puras; las prueba reader-book-fold.spec.ts).
 *
 * Se trabaja en coordenadas "de la hoja": el lomo es x = 0 y la página va de x = 0 a x = w (hacia
 * afuera), de y = 0 (arriba) a y = h. Se tira de una esquina del borde de afuera (arriba o abajo):
 * la esquina se mueve, y el pliegue es la línea que queda a mitad de camino entre donde estaba la
 * esquina y donde está ahora (la mediatriz). Lo que queda más allá del pliegue se refleja sobre él
 * y muestra el reverso de la hoja. Quien dibuja (reader-book-flip.ts) refleja estas coordenadas para
 * la hoja izquierda y las pasa a la capa.
 */

export interface Vec {
  x: number;
  y: number;
}

/** Transformación afín 2D en el orden de CSS matrix(a, b, c, d, e, f): x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = readonly [number, number, number, number, number, number];

export type FoldCorner = 'top' | 'bottom';

export interface LeafSize {
  w: number;
  h: number;
}

export interface Fold {
  /** Esquina ya limitada (la hoja no se rasga ni se despega del lomo). */
  corner: Vec;
  /** Un punto del pliegue (el medio entre la esquina en reposo y la esquina movida). */
  mid: Vec;
  /** Normal del pliegue, de largo 1, hacia el lado que todavía no se dio vuelta (afuera). */
  normal: Vec;
  /** Distancia del pliegue a la esquina en reposo (cuánto de la hoja está doblado). */
  depth: number;
  /** 0 = la hoja plana en su página, 1 = plana del otro lado del lomo. */
  progress: number;
}

/** Esquina de la hoja en reposo. */
export function restCorner(leaf: LeafSize, corner: FoldCorner): Vec {
  return { x: leaf.w, y: corner === 'bottom' ? leaf.h : 0 };
}

/** Esquina con la hoja dada vuelta del todo (sobre la otra página). */
export function turnedCorner(leaf: LeafSize, corner: FoldCorner): Vec {
  return { x: -leaf.w, y: corner === 'bottom' ? leaf.h : 0 };
}

/**
 * La hoja está cosida al lomo: la esquina no puede alejarse del pie (o la cabeza) del lomo más que el
 * ancho de la página, ni del otro extremo del lomo más que la diagonal. Tampoco se hunde bajo el libro.
 */
export function constrainCorner(point: Vec, leaf: LeafSize, corner: FoldCorner): Vec {
  const nearSpine = { x: 0, y: corner === 'bottom' ? leaf.h : 0 };
  const farSpine = { x: 0, y: corner === 'bottom' ? 0 : leaf.h };
  const diagonal = Math.hypot(leaf.w, leaf.h);
  let p = { x: finite(point.x, leaf.w), y: finite(point.y, nearSpine.y) };
  p.y = corner === 'bottom' ? Math.min(p.y, leaf.h) : Math.max(p.y, 0);
  // Dos pasadas: al acercarla a un extremo del lomo puede quedar lejos del otro.
  for (let i = 0; i < 2; i++) {
    p = withinReach(p, nearSpine, leaf.w);
    p = withinReach(p, farSpine, diagonal);
  }
  return p;
}

/** El pliegue para la esquina `point` (se limita antes con constrainCorner). */
export function foldFor(point: Vec, leaf: LeafSize, corner: FoldCorner): Fold {
  const rest = restCorner(leaf, corner);
  const c = constrainCorner(point, leaf, corner);
  const dx = rest.x - c.x;
  const dy = rest.y - c.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.01) {
    // Plana: el "pliegue" queda en el borde de afuera y no dobla nada.
    return { corner: rest, mid: rest, normal: { x: 1, y: 0 }, depth: 0, progress: 0 };
  }
  return {
    corner: c,
    mid: { x: (rest.x + c.x) / 2, y: (rest.y + c.y) / 2 },
    normal: { x: dx / length, y: dy / length },
    depth: length / 2,
    progress: clamp((rest.x - c.x) / (2 * leaf.w), 0, 1),
  };
}

/**
 * Esquina mientras se arrastra: se mueve con el dedo (`delta`) multiplicado por `gain`. Con gain 1
 * la esquina queda bajo el dedo (se agarró la esquina); con 2 el pliegue sigue al dedo (se agarró
 * lejos del borde, o la hoja entra desde el lomo).
 */
export function dragCorner(start: Vec, delta: Vec, gain: number, leaf: LeafSize, corner: FoldCorner): Vec {
  return constrainCorner({ x: start.x + gain * delta.x, y: start.y + gain * delta.y }, leaf, corner);
}

/** Cuánto sigue la esquina al dedo según dónde se agarró la hoja (distancia al borde de afuera). */
export function dragGain(grabX: number, leaf: LeafSize): number {
  return 1 + clamp((leaf.w - grabX) / (leaf.w * 0.5), 0, 1);
}

// ── Transformaciones afines ──────────────────────────────────────────────

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export function translate(x: number, y: number): Affine {
  return [1, 0, 0, 1, x, y];
}

export function scale(x: number, y: number): Affine {
  return [x, 0, 0, y, 0, 0];
}

/** Giro que lleva el eje x a la dirección (cos, sin) (de largo 1). */
export function rotation(cos: number, sin: number): Affine {
  return [cos, sin, -sin, cos, 0, 0];
}

/** Reflejo sobre la recta que pasa por `point` con normal `normal` (de largo 1). */
export function reflection(point: Vec, normal: Vec): Affine {
  const { x: nx, y: ny } = normal;
  const k = 2 * (point.x * nx + point.y * ny);
  return [1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny, k * nx, k * ny];
}

/** Composición de derecha a izquierda: compose(m, n)(p) = m(n(p)). */
export function compose(...ms: Affine[]): Affine {
  return ms.reduce((m, n) => {
    const [a1, b1, c1, d1, e1, f1] = m;
    const [a2, b2, c2, d2, e2, f2] = n;
    return [
      a1 * a2 + c1 * b2, b1 * a2 + d1 * b2,
      a1 * c2 + c1 * d2, b1 * c2 + d1 * d2,
      a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1,
    ] as Affine;
  }, IDENTITY);
}

export function invert(m: Affine): Affine {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c || 1e-9;
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}

export function apply(m: Affine, p: Vec): Vec {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Para style.transform (con transform-origin: 0 0). */
export function toCss(m: Affine): string {
  const r = (v: number, digits: number) => (Math.abs(v) < 1e-9 ? 0 : +v.toFixed(digits));
  return `matrix(${r(m[0], 5)},${r(m[1], 5)},${r(m[2], 5)},${r(m[3], 5)},${r(m[4], 2)},${r(m[5], 2)})`;
}

function withinReach(p: Vec, anchor: Vec, reach: number): Vec {
  const dx = p.x - anchor.x;
  const dy = p.y - anchor.y;
  const d = Math.hypot(dx, dy);
  if (d <= reach || d === 0) return p;
  return { x: anchor.x + (dx / d) * reach, y: anchor.y + (dy / d) * reach };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
