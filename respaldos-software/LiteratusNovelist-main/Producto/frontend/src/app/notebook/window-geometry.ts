import { NotebookGeometry } from './notebook.models';

export const MIN_WIDTH = 360;
export const MIN_HEIGHT = 300;
/** Lo que siempre queda a la vista de la barra de título, para poder volver a arrastrarla. */
const GRIP = 96;

export interface Viewport {
  w: number;
  h: number;
}

/** Tamaño cómodo al abrir por primera vez: abajo a la derecha, junto al botón del cuaderno. */
export function defaultGeometry(viewport: Viewport): NotebookGeometry {
  const w = Math.min(780, viewport.w - 48);
  const h = Math.min(580, viewport.h - 120);
  return clampGeometry({ x: viewport.w - w - 104, y: viewport.h - h - 32, w, h, maximized: false }, viewport);
}

/**
 * Mantiene la ventana dentro de la pantalla aunque cambie de tamaño (otra pantalla, rotación):
 * nunca más grande que la pantalla y con la barra de título alcanzable.
 */
export function clampGeometry(geometry: NotebookGeometry, viewport: Viewport): NotebookGeometry {
  const w = Math.round(Math.min(Math.max(geometry.w, MIN_WIDTH), Math.max(MIN_WIDTH, viewport.w - 16)));
  const h = Math.round(Math.min(Math.max(geometry.h, MIN_HEIGHT), Math.max(MIN_HEIGHT, viewport.h - 16)));
  const x = Math.round(Math.min(Math.max(geometry.x, GRIP - w), viewport.w - GRIP));
  const y = Math.round(Math.min(Math.max(geometry.y, 0), viewport.h - 48));
  return { x, y, w, h, maximized: !!geometry.maximized };
}

/** Lee una geometría guardada; si no sirve, devuelve null para usar la predeterminada. */
export function parseGeometry(value: unknown): NotebookGeometry | null {
  if (!value || typeof value !== 'object') return null;
  const g = value as Record<string, unknown>;
  const numbers = ['x', 'y', 'w', 'h'].every(key => typeof g[key] === 'number' && Number.isFinite(g[key] as number));
  return numbers ? { x: g['x'] as number, y: g['y'] as number, w: g['w'] as number, h: g['h'] as number,
                     maximized: g['maximized'] === true } : null;
}
