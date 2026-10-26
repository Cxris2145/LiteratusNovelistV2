/**
 * Geometría de la hoja que se pliega (funciones puras; las prueba reader-book-fold.spec.ts).
 *
 * La hoja no gira rígida sobre el lomo: se dobla como el papel. Su esquina exterior (la de abajo o
 * la de arriba) viaja en arco hasta el otro lado del libro y la hoja se pliega por la mediatriz entre
 * esa esquina en reposo y donde está ahora. Lo que queda del lado del lomo es el anverso, recortado;
 * lo que pasa del pliegue se refleja sobre él y deja ver el reverso.
 *
 * Coordenadas del libro abierto, en px: x de 0 a 2·w (el lomo en w), y de 0 (arriba) a h.
 */

export interface Point {
  x: number;
  y: number;
}

/** Esquina por la que se toma la hoja. */
export type FoldCorner = 'bottom' | 'top';

/** Cuánto se levanta la esquina a mitad de camino, relativo al ancho de la página. */
export const FOLD_LIFT = 0.38;

export interface Fold {
  /** Borde izquierdo de la hoja (su página) y del reverso (la página donde termina apoyado). */
  leafLeft: number;
  backLeft: number;
  /** Anverso que sigue en su página. */
  front: Point[];
  /** Parte de la hoja que pasó del pliegue, en su lugar: ahí se ve la página de abajo. */
  uncovered: Point[];
  /** Esa misma parte ya doblada: la solapa, que muestra el reverso. */
  flap: Point[];
  /** La solapa en coordenadas del reverso (su página con origen arriba a la izquierda). */
  backClip: Point[];
  /** Un punto del pliegue y su normal unitaria, que apunta hacia la parte que se dobla. */
  crease: Point;
  normal: Point;
  /** Distancia de la esquina a su lugar de reposo, en px (0 = hoja plana). */
  reach: number;
  /**
   * matrix() de CSS que lleva el reverso (puesto en su página final, transform-origin 0 0) hasta la
   * solapa. Son dos reflexiones seguidas (el lomo y el pliegue): una rotación, sin texto espejado.
   */
  backMatrix: [number, number, number, number, number, number];
}

/**
 * La hoja plegada en `progress` (0 = plana en su página, 1 = plana en la otra). `direction` 1 da
 * vuelta la página derecha hacia adelante; -1, la izquierda hacia atrás.
 */
export function foldAt(progress: number, direction: 1 | -1, corner: FoldCorner, w: number, h: number): Fold {
  const p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  const leafLeft = direction === 1 ? w : 0;
  const backLeft = direction === 1 ? 0 : w;
  const rect = [pt(leafLeft, 0), pt(leafLeft + w, 0), pt(leafLeft + w, h), pt(leafLeft, h)];

  const rest = pt(direction === 1 ? 2 * w : 0, corner === 'bottom' ? h : 0);
  // La esquina avanza hacia el otro lado y sube (o baja, si es la de arriba) en arco: con el arco
  // a lo sumo del ancho de la página, el lomo nunca queda del lado que se dobla.
  const lift = Math.min(FOLD_LIFT * w, h / 2) * Math.sin(Math.PI * p);
  const tip = pt(rest.x - direction * 2 * w * p, rest.y + (corner === 'bottom' ? -lift : lift));
  const reach = Math.hypot(rest.x - tip.x, rest.y - tip.y);

  if (reach < 0.5) {
    return {
      leafLeft, backLeft, front: rect, uncovered: [], flap: [], backClip: [],
      crease: rest, normal: pt(direction, 0), reach: 0, backMatrix: [1, 0, 0, 1, 0, 0],
    };
  }

  const normal = pt((rest.x - tip.x) / reach, (rest.y - tip.y) / reach);
  const crease = pt((rest.x + tip.x) / 2, (rest.y + tip.y) / 2);
  const side = (q: Point) => (q.x - crease.x) * normal.x + (q.y - crease.y) * normal.y;
  const reflect = (q: Point) => {
    const s = 2 * side(q);
    return pt(q.x - s * normal.x, q.y - s * normal.y);
  };

  const front = clipHalfPlane(rect, q => -side(q));
  const uncovered = clipHalfPlane(rect, side);
  const flap = uncovered.map(reflect);
  // Un punto de la hoja a distancia d del lomo es, en el reverso, el que queda a d del lomo del otro lado.
  const backClip = uncovered.map(q => pt(2 * w - q.x - backLeft, q.y));

  // Reverso → hoja (reflejo en el lomo) → solapa (reflejo en el pliegue), en una sola matriz.
  const { x: nx, y: ny } = normal;
  const r11 = 1 - 2 * nx * nx;
  const r12 = -2 * nx * ny;
  const r22 = 1 - 2 * ny * ny;
  const k = 2 * (nx * crease.x + ny * crease.y);
  const shift = 2 * w - backLeft;
  const backMatrix: Fold['backMatrix'] = [
    -r11, -r12, r12, r22,
    r11 * shift + k * nx - backLeft,
    r12 * shift + k * ny,
  ];

  return { leafLeft, backLeft, front, uncovered, flap, backClip, crease, normal, reach, backMatrix };
}

/**
 * Fuerza de las sombras del pliegue (0 a 1): nace apenas se levanta la esquina y se apaga al
 * apoyarse, así el último cuadro es igual a la página quieta.
 */
export function foldShadow(progress: number): number {
  const p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  return clamp(Math.sin(Math.PI * p) * 1.6, 0, 1);
}

/** Lo que queda de un polígono convexo del lado donde `keep` es ≥ 0 (Sutherland–Hodgman). */
export function clipHalfPlane(polygon: Point[], keep: (q: Point) => number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const fa = keep(a);
    const fb = keep(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push(pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
    }
  }
  return out;
}

function pt(x: number, y: number): Point {
  return { x, y };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
