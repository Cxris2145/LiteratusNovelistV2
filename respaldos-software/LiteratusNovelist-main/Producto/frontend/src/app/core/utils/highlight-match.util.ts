import { foldChar } from './book-search.util';

/**
 * Resaltado de las sugerencias del buscador del header. Busca la consulta con las mismas
 * reglas que el servidor (backend/catalog/search_suggest.py): sin tildes ni mayúsculas, la ñ
 * aparte, signos como espacio; primero al inicio, luego al inicio de una palabra y, desde tres
 * letras, en cualquier parte. Devuelve trozos del texto ORIGINAL, así se pintan con sus tildes.
 */
export interface HighlightPart {
  text: string;
  hit: boolean;
}

const CONTAINS_FROM = 3;

export function highlightMatch(text: string, query: string): HighlightPart[] {
  const plain: HighlightPart[] = text ? [{ text, hit: false }] : [];
  const q = fold(query).folded;
  if (!q || !text) return plain;

  const { folded, origin } = fold(text);
  let at = folded.startsWith(q) ? 0 : -1;
  if (at < 0) {
    const wordStart = folded.indexOf(' ' + q);
    if (wordStart >= 0) at = wordStart + 1;
  }
  if (at < 0 && q.length >= CONTAINS_FROM) at = folded.indexOf(q);
  if (at < 0) return plain;

  const start = origin[at];
  const end = origin[at + q.length - 1] + 1;
  return [
    { text: text.slice(0, start), hit: false },
    { text: text.slice(start, end), hit: true },
    { text: text.slice(end), hit: false },
  ].filter(part => part.text);
}

/** Texto plegado con los espacios colapsados y, por cada carácter, su posición en el original. */
function fold(text: string): { folded: string; origin: number[] } {
  let folded = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = foldChar(text[i]);
    if (ch === ' ' && (!folded || folded.endsWith(' '))) continue;
    folded += ch;
    origin.push(i);
  }
  if (folded.endsWith(' ')) {
    folded = folded.slice(0, -1);
    origin.pop();
  }
  return { folded, origin };
}
