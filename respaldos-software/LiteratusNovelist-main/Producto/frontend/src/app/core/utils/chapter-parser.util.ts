/**
 * Convierte el HTML de un capítulo en bloques (párrafos, títulos, imágenes) con sus
 * palabras numeradas en orden. El número de cada palabra es su id en el lector
 * (`word-N`): lo usan el resaltado de la narración, los marcadores y el vocabulario.
 *
 * El backend replica este mismo recorrido en `catalog/narration.py::chapter_words`
 * para que los tiempos de la voz neural caigan en la palabra correcta: si cambias
 * qué texto se muestra o cómo se numera, cambia también ese archivo.
 */

export interface ReaderToken {
  text: string;
  isWord: boolean;
  isImg: boolean;
  isBr?: boolean;
  idx: number;
  src?: string;
  alt?: string;
  bionicBold?: string;
  bionicNormal?: string;
  /** Color del subrayado del lector en esta palabra. */
  hl?: string | null;
}

/** Primera y última palabra (`word-N`) de un grupo de tokens; -1 si no tiene palabras. */
export interface WordBounds {
  firstWord?: number;
  lastWord?: number;
}

export interface ReaderSentence extends WordBounds {
  idx: number;
  tokens: ReaderToken[];
}

export interface ReaderBlock extends WordBounds {
  tag: string;
  tokens: ReaderToken[];
  long?: boolean;
  sentences?: ReaderSentence[];
}

/** Calcula una vez los límites que el lector consulta en cada detección de cambios. */
export function setWordBounds(group: WordBounds & { tokens: ReaderToken[] }): void {
  let first = -1, last = -1;
  for (const tok of group.tokens) {
    if (!tok.isWord) continue;
    if (first < 0) first = tok.idx;
    last = tok.idx;
  }
  group.firstWord = first;
  group.lastWord = last;
}

type BionicSplit = (word: string) => { bold: string; normal: string };

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'ul', 'ol', 'section', 'article', 'figure']);

/**
 * Un bloque solo cuenta si tiene contenido real (palabra, imagen o salto de línea).
 * Sin este filtro, envoltorios vacíos del HTML fuente (p.ej. spans de seguimiento de
 * MediaWiki/Wikisource como <span about="#mwt1">\n</span>, que solo contienen espacio
 * en blanco) generan un bloque "fantasma" sin texto visible que rompe la extracción
 * del título del capítulo en el lector.
 */
const hasMeaningfulContent = (tokens: ReaderToken[]) => tokens.some(t => t.isWord || t.isImg || t.isBr);

export function parseChapterBlocks(html: string, bionicSplit?: BionicSplit): { blocks: ReaderBlock[]; wordCount: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: ReaderBlock[] = [];
  let wordIdx = 0;

  const tokenizeInline = (node: Node): ReaderToken[] => {
    const tokens: ReaderToken[] = [];
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        (child.textContent || '').split(/(\s+)/).forEach(part => {
          if (part.trim().length > 0) {
            const split = bionicSplit ? bionicSplit(part) : undefined;
            tokens.push({
              text: part, isWord: true, isImg: false, isBr: false, idx: wordIdx++,
              bionicBold: split?.bold, bionicNormal: split?.normal,
            });
          } else if (part.length > 0) {
            tokens.push({ text: part, isWord: false, isImg: false, isBr: false, idx: -1 });
          }
        });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === 'img') {
          const img = el as HTMLImageElement;
          tokens.push({
            text: '', isWord: false, isImg: true, isBr: false, idx: -1,
            src: img.src || img.getAttribute('src') || '', alt: img.alt || '',
          });
        } else if (tag === 'br') {
          tokens.push({ text: '', isWord: false, isImg: false, isBr: true, idx: -1 });
        } else {
          tokens.push(...tokenizeInline(child));
        }
      }
    });
    return tokens;
  };

  const parseNode = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      if (tag === 'img') {
        const img = el as HTMLImageElement;
        blocks.push({
          tag: 'img-block',
          tokens: [{ text: '', isWord: false, isImg: true, idx: -1, src: img.src || img.getAttribute('src') || '', alt: img.alt || '' }],
        });
      } else if (BLOCK_TAGS.has(tag)) {
        const hasBlockChildren = Array.from(el.children).some(c => BLOCK_TAGS.has(c.tagName.toLowerCase()));
        if (hasBlockChildren) {
          el.childNodes.forEach(child => parseNode(child));
        } else {
          const tokens = tokenizeInline(el);
          if (hasMeaningfulContent(tokens)) {
            blocks.push({ tag: tag === 'div' || tag === 'figure' ? 'p' : tag, tokens });
          }
        }
      } else {
        const tokens = tokenizeInline(node);
        if (hasMeaningfulContent(tokens)) blocks.push({ tag: 'p', tokens });
      }
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      const tokens = tokenizeInline(node);
      if (hasMeaningfulContent(tokens)) blocks.push({ tag: 'p', tokens });
    }
  };

  doc.body.childNodes.forEach(child => parseNode(child));
  return { blocks, wordCount: wordIdx };
}

/** Las palabras del capítulo en el orden (e índice) del lector. */
export function chapterWords(html: string): string[] {
  const words: string[] = [];
  for (const block of parseChapterBlocks(html).blocks) {
    for (const token of block.tokens) {
      if (token.isWord) words[token.idx] = token.text;
    }
  }
  return words;
}

/**
 * Partes alfabéticas de una palabra del lector, en minúsculas: "¡Hola!" -> ["hola"],
 * "dijo—¿Quién?" -> ["dijo", "quién"]. Así se comparan con las formas del vocabulario.
 */
export function wordLetterRuns(word: string): string[] {
  return word.toLowerCase().match(/[\p{L}]+/gu) || [];
}
