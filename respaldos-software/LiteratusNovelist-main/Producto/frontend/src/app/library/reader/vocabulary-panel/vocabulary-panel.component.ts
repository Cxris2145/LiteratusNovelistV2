import { Component, EventEmitter, HostListener, Input, OnInit, Output, inject } from '@angular/core';

import { ApiService } from '../../../core/services/api.service';
import { chapterWords, wordLetterRuns } from '../../../core/utils/chapter-parser.util';

/** Lugar del libro al que saltar: capítulo (índice) y palabra (`word-N`). */
export interface VocabularyJump {
  chapterIndex: number;
  wordIdx: number;
}

type WordType = 'S' | 'N' | 'V' | 'A';

interface VocabularyEntry {
  lemma: string;
  type: WordType;
  count: number;
  forms: string[];
}

interface Occurrence {
  chapterIndex: number;
  wordIdx: number;
  before: string;
  word: string;
  after: string;
  pageLabel: string;
}

interface OccurrenceGroup {
  chapterIndex: number;
  title: string;
  items: Occurrence[];
}

interface VocabularyResponse {
  status: string;
  word_count: number;
  lemma_count: number;
  entries: [string, WordType, number, string[]][];
}

/**
 * Vocabulario del libro: sus sustantivos, nombres, verbos y adjetivos agrupados por lema
 * (lo calcula el backend con spaCy, ver catalog/vocabulary.py). Al elegir una palabra se
 * listan los lugares donde aparece, y cada uno lleva a esa página del libro.
 */
@Component({
  selector: 'app-vocabulary-panel',
  templateUrl: './vocabulary-panel.component.html',
  styleUrl: './vocabulary-panel.component.css',
})
export class VocabularyPanelComponent implements OnInit {
  private api = inject(ApiService);

  @Input() inventoryId = '';
  @Input() bookTitle = '';
  @Input() chapters: { title?: string; content_html: string }[] = [];
  /** Número de página (aproximado) de una palabra, lo calcula el lector. */
  @Input() pageLabel: (chapterIndex: number, wordIdx: number, wordCount: number) => string = () => '';

  @Output() jump = new EventEmitter<VocabularyJump>();
  @Output() closed = new EventEmitter<void>();

  readonly types: { code: WordType; label: string; single: string }[] = [
    { code: 'S', label: 'Sustantivos', single: 'Sustantivo' },
    { code: 'N', label: 'Nombres', single: 'Nombre' },
    { code: 'V', label: 'Verbos', single: 'Verbo' },
    { code: 'A', label: 'Adjetivos', single: 'Adjetivo' },
  ];
  readonly typeLabel: Record<WordType, string> = { S: 'Sustantivo', N: 'Nombre', V: 'Verbo', A: 'Adjetivo' };
  readonly PAGE_SIZE = 40;
  private readonly MAX_OCCURRENCES = 400;
  private readonly CONTEXT_WORDS = 7;

  state: 'loading' | 'ready' | 'unavailable' | 'error' = 'loading';
  message = '';
  private entries: VocabularyEntry[] = [];
  wordCount = 0;

  activeTypes = new Set<WordType>(['S', 'N', 'V', 'A']);
  sortMode: 'freq' | 'alpha' = 'freq';
  query = '';
  page = 0;

  // Precalculados (no getters): *ngFor sobre un getter recrea los botones en cada ciclo.
  filtered: VocabularyEntry[] = [];
  pageCount = 1;
  columns: VocabularyEntry[][] = [[], []];

  selected: VocabularyEntry | null = null;
  occurrenceGroups: OccurrenceGroup[] = [];
  occurrenceTotal = 0;
  occurrencesTruncated = false;
  private chapterWordCache = new Map<number, string[]>();

  trackEntry = (_: number, entry: VocabularyEntry) => entry.lemma + entry.type;
  trackGroup = (_: number, group: OccurrenceGroup) => group.chapterIndex;
  trackOccurrence = (_: number, occurrence: Occurrence) => occurrence.wordIdx;

  ngOnInit(): void {
    this.api.get<VocabularyResponse>(`library/inventory/${this.inventoryId}/vocabulary/`).subscribe({
      next: res => {
        this.entries = (res.entries || []).map(([lemma, type, count, forms]) => ({ lemma, type, count, forms }));
        this.wordCount = res.word_count || 0;
        this.state = 'ready';
        this.refilter();
      },
      error: err => {
        this.state = err?.status === 404 ? 'unavailable' : 'error';
        this.message = err?.error?.message || '';
      },
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selected) this.backToList();
    else this.close();
  }

  close(): void {
    this.closed.emit();
  }

  toggleType(code: WordType): void {
    if (this.activeTypes.has(code) && this.activeTypes.size === 1) {
      // Si se apaga el único tipo activo, se vuelven a mostrar todos.
      this.activeTypes = new Set(this.types.map(t => t.code));
    } else if (this.activeTypes.has(code)) {
      this.activeTypes.delete(code);
    } else {
      this.activeTypes.add(code);
    }
    this.page = 0;
    this.refilter();
  }

  setSort(mode: string): void {
    this.sortMode = mode === 'alpha' ? 'alpha' : 'freq';
    this.page = 0;
    this.refilter();
  }

  onQuery(value: string): void {
    this.query = value;
    this.page = 0;
    this.refilter();
  }

  goToPage(page: number): void {
    this.page = Math.min(Math.max(page, 0), this.pageCount - 1);
    this.paginate();
  }

  private refilter(): void {
    const query = this.fold(this.query.trim());
    let list = this.entries.filter(e => this.activeTypes.has(e.type) && (!query || this.fold(e.lemma).includes(query)));
    if (this.sortMode === 'alpha') {
      list = list.slice().sort((a, b) => a.lemma.localeCompare(b.lemma, 'es'));
    }
    this.filtered = list;
    this.pageCount = Math.max(1, Math.ceil(list.length / this.PAGE_SIZE));
    this.paginate();
  }

  private paginate(): void {
    const start = this.page * this.PAGE_SIZE;
    const slice = this.filtered.slice(start, start + this.PAGE_SIZE);
    const half = Math.ceil(slice.length / 2);
    this.columns = [slice.slice(0, half), slice.slice(half)];
  }

  /** Minúsculas y sin tildes, para buscar "arbol" y encontrar "árbol". */
  private fold(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  }

  // ── Dónde aparece una palabra ───────────────────────────────────────

  select(entry: VocabularyEntry): void {
    this.selected = entry;
    const forms = new Set(entry.forms);
    const groups: OccurrenceGroup[] = [];
    let total = 0;
    this.occurrencesTruncated = false;

    for (let ci = 0; ci < this.chapters.length && !this.occurrencesTruncated; ci++) {
      const words = this.wordsOf(ci);
      const items: Occurrence[] = [];
      for (let wi = 0; wi < words.length; wi++) {
        const word = words[wi];
        if (!word || !wordLetterRuns(word).some(run => forms.has(run))) continue;
        total++;
        if (total > this.MAX_OCCURRENCES) {
          this.occurrencesTruncated = true;
          break;
        }
        items.push({
          chapterIndex: ci,
          wordIdx: wi,
          before: words.slice(Math.max(0, wi - this.CONTEXT_WORDS), wi).join(' '),
          word,
          after: words.slice(wi + 1, wi + 1 + this.CONTEXT_WORDS).join(' '),
          pageLabel: this.pageLabel(ci, wi, words.length),
        });
      }
      if (items.length) {
        groups.push({ chapterIndex: ci, title: this.chapters[ci].title || `Capítulo ${ci + 1}`, items });
      }
    }
    this.occurrenceGroups = groups;
    this.occurrenceTotal = Math.min(total, this.MAX_OCCURRENCES);
  }

  backToList(): void {
    this.selected = null;
    this.occurrenceGroups = [];
  }

  goTo(occurrence: Occurrence): void {
    this.jump.emit({ chapterIndex: occurrence.chapterIndex, wordIdx: occurrence.wordIdx });
  }

  private wordsOf(chapterIndex: number): string[] {
    let words = this.chapterWordCache.get(chapterIndex);
    if (!words) {
      words = chapterWords(this.chapters[chapterIndex]?.content_html || '');
      this.chapterWordCache.set(chapterIndex, words);
    }
    return words;
  }
}
