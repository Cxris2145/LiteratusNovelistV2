/**
 * Medidas del libro abierto de la vista Libro: el papel de cada página, la tapa dura que asoma
 * alrededor, el grosor de los cantos de hojas y los márgenes. Funciones puras (sin Angular ni DOM):
 * las prueba reader-book-geometry.spec.ts.
 *
 * El texto lo sigue paginando reader-pager.ts dentro del papel: el libro es solo un marco.
 */

import type { ReaderMargins } from '../reader-settings';

export interface BookViewport {
  width: number;
  height: number;
  /** Páginas a la vista (lo decide columnsForViewport). */
  columns: 1 | 2;
}

export interface BookFrame {
  columns: 1 | 2;
  /** Libro delgado del celular: tapa fina, lomo a la izquierda y canto solo a la derecha. */
  compact: boolean;
  /** Papel de una página. */
  pageWidth: number;
  pageHeight: number;
  /** Tapa dura que asoma alrededor del papel. */
  board: number;
  /** Grosor máximo de los cantos de hojas de cada lado. */
  edgeMax: number;
  /** Ancho del lomo cuando el libro muestra una sola página (a su izquierda). */
  spine: number;
  /** Esquina superior izquierda del papel dentro de la ventana. */
  left: number;
  top: number;
}

/** Proporción ancho/alto de una página: de un libro de bolsillo (0,62) a uno ancho (0,8). */
export const PAGE_RATIO_MIN = 0.62;
export const PAGE_RATIO_MAX = 0.8;
/** Más ancho que esto la línea se vuelve incómoda de leer. */
const PAGE_WIDTH_MAX = 820;

/** Pantallas de teléfono (verticales o apaisadas): libro delgado a pantalla completa. */
export function isCompactBook(width: number, height: number): boolean {
  return width <= 640 || height <= 500;
}

export function bookFrame(view: BookViewport): BookFrame {
  const width = finite(view.width, 360);
  const height = finite(view.height, 640);
  const columns = view.columns === 2 ? 2 : 1;

  if (columns === 1 && isCompactBook(width, height)) {
    const board = 3;
    const edgeMax = 6;
    const spine = 4;
    return {
      columns, compact: true, board, edgeMax, spine,
      pageWidth: Math.max(200, Math.floor(width - spine - edgeMax - board)),
      pageHeight: Math.max(240, Math.floor(height - 2 * board)),
      left: spine,
      top: board,
    };
  }

  const board = 10;
  const edgeMax = 14;
  const spine = columns === 1 ? 8 : 0;
  // Aire arriba y abajo para las barras (que aparecen al tocar el centro) y a los lados para las flechas.
  const reserveY = clamp(Math.round(height * 0.075), 20, 64);
  const reserveX = width >= 900 ? 72 : 52;
  const sideFrame = columns === 2 ? 2 * (board + edgeMax) : spine + board + edgeMax + board;
  const availableHeight = Math.max(260, height - 2 * reserveY - 2 * board);
  const availableWidth = Math.max(220 * columns, width - 2 * reserveX - sideFrame);

  const pageWidth = Math.floor(Math.min(availableWidth / columns, availableHeight * PAGE_RATIO_MAX, PAGE_WIDTH_MAX));
  const pageHeight = Math.floor(Math.min(availableHeight, pageWidth / PAGE_RATIO_MIN));
  const bookWidth = pageWidth * columns;
  // Centrado en la ventana; con una sola página, el lomo queda a la izquierda y el canto a la derecha.
  const leftFrame = columns === 2 ? board + edgeMax : spine + board;
  const rightFrame = columns === 2 ? board + edgeMax : edgeMax + board;
  const left = Math.round((width - bookWidth - leftFrame - rightFrame) / 2 + leftFrame);
  const top = Math.round((height - pageHeight) / 2);
  return { columns, compact: false, board, edgeMax, spine, pageWidth, pageHeight, left, top };
}

/**
 * Márgenes del papel según el ajuste "Márgenes" de la hoja Aa: proporcionales a la página,
 * como en un libro impreso (y no a la ventana, como en la vista Páginas).
 */
export function bookMargins(frame: BookFrame, margins: ReaderMargins): { side: number; top: number; bottom: number } {
  const factor = { narrow: 0.06, normal: 0.085, wide: 0.12 }[margins] ?? 0.085;
  const min = frame.compact ? { narrow: 14, normal: 18, wide: 26 }[margins] ?? 18 : { narrow: 16, normal: 22, wide: 30 }[margins] ?? 22;
  const max = { narrow: 44, normal: 62, wide: 86 }[margins] ?? 62;
  const side = clamp(Math.round(frame.pageWidth * factor), min, max);
  const top = clamp(Math.round(frame.pageHeight * 0.075), frame.compact ? 30 : 34, 58);
  const bottom = clamp(Math.round(frame.pageHeight * 0.065), frame.compact ? 26 : 30, 50);
  return { side, top, bottom };
}

/**
 * Grosor de los cantos: el izquierdo crece con lo leído y el derecho con lo que falta. Con una sola
 * página el izquierdo es el lomo (sin canto). Siempre queda un filo de 2 px mientras haya hojas.
 */
export function bookEdges(progress: number, frame: BookFrame): { left: number; right: number } {
  const read = clamp(finite(progress, 0), 0, 1);
  const right = read >= 1 ? 0 : Math.max(2, Math.round(frame.edgeMax * (1 - read)));
  if (frame.columns === 1) return { left: 0, right };
  const left = read <= 0 ? 0 : Math.max(2, Math.round(frame.edgeMax * read));
  return { left, right };
}

/** Nombres de las variables que pone bookCssVars (para quitarlas al salir de la vista Libro). */
export const BOOK_CSS_VAR_NAMES: readonly string[] = [
  '--book-x', '--book-y', '--book-w', '--book-page-w', '--book-h', '--book-ratio', '--book-board-w', '--book-edge-max',
  '--book-edge-left', '--book-edge-right', '--book-spine', '--book-pad-top', '--book-pad-bottom', '--reader-page-margin',
];

/** Variables CSS que dibujan el libro (las lee reader-book.css). */
export function bookCssVars(frame: BookFrame, margins: ReaderMargins, progress: number): Record<string, string> {
  const m = bookMargins(frame, margins);
  const edges = bookEdges(progress, frame);
  return {
    '--book-x': `${frame.left}px`,
    '--book-y': `${frame.top}px`,
    '--book-w': `${frame.pageWidth * frame.columns}px`,
    '--book-page-w': `${frame.pageWidth}px`,
    '--book-h': `${frame.pageHeight}px`,
    // Proporción de una página (para el libro cerrado, que se achica si las barras están a la vista).
    '--book-ratio': String(Math.round((frame.pageWidth / frame.pageHeight) * 1000) / 1000),
    // Grosor de la tapa (el color es --book-board, que pone reader-book.css).
    '--book-board-w': `${frame.board}px`,
    '--book-edge-max': `${frame.edgeMax}px`,
    '--book-edge-left': `${edges.left}px`,
    '--book-edge-right': `${edges.right}px`,
    '--book-spine': `${frame.spine}px`,
    '--book-pad-top': `${m.top}px`,
    '--book-pad-bottom': `${m.bottom}px`,
    '--reader-page-margin': `${m.side}px`,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
