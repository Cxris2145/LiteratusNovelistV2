import { chapterWords } from './chapter-parser.util';

/**
 * Búsqueda de texto dentro de un libro. Cada capítulo se convierte una vez en un índice
 * con sus palabras en el orden del lector (`word-N`, ver chapter-parser.util.ts), así que
 * cada resultado lleva directo a la palabra que se ve en pantalla.
 */

/**
 * Texto del capítulo listo para buscar. `text` son las palabras del lector unidas por un
 * espacio; `folded` es el mismo texto plegado (mismo largo, carácter por carácter), así
 * una coincidencia en `folded` se recorta tal cual de `text`.
 */
export interface ChapterSearchIndex {
  text: string;
  folded: string;
  /** Dónde empieza en `text` cada palabra `word-N`. */
  starts: Int32Array;
}

export interface ChapterMatch {
  firstWord: number;
  lastWord: number;
  /** Rango de la coincidencia en `text` (fin exclusivo). */
  start: number;
  end: number;
}

export interface MatchSnippet {
  before: string;
  match: string;
  after: string;
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}\p{M}]/u;
const charCache = new Map<string, string>();

/**
 * Un carácter plegado para comparar: minúscula y sin tilde ni diéresis (á→a, ü→u), pero la
 * ñ se conserva ("año" no es "ano"). Signos y rayas pasan a espacio. Siempre devuelve un
 * solo carácter, para que el texto plegado quede alineado con el original.
 */
export function foldChar(ch: string): string {
  let folded = charCache.get(ch);
  if (folded !== undefined) return folded;
  if (!LETTER_OR_DIGIT.test(ch)) {
    folded = ' ';
  } else {
    const lower = ch.toLowerCase();
    folded = lower === 'ñ' ? 'ñ' : (lower.normalize('NFD')[0] || ch);
    if (folded.length !== 1) folded = ch;
  }
  charCache.set(ch, folded);
  return folded;
}

export function foldText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) out += foldChar(text[i]);
  return out;
}

/** Arma el índice de un capítulo. `wordCache` reutiliza el plegado de palabras repetidas. */
export function buildChapterIndex(html: string, wordCache: Map<string, string> = new Map()): ChapterSearchIndex {
  const words = chapterWords(html);
  const starts = new Int32Array(words.length);
  const foldedWords: string[] = new Array(words.length);
  let offset = 0;
  for (let i = 0; i < words.length; i++) {
    const word = (words[i] || '').normalize('NFC');
    words[i] = word;
    let folded = wordCache.get(word);
    if (folded === undefined) {
      folded = foldText(word);
      wordCache.set(word, folded);
    }
    foldedWords[i] = folded;
    starts[i] = offset;
    offset += word.length + 1;
  }
  return { text: words.join(' '), folded: foldedWords.join(' '), starts };
}

/** Los términos de la consulta ya plegados ("¡Dulcinea del Toboso!" -> ["dulcinea", "del", "toboso"]). */
export function queryTerms(query: string): string[] {
  return foldText((query || '').normalize('NFC')).split(' ').filter(Boolean);
}

/**
 * Expresión que busca los términos seguidos, desde el inicio de una palabra. Con
 * `wholeWord` también deben terminar donde termina la palabra. Sin lookbehind: Safari
 * antiguo no lo soporta, así que el espacio previo se consume y se descuenta después.
 */
export function buildSearchPattern(terms: string[], wholeWord: boolean): RegExp | null {
  if (!terms.length) return null;
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?:^| )${escaped.join(' +')}${wholeWord ? '(?= |$)' : ''}`, 'g');
}

/** Índice de la palabra que contiene la posición `offset` de `text`. */
function wordAt(starts: Int32Array, offset: number): number {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Recorre las coincidencias de un capítulo y devuelve cuántas hubo. */
export function forEachMatch(index: ChapterSearchIndex, pattern: RegExp, onMatch: (match: ChapterMatch) => void): number {
  if (!index.starts.length) return 0;
  pattern.lastIndex = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(index.folded)) !== null) {
    const start = m.index + (m[0].startsWith(' ') ? 1 : 0);
    const end = m.index + m[0].length;
    count++;
    onMatch({ firstWord: wordAt(index.starts, start), lastWord: wordAt(index.starts, end - 1), start, end });
  }
  return count;
}

export function searchChapter(index: ChapterSearchIndex, query: string, options: { wholeWord?: boolean } = {}): ChapterMatch[] {
  const pattern = buildSearchPattern(queryTerms(query), !!options.wholeWord);
  const matches: ChapterMatch[] = [];
  if (pattern) forEachMatch(index, pattern, match => matches.push(match));
  return matches;
}

/** Fragmento alrededor de una coincidencia, con `contextWords` palabras a cada lado. */
export function snippetAround(index: ChapterSearchIndex, match: ChapterMatch, contextWords: number = 8): MatchSnippet {
  const { text, starts } = index;
  const fromWord = Math.max(0, match.firstWord - contextWords);
  const toWord = Math.min(starts.length - 1, match.lastWord + contextWords);
  const toEnd = toWord + 1 < starts.length ? starts[toWord + 1] - 1 : text.length;
  return {
    before: text.slice(starts[fromWord], match.start),
    match: text.slice(match.start, match.end),
    after: text.slice(match.end, toEnd),
  };
}
