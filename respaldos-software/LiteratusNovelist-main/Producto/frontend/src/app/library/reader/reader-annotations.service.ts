import { Injectable, inject } from '@angular/core';
import { Observable, Subject, map, tap } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { HighlightColor } from './reader-settings';

/** Marcador de página guardado en el backend (UserBookmark). */
export interface PageBookmark {
  id: string;
  chapterId: string;
  chapterIndex: number;
  /** Primera palabra visible de la página marcada (`word-N`). */
  wordIdx: number;
  snippet: string;
  createdAt: string;
  /** "Pág. 34": se calcula al abrir el índice (medir cada vez que Angular revisa la vista sería caro). */
  pageLabel?: string;
}

/** Pasaje subrayado guardado en el backend (UserHighlight). */
export interface ReaderHighlight {
  id: string;
  chapter: string;
  start_word: number;
  end_word: number;
  text: string;
  color: HighlightColor;
}

/** Post-it en el margen, anclado a una palabra de su línea (UserPostIt). Sin `id` = recién creado, sin guardar. */
export interface ReaderPostIt {
  id: string;
  chapter: string;
  word: number;
  text: string;
}

export type AnnotationKind = 'bookmarks' | 'highlights' | 'postits';

/**
 * Marcadores, subrayados y post-its del libro abierto: los datos y sus llamadas al servidor.
 * Lo que se ve (cinta, colores en las palabras, papelitos en el margen) lo arman el lector y sus
 * componentes. Se provee en ReaderComponent: cada libro abierto tiene los suyos.
 */
@Injectable()
export class ReaderAnnotationsService {
  private readonly api = inject(ApiService);

  readonly maxPostIts = 30;
  bookmarks: PageBookmark[] = [];
  highlights: ReaderHighlight[] = [];
  postIts: ReaderPostIt[] = [];
  /** Avisa qué terminó de cargarse al abrir el libro. */
  readonly loaded$ = new Subject<AnnotationKind>();

  private inventoryId = '';
  private chapters: { id: string | number }[] = [];
  private postItsMemo: { source: ReaderPostIt[]; chapterId: unknown; list: ReaderPostIt[] } | null = null;

  /** Libro abierto (con sus capítulos ya cargados): trae sus marcadores, subrayados y post-its. */
  load(inventoryId: string, chapters: { id: string | number }[]): void {
    this.inventoryId = inventoryId;
    this.chapters = chapters;
    if (!inventoryId) return;
    this.api.get<any[]>(`library/bookmarks/?inventory=${inventoryId}`).subscribe({
      next: rows => {
        this.bookmarks = (Array.isArray(rows) ? rows : [])
          .map(row => this.toPageBookmark(row))
          .filter((b): b is PageBookmark => b !== null)
          .sort(byPosition);
        this.loaded$.next('bookmarks');
      },
      error: err => console.warn('No se pudieron cargar los marcadores', err),
    });
    this.api.get<ReaderHighlight[]>(`library/highlights/?inventory=${inventoryId}`).subscribe({
      next: list => {
        this.highlights = list || [];
        this.loaded$.next('highlights');
      },
      error: err => console.warn('No se pudieron cargar los subrayados', err),
    });
    this.api.get<ReaderPostIt[]>(`library/postits/?inventory=${inventoryId}`).subscribe({
      next: list => {
        this.postIts = list || [];
        this.loaded$.next('postits');
      },
      error: err => console.warn('No se pudieron cargar los post-its', err),
    });
  }

  // ── Marcadores ──
  /** El marcador de un capítulo que cae entre dos palabras (la página a la vista). */
  bookmarkIn(chapterIndex: number, first: number, last: number): PageBookmark | null {
    return this.bookmarks.find(b => b.chapterIndex === chapterIndex && b.wordIdx >= first && b.wordIdx <= last) || null;
  }

  addBookmark(chapterIndex: number, wordIdx: number, snippet: string): Observable<PageBookmark | null> {
    const chapter = this.chapters[chapterIndex];
    return this.api.post<any>('library/bookmarks/', {
      inventory: this.inventoryId,
      position_cfi: JSON.stringify({ v: 1, cid: chapter?.id, ch: chapterIndex, w: wordIdx }),
      note: snippet,
      color: '#b3261e',
    }).pipe(
      map(row => this.toPageBookmark(row)),
      tap(bookmark => {
        if (bookmark) this.bookmarks = [...this.bookmarks, bookmark].sort(byPosition);
      }),
    );
  }

  removeBookmark(bookmark: PageBookmark): Observable<unknown> {
    return this.api.delete(`library/bookmarks/${bookmark.id}/`).pipe(
      tap(() => this.bookmarks = this.bookmarks.filter(b => b.id !== bookmark.id)),
    );
  }

  /** Los marcadores guardan su posición como {v: 1, cid: capítulo, ch: índice, w: palabra}. */
  private toPageBookmark(row: any): PageBookmark | null {
    try {
      const position = JSON.parse(row?.position_cfi || '');
      if (position?.v !== 1 || typeof position.w !== 'number') return null;
      let chapterIndex = this.chapters.findIndex(c => String(c.id) === String(position.cid));
      if (chapterIndex < 0 && typeof position.ch === 'number') chapterIndex = position.ch;
      if (chapterIndex < 0 || chapterIndex >= this.chapters.length) return null;
      return {
        id: String(row.id),
        chapterId: String(position.cid || ''),
        chapterIndex,
        wordIdx: position.w,
        snippet: row.note || '',
        createdAt: row.created_at || '',
      };
    } catch {
      return null;
    }
  }

  // ── Subrayados ──
  /** Color de cada palabra subrayada de un capítulo (el subrayado más reciente queda encima). */
  highlightsByWord(chapterId: unknown): Map<number, ReaderHighlight> {
    const byWord = new Map<number, ReaderHighlight>();
    for (const h of this.highlights) {
      if (h.chapter !== chapterId) continue;
      for (let i = h.start_word; i <= h.end_word; i++) byWord.set(i, h);
    }
    return byWord;
  }

  highlightAt(chapterId: unknown, wordIdx: number): ReaderHighlight | null {
    let found: ReaderHighlight | null = null;
    for (const h of this.highlights) {
      if (h.chapter === chapterId && wordIdx >= h.start_word && wordIdx <= h.end_word) found = h;
    }
    return found;
  }

  sameHighlight(chapterId: unknown, start: number, end: number): ReaderHighlight | undefined {
    return this.highlights.find(h => h.chapter === chapterId && h.start_word === start && h.end_word === end);
  }

  createHighlight(chapterId: string, words: { start: number; end: number; text: string }, color: HighlightColor): Observable<ReaderHighlight> {
    return this.api.post<ReaderHighlight>('library/highlights/', {
      inventory: this.inventoryId, chapter: chapterId,
      start_word: words.start, end_word: words.end, text: words.text, color,
    }).pipe(tap(created => this.highlights.push(created)));
  }

  /** Cambia el color. Conserva la referencia (la tarjeta abierta muestra ese mismo objeto). */
  recolorHighlight(highlight: ReaderHighlight, color: HighlightColor): Observable<ReaderHighlight> {
    return this.api.patch<ReaderHighlight>(`library/highlights/${highlight.id}/`, { color }).pipe(
      tap(saved => Object.assign(highlight, saved)),
    );
  }

  deleteHighlight(highlight: ReaderHighlight): Observable<unknown> {
    return this.api.delete(`library/highlights/${highlight.id}/`).pipe(
      tap(() => this.highlights = this.highlights.filter(h => h.id !== highlight.id)),
    );
  }

  // ── Post-its ──
  get postItCount(): number {
    return this.postIts.filter(p => p.id).length;
  }

  /** Los post-its de un capítulo. Se recalcula solo si cambia la lista o el capítulo. */
  chapterPostIts(chapterId: unknown): ReaderPostIt[] {
    const memo = this.postItsMemo;
    if (memo && memo.source === this.postIts && memo.chapterId === chapterId) return memo.list;
    const list = this.postIts.filter(p => p.chapter === chapterId);
    this.postItsMemo = { source: this.postIts, chapterId, list };
    return list;
  }

  /** Agrega un post-it recién creado (sin guardar); descarta otro que hubiera quedado sin pegar. */
  addDraft(draft: ReaderPostIt): void {
    this.postIts = [...this.postIts.filter(p => p.id), draft];
  }

  removeLocal(postIt: ReaderPostIt): void {
    this.postIts = this.postIts.filter(p => p !== postIt);
  }

  /** Pega uno nuevo o guarda el texto de uno existente (misma referencia: la nota y el papelito). */
  savePostIt(postIt: ReaderPostIt, text: string): Observable<ReaderPostIt> {
    const request = postIt.id
      ? this.api.patch<ReaderPostIt>(`library/postits/${postIt.id}/`, { text })
      : this.api.post<ReaderPostIt>('library/postits/', { inventory: this.inventoryId, chapter: postIt.chapter, word: postIt.word, text });
    return request.pipe(tap(saved => Object.assign(postIt, saved)));
  }

  deletePostIt(postIt: ReaderPostIt): Observable<unknown> {
    return this.api.delete(`library/postits/${postIt.id}/`);
  }

  /** Lo cambia de línea; si el servidor falla, vuelve a la de antes. */
  movePostIt(postIt: ReaderPostIt, word: number): Observable<ReaderPostIt> {
    const previous = postIt.word;
    postIt.word = word;
    return this.api.patch<ReaderPostIt>(`library/postits/${postIt.id}/`, { word }).pipe(
      tap({ next: saved => Object.assign(postIt, saved), error: () => postIt.word = previous }),
    );
  }
}

const byPosition = (a: PageBookmark, b: PageBookmark) => a.chapterIndex - b.chapterIndex || a.wordIdx - b.wordIdx;

/** El primer mensaje legible de un error del servidor (validaciones de DRF), o el genérico. */
export function apiErrorMessage(err: any, fallback: string): string {
  const body = err?.error;
  if (body && typeof body === 'object') {
    const first = Object.values(body).flat().find(m => typeof m === 'string');
    if (first) return first as string;
  }
  return fallback;
}
