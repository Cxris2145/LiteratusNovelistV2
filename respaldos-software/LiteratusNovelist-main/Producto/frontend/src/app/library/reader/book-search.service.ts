import { Injectable, OnDestroy } from '@angular/core';

import {
  ChapterSearchIndex, MatchSnippet, buildChapterIndex, buildSearchPattern, forEachMatch, queryTerms, snippetAround,
} from '../../core/utils/book-search.util';

export interface BookSearchResult {
  chapterIndex: number;
  firstWord: number;
  lastWord: number;
  snippet: MatchSnippet;
}

export interface BookSearchGroup {
  chapterIndex: number;
  title: string;
  /** Coincidencias del capítulo (todas, aunque la lista muestre menos). */
  count: number;
  /** Posición en `results` de la primera y de las siguientes coincidencias del capítulo. */
  resultIndexes: number[];
}

/** Lugar del libro: capítulo (índice) y palabra (`word-N`). */
export interface BookSearchPlace {
  chapterIndex: number;
  wordIdx: number;
}

/**
 * Búsqueda dentro del libro abierto. Se provee en el lector, así el índice vive y se
 * libera con él. El índice se arma una vez, por tramos, para no congelar la pantalla en
 * los libros largos; el panel y la barra de resultados comparten este estado.
 */
@Injectable()
export class BookSearchService implements OnDestroy {
  static readonly MIN_QUERY = 2;
  static readonly MAX_RESULTS = 500;
  /** Cuánto HTML se procesa antes de devolverle el control al navegador. */
  private static readonly CHUNK_CHARS = 200_000;

  state: 'idle' | 'indexing' | 'ready' = 'idle';
  progress = 0;

  query = '';
  wholeWord = false;
  results: BookSearchResult[] = [];
  groups: BookSearchGroup[] = [];
  total = 0;
  chapterHits = 0;
  /** Resultado que se está viendo en el libro (-1 = ninguno todavía). */
  activeIndex = -1;
  /** Dónde estaba el lector antes del primer salto, para volver (sobrevive a cambiar la consulta). */
  origin: BookSearchPlace | null = null;

  private chapters: { title?: string; content_html: string }[] = [];
  private indexes: ChapterSearchIndex[] = [];
  private building: Promise<void> | null = null;
  private buildToken = 0;

  /** Hay una búsqueda con resultados (muestra la barra para recorrerlos). */
  get isActive(): boolean {
    return this.results.length > 0;
  }

  get isTruncated(): boolean {
    return this.total > this.results.length;
  }

  /** Arma el índice de todo el libro (una sola vez por lista de capítulos). */
  prepare(chapters: { title?: string; content_html: string }[]): Promise<void> {
    if (chapters === this.chapters && this.building) return this.building;
    this.chapters = chapters;
    this.indexes = [];
    this.state = 'indexing';
    this.progress = 0;
    const token = ++this.buildToken;
    const totalChars = chapters.reduce((sum, c) => sum + (c.content_html?.length || 0), 0) || 1;

    this.building = new Promise<void>(resolve => {
      const wordCache = new Map<string, string>();
      let next = 0;
      let doneChars = 0;
      const step = () => {
        if (token !== this.buildToken) return resolve(); // se cambió de libro o se cerró el lector
        let chunk = 0;
        while (next < chapters.length && chunk < BookSearchService.CHUNK_CHARS) {
          const html = chapters[next].content_html || '';
          this.indexes[next] = buildChapterIndex(html, wordCache);
          chunk += html.length;
          doneChars += html.length;
          next++;
        }
        this.progress = Math.round((doneChars / totalChars) * 100);
        if (next < chapters.length) {
          setTimeout(step, 0);
        } else {
          this.state = 'ready';
          this.progress = 100;
          resolve();
        }
      };
      setTimeout(step, 0);
    });
    return this.building;
  }

  /** Busca en todo el libro. Devuelve false si la consulta es muy corta o el índice no está listo. */
  search(query: string, wholeWord: boolean): boolean {
    this.query = query;
    this.wholeWord = wholeWord;
    this.clearResults();
    const terms = queryTerms(query);
    if (this.state !== 'ready' || terms.join(' ').length < BookSearchService.MIN_QUERY) return false;
    const pattern = buildSearchPattern(terms, wholeWord);
    if (!pattern) return false;

    const results: BookSearchResult[] = [];
    const groups: BookSearchGroup[] = [];
    let total = 0;
    this.indexes.forEach((index, chapterIndex) => {
      const resultIndexes: number[] = [];
      const count = forEachMatch(index, pattern, match => {
        if (results.length >= BookSearchService.MAX_RESULTS) return;
        resultIndexes.push(results.length);
        results.push({
          chapterIndex,
          firstWord: match.firstWord,
          lastWord: match.lastWord,
          snippet: snippetAround(index, match),
        });
      });
      total += count;
      if (count) {
        this.chapterHits++;
        if (resultIndexes.length) {
          groups.push({ chapterIndex, title: this.chapterTitle(chapterIndex), count, resultIndexes });
        }
      }
    });
    this.results = results;
    this.groups = groups;
    this.total = total;
    return true;
  }

  /** Palabras del capítulo, para estimar la página de un resultado. */
  wordCount(chapterIndex: number): number {
    return this.indexes[chapterIndex]?.starts.length || 0;
  }

  /** Siguiente (+1) o anterior (-1) resultado, dando la vuelta al llegar al final. */
  step(delta: number): number {
    const n = this.results.length;
    if (!n) return -1;
    const from = this.activeIndex < 0 ? (delta > 0 ? -1 : 0) : this.activeIndex;
    return (from + delta + n) % n;
  }

  /** Termina la búsqueda: limpia la consulta y los resultados, pero conserva el índice. */
  reset(): void {
    this.query = '';
    this.wholeWord = false;
    this.origin = null;
    this.clearResults();
  }

  ngOnDestroy(): void {
    this.buildToken++;
    this.indexes = [];
    this.chapters = [];
    this.building = null;
  }

  private clearResults(): void {
    this.results = [];
    this.groups = [];
    this.total = 0;
    this.chapterHits = 0;
    this.activeIndex = -1;
  }

  private chapterTitle(chapterIndex: number): string {
    return this.chapters[chapterIndex]?.title || `Capítulo ${chapterIndex + 1}`;
  }
}
