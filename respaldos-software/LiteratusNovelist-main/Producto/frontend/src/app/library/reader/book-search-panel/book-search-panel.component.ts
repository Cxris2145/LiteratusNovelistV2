import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';

import { BookSearchGroup, BookSearchService } from '../book-search.service';

/**
 * Buscar dentro del libro: se escribe una palabra o frase ("Dulcinea", "Dulcinea del
 * Toboso") y se listan todos los lugares del libro donde aparece, agrupados por capítulo.
 * Cada resultado lleva a esa palabra en el libro. El estado vive en BookSearchService,
 * así al reabrir el panel sigue la misma búsqueda.
 */
@Component({
  selector: 'app-book-search-panel',
  templateUrl: './book-search-panel.component.html',
  styleUrl: './book-search-panel.component.css',
})
export class BookSearchPanelComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly search = inject(BookSearchService);

  @Input() bookTitle = '';
  @Input() chapters: { title?: string; content_html: string }[] = [];
  /** Número de página (aproximado) de una palabra, lo calcula el lector. */
  @Input() pageLabel: (chapterIndex: number, wordIdx: number, wordCount: number) => string = () => '';

  /** Índice del resultado (en BookSearchService.results) al que saltar. */
  @Output() jump = new EventEmitter<number>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('queryInput') private queryInput?: ElementRef<HTMLInputElement>;
  @ViewChild('resultsBody') private resultsBody?: ElementRef<HTMLElement>;

  readonly MIN_QUERY = BookSearchService.MIN_QUERY;
  readonly MAX_RESULTS = BookSearchService.MAX_RESULTS;

  query = '';
  wholeWord = false;
  status: 'short' | 'empty' | 'results' = 'short';
  pageLabels: string[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  trackGroup = (_: number, group: BookSearchGroup) => group.chapterIndex;
  trackIndex = (_: number, index: number) => index;

  ngOnInit(): void {
    this.query = this.search.query;
    this.wholeWord = this.search.wholeWord;
    if (this.search.isActive) {
      this.status = 'results';
      this.refreshPageLabels();
    }
    this.search.prepare(this.chapters).then(() => {
      // Lo que se escribió mientras se preparaba el índice se busca apenas está listo.
      if (!this.destroyed && this.query && !this.search.isActive) this.run();
    });
  }

  ngAfterViewInit(): void {
    const input = this.queryInput?.nativeElement;
    input?.focus();
    input?.select();
    // Al volver desde la barra de resultados, la lista se ubica en el que se está viendo.
    if (this.search.activeIndex >= 0) {
      setTimeout(() => document.getElementById(`bs-result-${this.search.activeIndex}`)?.scrollIntoView({ block: 'center' }));
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  /** Ctrl/Cmd+F con el panel abierto vuelve al campo de búsqueda. */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.queryInput?.nativeElement.focus();
      this.queryInput?.nativeElement.select();
    }
  }

  close(): void {
    this.closed.emit();
  }

  onInput(value: string): void {
    this.query = value;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.run(), 250);
  }

  /** Enter: busca de inmediato y salta al primer resultado (o al que se estaba viendo). */
  onEnter(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.run();
    }
    if (this.search.isActive) this.goTo(Math.max(0, this.search.activeIndex));
  }

  toggleWholeWord(): void {
    this.wholeWord = !this.wholeWord;
    this.run();
  }

  clear(): void {
    this.query = '';
    this.run();
    this.queryInput?.nativeElement.focus();
  }

  goTo(resultIndex: number): void {
    this.jump.emit(resultIndex);
  }

  formatNumber(n: number): string {
    return n.toLocaleString('es-CL');
  }

  private run(): void {
    this.debounceTimer = null;
    const ran = this.search.search(this.query, this.wholeWord);
    this.status = !ran ? 'short' : this.search.total ? 'results' : 'empty';
    this.refreshPageLabels();
    if (this.resultsBody) this.resultsBody.nativeElement.scrollTop = 0;
  }

  private refreshPageLabels(): void {
    this.pageLabels = this.search.results.map(r =>
      this.pageLabel(r.chapterIndex, r.firstWord, this.search.wordCount(r.chapterIndex)));
  }
}
