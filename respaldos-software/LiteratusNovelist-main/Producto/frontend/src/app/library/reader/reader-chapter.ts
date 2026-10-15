import { ReaderBlock, ReaderSentence, ReaderToken, parseChapterBlocks, setWordBounds, splitBionic } from '../../core/utils/chapter-parser.util';

/** Un capítulo ya analizado: lo que el lector necesita para pintarlo y narrarlo. */
export interface PreparedChapter {
  plainText: string;
  blocks: ReaderBlock[];
  titleTokens: ReaderToken[];
  wordCount: number;
}

/** Un párrafo con más caracteres que esto es "largo" (división visual opcional de Lectura asistida). */
export const LONG_PARA_CHARS = 420;

/** "Capítulo 1 - De lo que…" y "Capítulo 1 De lo que…" son el mismo título: se compara sin signos ni tildes. */
const normTitle = (text: string) => text.toLowerCase().normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Analiza el HTML de un capítulo: texto plano para la voz, bloques con sus oraciones (para resaltar
 * frase y párrafo) y el título separado del cuerpo. No toca el estado del lector, así que se puede
 * preparar por adelantado (ver ChapterCache).
 */
export function prepareChapter(html: string, title: string, backendUrl: string): PreparedChapter {
  // Las imágenes relativas apuntan al backend antes de que nadie intente cargarlas.
  const cleanHtml = html.replace(/src=(["'])(\/?)media\//g, `src=$1${backendUrl}/media/`);

  // Texto plano para la voz. Un <template> es inerte: no descarga las imágenes del capítulo.
  const inert = document.createElement('template');
  inert.innerHTML = cleanHtml;
  const plainText = inert.content.textContent || '';

  const { blocks, wordCount } = parseChapterBlocks(cleanHtml, splitBionic);
  groupSentences(blocks);
  const titleTokens = extractTitle(blocks, title);

  blocks.forEach(b => {
    if (b.tag === 'p') {
      const len = b.tokens.reduce((acc, t) => acc + (t.text?.length || 0), 0);
      b.long = len > LONG_PARA_CHARS;
    }
    setWordBounds(b);
    b.sentences?.forEach(setWordBounds);
  });

  return { plainText, blocks, titleTokens, wordCount };
}

/** Agrupa los tokens de cada bloque en oraciones (punto a punto), para el foco por frase. */
function groupSentences(blocks: ReaderBlock[]): void {
  let globalSentenceIdx = 0;
  blocks.forEach(block => {
    if (block.tag === 'img-block') return;
    const sentences: ReaderSentence[] = [];
    let currentTokens: ReaderToken[] = [];
    for (const tok of block.tokens) {
      currentTokens.push(tok);
      if ((tok.isWord && /[.!?]["'»”)]*$/.test(tok.text)) || tok.isBr) {
        sentences.push({ idx: globalSentenceIdx++, tokens: currentTokens });
        currentTokens = [];
      }
    }
    if (currentTokens.length > 0) sentences.push({ idx: globalSentenceIdx++, tokens: currentTokens });
    block.sentences = sentences;
  });
}

/**
 * Si el primer bloque empieza con el título del capítulo, lo saca para el encabezado (así no se ve
 * dos veces) y descarta los bloques siguientes que lo repiten tal cual (p. ej. "Primera Parte").
 */
function extractTitle(blocks: ReaderBlock[], title: string): ReaderToken[] {
  if (blocks.length === 0) return [];
  const firstBlock = blocks[0];
  const titleToCompare = normTitle(title);

  let accumulatedText = '';
  let splitIndex = -1;
  for (let i = 0; i < firstBlock.tokens.length; i++) {
    accumulatedText += firstBlock.tokens[i].text;
    const normalizedAccumulated = normTitle(accumulatedText);
    if (normalizedAccumulated === titleToCompare) {
      splitIndex = i + 1;
      break;
    }
    if (normalizedAccumulated.length > titleToCompare.length + 5) break; // ya se pasó del largo
  }
  if (splitIndex === -1) return [];

  const titleTokens = firstBlock.tokens.splice(0, splitIndex);
  // Espacios sobrantes al inicio del párrafo que queda
  while (firstBlock.tokens.length > 0 && !firstBlock.tokens[0].isWord && !firstBlock.tokens[0].isImg) {
    firstBlock.tokens.shift();
  }
  if (firstBlock.tokens.length === 0) blocks.shift(); // el bloque era solo el título

  const blockText = (b: ReaderBlock) => normTitle(b.tokens.map(t => t.text).join(''));
  let guard = 0;
  while (blocks.length > 0 && blocks[0].tag !== 'img-block' && blockText(blocks[0]) === titleToCompare && guard++ < 5) {
    blocks.shift();
  }
  return titleTokens;
}

/**
 * Los últimos capítulos analizados. Volver a uno o abrir el siguiente (que se prepara mientras el
 * navegador está ocioso) no lo vuelve a analizar.
 */
export class ChapterCache {
  private readonly entries = new Map<string, PreparedChapter>();

  constructor(private readonly size = 3) {}

  get(key: string, prepare: () => PreparedChapter): PreparedChapter {
    let entry = this.entries.get(key);
    if (entry) this.entries.delete(key); // vuelve a quedar como el más reciente
    else entry = prepare();
    this.entries.set(key, entry);
    while (this.entries.size > this.size) this.entries.delete(this.entries.keys().next().value!);
    return entry;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }
}
