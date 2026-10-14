/**
 * Cuaderno flotante: tipos compartidos. Este archivo no importa el editor (TipTap) para que el
 * botón del cuaderno no sume peso a la carga inicial de la app.
 */

export interface NotebookTabMeta {
  id: string;
  title: string;
  position: number;
  /** Libro de la biblioteca (UserInventory) si es la pestaña de un libro; null si es libre. */
  inventory: string | null;
  book_title: string;
  revision: number;
  updated_at: string;
}

/** Un trazo del dibujo. Coordenadas y grosor van en proporción al ancho de la hoja. */
export interface NotebookStroke {
  /** Color #rrggbb. */
  c: string;
  /** Grosor. */
  w: number;
  /** Opacidad (el marcador es translúcido). */
  o?: number;
  /** Puntos [x, y, presión]. */
  p: number[][];
}

export interface NotebookTab extends NotebookTabMeta {
  /** Documento del editor (JSON de TipTap); {} si está vacío. */
  content: Record<string, unknown>;
  drawing: NotebookStroke[];
}

export interface NotebookPassage {
  chapter_id: string;
  chapter_index: number;
  chapter_title: string;
}

export interface NotebookHighlight extends NotebookPassage {
  id: string;
  start_word: number;
  end_word: number;
  text: string;
  color: 'gold' | 'blue' | 'green' | 'pink';
}

export interface NotebookPostIt extends NotebookPassage {
  id: string;
  word: number;
  text: string;
  context: string;
}

export interface NotebookWord {
  id: string;
  word: string;
  definition: string;
  context: string;
  is_learned: boolean;
  chapter_title: string;
}

/** Lo que el cuaderno reúne de un libro: subrayados, post-its y palabras guardadas. */
export interface NotebookDigest {
  inventory_id: string;
  book_title: string;
  book_author: string;
  highlights: NotebookHighlight[];
  post_its: NotebookPostIt[];
  words: NotebookWord[];
}

export type NotebookSaveState = 'saved' | 'pending' | 'saving' | 'offline' | 'conflict' | 'error';

export type NotebookVisibility = 'closed' | 'open' | 'minimized';

/** Preferencias de "Ver", como en el Bloc de notas: valen para todas las pestañas. */
export interface NotebookPrefs {
  font: string;
  size: number;
  zoom: number;
  paper: 'theme' | 'light';
}

/** Posición y tamaño de la ventana en el escritorio (en el celular va a pantalla completa). */
export interface NotebookGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
}
