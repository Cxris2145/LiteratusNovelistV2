import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';

import { NotificationService } from '../../../core/services/notification.service';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { ReaderComponent } from '../reader.component';
import { ReaderAnnotationsService, ReaderHighlight, apiErrorMessage } from '../reader-annotations.service';
import { DictionaryResult, ReaderDictionaryService } from '../reader-dictionary.service';
import { HIGHLIGHT_COLOR_OPTIONS, HighlightColor } from '../reader-settings';

/** Palabras de una selección (`word-N`), con el texto completo de esas palabras. */
interface SelectedWords { start: number; end: number; text: string }

/**
 * Lo que aparece sobre el texto del lector: el menú de la selección (subrayar, definición,
 * flashcard, narrar desde ahí, preguntar a un personaje), la tarjeta de un subrayado (cambiar el
 * color o quitarlo) y el diccionario. El lector consulta su estado (`showWordMenu`,
 * `activeHighlight`) para que un toque que cierra estas tarjetas no pase de página.
 */
@Component({
  selector: 'app-reader-selection-menu',
  templateUrl: './reader-selection-menu.component.html',
  styleUrl: './reader-selection-menu.component.css',
})
export class ReaderSelectionMenuComponent implements OnInit, OnDestroy {
  private readonly reader = inject(ReaderComponent);
  private readonly annotations = inject(ReaderAnnotationsService);
  private readonly dictionary = inject(ReaderDictionaryService);
  private readonly vocabulary = inject(VocabularyService);
  private readonly notifications = inject(NotificationService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly highlightColorOptions = HIGHLIGHT_COLOR_OPTIONS;

  // Menú de la selección
  showWordMenu = false;
  wordMenuX = 0;
  wordMenuY = 0;
  isMenuBelow = false;
  selectedText = '';
  /** Palabras de la selección, leídas al aparecer el menú (al tocar un botón puede perderse). */
  private pendingSelection: SelectedWords | null = null;
  private selectionMenuTimer: ReturnType<typeof setTimeout> | null = null;

  // Tarjeta del subrayado
  activeHighlight: ReaderHighlight | null = null;
  highlightPopoverX = 0;
  highlightPopoverY = 0;
  highlightPopoverBelow = false;
  isHighlightBusy = false;

  // Diccionario
  showDictionaryModal = false;
  dictionaryResult: DictionaryResult | null = null;
  isDictionaryLoading = false;

  /**
   * selectionchange llega una vez por cuadro mientras se arrastra para seleccionar. Se escucha
   * FUERA de la zona de Angular: el menú se arma una sola vez, cuando la selección se queda
   * quieta, y solo entonces se vuelve a la zona.
   */
  private readonly handleSelectionChange = () => this.onSelectionChange();

  ngOnInit(): void {
    this.ngZone.runOutsideAngular(() => document.addEventListener('selectionchange', this.handleSelectionChange));
  }

  ngOnDestroy(): void {
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    if (this.selectionMenuTimer) clearTimeout(this.selectionMenuTimer);
  }

  private onSelectionChange(): void {
    if (this.selectionMenuTimer) clearTimeout(this.selectionMenuTimer);
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      // Solo selecciones dentro del texto del libro
      const canvas = this.reader.canvasEl();
      if (selection.anchorNode && canvas && !canvas.contains(selection.anchorNode)) {
        if (this.showWordMenu) this.ngZone.run(() => (this.showWordMenu = false));
        return;
      }
      this.selectionMenuTimer = setTimeout(() => this.ngZone.run(() => {
        if (selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        this.selectedText = selection.toString().trim();
        this.pendingSelection = this.selectionWords(range);
        this.closeHighlightPopover();
        this.reader.closePostIt();

        this.wordMenuX = rect.left + rect.width / 2;
        // El menú mide ~300 px: si no cabe arriba y abajo hay más espacio, va abajo
        if (rect.top < 320 && window.innerHeight - rect.bottom > rect.top) {
          this.wordMenuY = rect.bottom + 15;
          this.isMenuBelow = true;
        } else {
          this.wordMenuY = rect.top - 15;
          this.isMenuBelow = false;
        }
        this.showWordMenu = true;
      }), 80);
    } else if (this.showWordMenu || this.selectedText) {
      this.ngZone.run(() => {
        this.showWordMenu = false;
        this.selectedText = '';
      });
    }
  }

  /** Primera y última palabra (`word-N`) que toca la selección, con el texto completo de esas palabras. */
  private selectionWords(range: Range): SelectedWords | null {
    const container = range.commonAncestorContainer;
    const root = container instanceof HTMLElement ? container : container.parentElement;
    if (!root) return null;
    const textNodes = (el: HTMLElement) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes: Node[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      return nodes;
    };
    // Una selección que termina justo al inicio de una palabra (o empieza al final) no la incluye.
    const touches = (word: HTMLElement) => {
      if (!range.intersectsNode(word)) return false;
      const nodes = textNodes(word);
      if (range.endOffset === 0 && range.endContainer === nodes[0]) return false;
      const last = nodes[nodes.length - 1];
      return !(range.startContainer === last && range.startOffset === (last?.textContent?.length ?? 0));
    };
    const single = root.closest('.word') as HTMLElement | null;
    const words = single ? [single] : Array.from(root.querySelectorAll<HTMLElement>('.word')).filter(touches);
    const indexed = words
      .map(el => ({ el, idx: parseInt(el.id.replace('word-', ''), 10) }))
      .filter(w => !isNaN(w.idx));
    if (indexed.length === 0) return null;
    return {
      start: indexed[0].idx,
      end: indexed[indexed.length - 1].idx,
      text: indexed.map(w => w.el.textContent?.trim() || '').join(' '),
    };
  }

  dismissSelection(): void {
    window.getSelection()?.removeAllRanges();
    this.showWordMenu = false;
    this.selectedText = '';
    this.pendingSelection = null;
  }

  // ── Subrayados ──
  createHighlight(color: HighlightColor): void {
    const selection = this.pendingSelection;
    const chapterId = this.reader.currentChapterId;
    if (!selection || !chapterId || this.isHighlightBusy) return;
    const same = this.annotations.sameHighlight(chapterId, selection.start, selection.end);
    this.dismissSelection();
    if (same) { // subrayar otra vez el mismo pasaje solo le cambia el color
      this.updateHighlight(same, color);
      return;
    }
    this.isHighlightBusy = true;
    this.annotations.createHighlight(chapterId, selection, color).subscribe({
      next: () => {
        this.isHighlightBusy = false;
        this.reader.onHighlightsChanged();
      },
      error: err => {
        this.isHighlightBusy = false;
        this.notifications.error(apiErrorMessage(err, 'No se pudo guardar el subrayado.'), 'Subrayar');
      },
    });
  }

  openHighlightPopover(highlight: ReaderHighlight): void {
    const position = this.popoverPositionAt(highlight.end_word) || this.popoverPositionAt(highlight.start_word);
    if (!position) return;
    this.reader.closePostIt();
    [this.highlightPopoverX, this.highlightPopoverY, this.highlightPopoverBelow] = position;
    this.activeHighlight = highlight;
    this.showWordMenu = false;
  }

  closeHighlightPopover(): void {
    this.activeHighlight = null;
  }

  recolorHighlight(color: HighlightColor): void {
    if (this.activeHighlight && this.activeHighlight.color !== color) this.updateHighlight(this.activeHighlight, color);
  }

  deleteHighlight(): void {
    const highlight = this.activeHighlight;
    if (!highlight || this.isHighlightBusy) return;
    this.isHighlightBusy = true;
    this.annotations.deleteHighlight(highlight).subscribe({
      next: () => {
        this.isHighlightBusy = false;
        this.closeHighlightPopover();
        this.reader.onHighlightsChanged();
      },
      error: err => {
        this.isHighlightBusy = false;
        this.notifications.error(apiErrorMessage(err, 'No se pudo quitar el subrayado.'), 'Subrayar');
      },
    });
  }

  private updateHighlight(highlight: ReaderHighlight, color: HighlightColor): void {
    if (this.isHighlightBusy) return;
    this.isHighlightBusy = true;
    this.annotations.recolorHighlight(highlight, color).subscribe({
      next: () => {
        this.isHighlightBusy = false;
        this.reader.onHighlightsChanged();
      },
      error: err => {
        this.isHighlightBusy = false;
        this.notifications.error(apiErrorMessage(err, 'No se pudo guardar el cambio.'), 'Subrayar');
      },
    });
  }

  /** Dónde va una tarjeta de ~300 px junto a una palabra: [x, y, debajo]; null si la palabra no está. */
  private popoverPositionAt(wordIdx: number): [number, number, boolean] | null {
    const anchor = document.getElementById(`word-${wordIdx}`);
    if (!anchor) return null;
    const rect = anchor.getBoundingClientRect();
    const half = 160; // media tarjeta: que no se salga por los lados
    const x = Math.min(Math.max(rect.left + rect.width / 2, half), Math.max(half, window.innerWidth - half));
    const below = rect.top < 280;
    return [x, below ? rect.bottom + 12 : rect.top - 12, below];
  }

  // ── Diccionario y flashcards ──
  async defineWord(): Promise<void> {
    if (!this.selectedText) return;
    this.showWordMenu = false;
    this.showDictionaryModal = true;
    this.isDictionaryLoading = true;
    this.dictionaryResult = null;
    this.dictionaryResult = await this.dictionary.define(this.selectedText);
    this.isDictionaryLoading = false;
    this.cdr.detectChanges();
  }

  closeDictionary(): void {
    this.showDictionaryModal = false;
    this.dictionaryResult = null;
  }

  /** Guarda la palabra (con su frase y, si ya se buscó, su definición) en las tarjetas de vocabulario. */
  saveToVocabulary(dictResult?: DictionaryResult | null): void {
    const rawWord = (dictResult?.word || this.selectedText || '').trim().split(/\s+/)[0];
    const word = rawWord.replace(/^[^\wáéíóúÁÉÍÓÚñÑ]+|[^\wáéíóúÁÉÍÓÚñÑ]+$/g, '');
    if (!word) {
      this.notifications.warning('Por favor selecciona una palabra válida.', 'Flashcards');
      return;
    }
    const bookId = this.reader.bookId;
    if (!bookId) {
      this.notifications.error('No se pudo identificar el libro actual.', 'Flashcards');
      return;
    }

    // La frase donde aparece: hasta el punto anterior y el siguiente
    let contextSentence = '';
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const text = sel.anchorNode?.textContent || '';
      if (text.length > word.length) {
        const offset = sel.anchorOffset;
        const before = text.slice(0, offset);
        const after = text.slice(offset);
        const startMatch = before.match(/[^.!?]*$/);
        const endMatch = after.match(/^[^.!?]*/);
        const start = startMatch ? before.length - startMatch[0].length : 0;
        const end = endMatch ? offset + endMatch[0].length : text.length;
        contextSentence = text.slice(start, end).trim();
      }
    }
    if (!contextSentence && this.selectedText) contextSentence = this.selectedText.trim();

    let definition = '';
    const meaning = (dictResult?.meanings || this.dictionaryResult?.meanings)?.[0];
    const firstDef = meaning?.definitions?.[0]?.definition;
    if (firstDef) definition = `(${meaning?.partOfSpeech || ''}) ${firstDef}`.trim();

    this.vocabulary.saveWord({
      book_id: bookId,
      chapter_id: this.reader.currentChapterId || null,
      word,
      definition,
      context_sentence: contextSentence,
    }).subscribe({
      next: () => {
        this.reader.flashToast('🗂️', `«${word}» guardada en Flashcards`);
        this.notifications.success(`«${word}» guardada en tus tarjetas de vocabulario.`, 'Flashcards');
        this.showWordMenu = false;
        if (dictResult) this.closeDictionary();
      },
      error: err => this.notifications.error(err?.error?.message || 'No se pudo guardar la palabra.', 'Flashcards'),
    });
  }

  // ── Narrar y preguntar ──
  /** Narra desde la palabra donde empieza la selección. */
  playAudioFromSelection(): void {
    if (!this.selectedText) return;
    const wordSpan = window.getSelection()?.anchorNode?.parentElement?.closest('.word');
    const wordIdx = wordSpan?.id ? parseInt(wordSpan.id.replace('word-', ''), 10) : -1;
    this.showWordMenu = false;
    this.reader.narrateFromWord(isNaN(wordIdx) ? -1 : wordIdx);
  }

  /** Abre la ventana de personajes con la cita ya escrita como pregunta (se puede editar antes de enviar). */
  askCharacter(): void {
    if (!this.selectedText) return;
    const quote = this.selectedText;
    this.dismissSelection();
    this.reader.openCharacters(`¿Qué significa esto en la historia?\n\n"${quote}"`);
  }
}
