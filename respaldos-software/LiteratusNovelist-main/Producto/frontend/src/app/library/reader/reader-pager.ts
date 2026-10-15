/** Geometría de columnas CSS trasladadas dentro de un visor fijo. */
export interface ReaderElementRect {
  readonly left: number;
  readonly right: number;
}

export type ReaderColumns = 1 | 2;
export type ReaderPageDelta = -1 | 0 | 1;

/** Las pantallas verticales y los teléfonos apaisados conservan una sola página. */
export function columnsForViewport(width: number, height: number): ReaderColumns {
  return width >= 1000 && height > 0 && width / height >= 1.25 ? 2 : 1;
}

/** Distancia entre pliegos visibles, incluida la separación final. */
export function spreadStride(viewportWidth: number, gap: number): number {
  return Math.max(1, finite(viewportWidth)) + Math.max(0, finite(gap));
}

/** Distancia entre columnas CSS consecutivas: cada columna es una página. */
export function pageStride(viewportWidth: number, gap: number, columns: number): number {
  return spreadStride(viewportWidth, gap) / columnCount(columns);
}

/**
 * Página del capítulo, desde cero, que contiene el centro del elemento. offsetX
 * es la distancia positiva trasladada: translateX(-offsetX), incluido el arrastre.
 * viewportLeft es el origen fijo del contenido, sin el relleno exterior.
 */
export function pageOfElement(
  rect: ReaderElementRect,
  viewportLeft: number,
  offsetX: number,
  viewportWidth: number,
  gap: number,
  columns: number
): number {
  const x = (finite(rect.left) + finite(rect.right)) / 2 - finite(viewportLeft) + finite(offsetX);
  return Math.max(0, Math.floor(x / pageStride(viewportWidth, gap, columns)));
}

/** Pliego desde cero que contiene el elemento, independiente de la traslación. */
export function spreadOfElement(
  rect: ReaderElementRect,
  viewportLeft: number,
  offsetX: number,
  viewportWidth: number,
  gap: number,
  columns: number
): number {
  return Math.floor(pageOfElement(rect, viewportLeft, offsetX, viewportWidth, gap, columns) / columnCount(columns));
}

/**
 * Cantidad exacta de páginas según la extensión del contenido maquetado. Si se
 * conoce, pasar el borde derecho del último contenido sin traslación: scrollWidth
 * mide al menos el ancho del visor, incluso si una sola página ocupa un visor
 * doble. Medio píxel absorbe el redondeo de las mediciones del DOM.
 */
export function countChapterPages(
  contentWidth: number,
  viewportWidth: number,
  gap: number,
  columns: number,
  lastContentRight?: number
): number {
  const extent = Math.max(0, finite(lastContentRight ?? contentWidth));
  return Math.max(1, Math.ceil((extent + Math.max(0, finite(gap)) - 0.5) / pageStride(viewportWidth, gap, columns)));
}

/** Una página final impar ocupa un pliego sin inventar otra página. */
export function countSpreads(pages: number, columns: number): number {
  return Math.max(1, Math.ceil(Math.max(1, finite(pages)) / columnCount(columns)));
}

/** Renglones completos que caben en el alto disponible. */
export function fitLinesToPage(
  availableHeight: number,
  fontSize: number,
  lineHeight: number,
  verticalPadding: number = 0,
  minLines: number = 1
): number {
  const linePixels = Math.max(1, Math.round(finite(fontSize) * finite(lineHeight)) || 32);
  const usableHeight = Math.max(0, finite(availableHeight) - Math.max(0, finite(verticalPadding)));
  return Math.max(1, Math.floor(finite(minLines)), Math.floor(usableHeight / linePixels));
}

/** Arrastrar hacia la izquierda avanza (+1); hacia la derecha retrocede (-1). */
export function swipePageDelta(deltaX: number, elapsedMs: number, width: number): ReaderPageDelta {
  if (!Number.isFinite(deltaX) || !Number.isFinite(width) || width <= 0 || deltaX === 0) return 0;
  const distance = Math.abs(deltaX);
  const fast = Number.isFinite(elapsedMs) && elapsedMs > 0 && distance / elapsedMs > 0.5;
  return distance > width * 0.3 || fast ? deltaX < 0 ? 1 : -1 : 0;
}

function columnCount(columns: number): number {
  return Math.max(1, Math.floor(finite(columns)));
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
