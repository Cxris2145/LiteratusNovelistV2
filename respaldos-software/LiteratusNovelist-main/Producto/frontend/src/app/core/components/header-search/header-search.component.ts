import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { NavigationStart, Router } from '@angular/router';
import { Subject, Subscription, of, timer } from 'rxjs';
import { catchError, debounce, filter, map, switchMap } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { SpeechRecognitionService } from '../../services/speech-recognition.service';
import { coverThumb } from '../../utils/cover-thumb.util';
import { foldText } from '../../utils/book-search.util';
import { HighlightPart, highlightMatch } from '../../utils/highlight-match.util';

type SuggestionType = 'book' | 'author' | 'genre';

export interface SearchSuggestion {
  type: SuggestionType;
  id: string;
  slug: string;
  title: string;
  author_name?: string;
  cover?: string | null;
  photo?: string | null;
  book_count?: number;
}

interface SuggestResponse {
  books: SearchSuggestion[];
  authors: SearchSuggestion[];
  genres: SearchSuggestion[];
}

interface SuggestionOption {
  item: SearchSuggestion;
  index: number;
  title: HighlightPart[];
  /** Autor (obras) o cantidad de obras (autores y géneros). */
  detail: HighlightPart[];
  image: string | null;
}

interface SuggestionGroup {
  type: SuggestionType;
  label: string;
  /** Ícono cuando no hay portada o foto. */
  icon: string;
  options: SuggestionOption[];
}

/** En este orden se recorren con las flechas (y se pintan: obras a la izquierda). */
const GROUPS: { type: SuggestionType; key: keyof SuggestResponse; label: string; icon: string }[] = [
  { type: 'book', key: 'books', label: 'Obras', icon: 'menu_book' },
  { type: 'author', key: 'authors', label: 'Autores', icon: 'person' },
  { type: 'genre', key: 'genres', label: 'Géneros', icon: 'category' },
];

/** Espera entre teclas antes de preguntar; lo ya preguntado sale de la memoria al instante. */
const TYPING_DEBOUNCE_MS = 90;
/** Si la primera respuesta tarda más que esto, el panel abre con "Buscando…". */
const SLOW_RESPONSE_MS = 280;
const MEMO_LIMIT = 60;

/**
 * Buscador del header con sugerencias mientras se escribe, desde la primera letra.
 *
 * Patrón combobox (WAI-ARIA): el foco se queda en el campo y las flechas recorren la lista
 * con aria-activedescendant; Enter abre la sugerencia marcada o, sin ninguna, busca en el
 * catálogo; Escape cierra y un segundo Escape borra. El servidor responde desde un índice en
 * memoria (catalog/search_suggest.py), así que cada tecla cuesta solo el viaje de red.
 */
@Component({
  selector: 'app-header-search',
  templateUrl: './header-search.component.html',
  styleUrl: './header-search.component.css',
})
export class HeaderSearchComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly speech = inject(SpeechRecognitionService);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  @ViewChild('searchInput', { static: true }) private inputRef!: ElementRef<HTMLInputElement>;

  readonly listboxId = 'header-search-listbox';

  term = '';
  isListening = false;

  /** El usuario quiere ver el panel (escribió o enfocó); Escape, Tab o un clic afuera lo apagan. */
  open = false;
  groups: SuggestionGroup[] = [];
  bookGroups: SuggestionGroup[] = [];
  sideGroups: SuggestionGroup[] = [];
  /** Sugerencias y, al final, "Ver todos los resultados". */
  optionCount = 0;
  activeIndex = -1;
  /** Consulta plegada a la que corresponden las sugerencias en pantalla. */
  private shownQuery = '';
  private loading = false;
  slow = false;
  /** La última consulta no tuvo respuesta (sin red o error del servidor). */
  failed = false;
  liveMessage = '';

  private readonly queries = new Subject<string>();
  private readonly memo = new Map<string, SuggestResponse>();
  private lastResponse: SuggestResponse | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private warmedUp = false;
  private subs = new Subscription();
  private voiceSubs = new Subscription();
  private voiceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Plegada como en el servidor: "García" y "garcia" son la misma consulta. */
  private get query(): string {
    return foldText(this.term).replace(/\s+/g, ' ').trim();
  }

  get expanded(): boolean {
    if (!this.open || !this.query) return false;
    return this.groups.length > 0 || this.settled || this.slow;
  }

  /** La respuesta de la consulta actual llegó (vacía, si no hay grupos). */
  get settled(): boolean {
    return !this.loading && this.shownQuery === this.query && !!this.query;
  }

  get allResultsIndex(): number {
    return this.optionCount - 1;
  }

  ngOnInit(): void {
    this.subs.add(this.queries.pipe(
      debounce(q => timer(this.memo.has(this.memoKey(q)) ? 0 : TYPING_DEBOUNCE_MS)),
      switchMap(q => {
        const cached = this.memo.get(this.memoKey(q));
        if (cached) return of({ q, response: cached });
        return this.api.get<SuggestResponse>('catalog/autocomplete/', new HttpParams().set('search', q)).pipe(
          map(response => {
            this.remember(q, response);
            return { q, response };
          }),
          // Sin red el buscador sigue funcionando: Enter lleva al catálogo.
          catchError(() => of({ q, response: null })),
        );
      }),
    ).subscribe(({ q, response }) => {
      if (q !== this.query) return;  // Llegó tarde: el usuario ya escribió otra cosa.
      this.loading = false;
      this.failed = !response;
      this.clearSlowTimer();
      this.lastResponse = response;
      this.shownQuery = q;
      this.render();
    }));

    this.subs.add(this.router.events.pipe(filter(e => e instanceof NavigationStart)).subscribe(() => this.close()));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.stopVoice();
    this.clearSlowTimer();
  }

  // ── Escritura ─────────────────────────────────────────────────────────────

  onTermChange(): void {
    const q = this.query;
    if (!q) {
      // Sesión nueva: lo que venga no debe mostrar sugerencias de la búsqueda anterior.
      this.lastResponse = null;
      this.shownQuery = '';
      this.loading = false;
      this.failed = false;
      this.clearSlowTimer();
      this.render();
      return;
    }
    this.open = true;
    this.request(q);
  }

  onFocus(): void {
    if (!this.warmedUp) {
      // Precalienta el índice del servidor mientras el lector empieza a escribir.
      this.warmedUp = true;
      if (!this.query) this.api.get('catalog/autocomplete/').pipe(catchError(() => of(null))).subscribe();
    }
    if (this.query) {
      this.open = true;
      if (this.shownQuery !== this.query) this.request(this.query);
    }
  }

  private request(q: string): void {
    const shown = q === this.shownQuery;  // P. ej. borró la última letra: ya está en pantalla.
    this.loading = !shown;
    if (shown) {
      this.clearSlowTimer();
    } else if (!this.slowTimer && this.groups.length === 0) {
      this.slowTimer = setTimeout(() => {
        this.slowTimer = null;
        this.slow = this.loading;
      }, SLOW_RESPONSE_MS);
    }
    this.render();  // El resaltado sigue a la tecla aunque la respuesta aún no llegue.
    if (!shown) this.queries.next(q);
  }

  private render(): void {
    const term = this.term;
    const response = this.lastResponse;
    let index = 0;
    this.groups = [];
    if (response) {
      for (const group of GROUPS) {
        const items = response[group.key] || [];
        if (!items.length) continue;
        this.groups.push({
          type: group.type,
          label: group.label,
          icon: group.icon,
          options: items.map(item => ({
            item,
            index: index++,
            title: highlightMatch(item.title, term),
            detail: group.type === 'book'
              ? highlightMatch(item.author_name || '', term)
              : [{ text: this.countLabel(item.book_count), hit: false }],
            image: this.imageFor(item),
          })),
        });
      }
    }
    this.bookGroups = this.groups.filter(g => g.type === 'book');
    this.sideGroups = this.groups.filter(g => g.type !== 'book');
    this.optionCount = index + 1;
    if (this.activeIndex >= this.optionCount) this.activeIndex = -1;
    if (!this.loading) this.slow = false;
    this.liveMessage = this.describe(index);
  }

  private describe(count: number): string {
    if (!this.query || this.loading) return '';
    if (this.failed) return 'No se pudieron cargar las sugerencias';
    if (!count) return 'Sin sugerencias';
    return count === 1 ? '1 sugerencia' : `${count} sugerencias`;
  }

  private countLabel(count = 0): string {
    return count === 1 ? '1 obra' : `${count} obras`;
  }

  private imageFor(item: SearchSuggestion): string | null {
    if (item.type === 'book') return item.cover ? coverThumb(item.cover, 72, 108, 60) : null;
    if (item.type === 'author') return item.photo ? coverThumb(item.photo, 72, 72, 60) : null;
    return null;
  }

  private memoKey(q: string): string {
    // La edad del lector cambia lo que se sugiere (obras +18).
    return `${this.auth.currentUser()?.id ?? 'visitante'}|${q}`;
  }

  private remember(q: string, response: SuggestResponse): void {
    const key = this.memoKey(q);
    this.memo.delete(key);
    this.memo.set(key, response);
    if (this.memo.size > MEMO_LIMIT) this.memo.delete(this.memo.keys().next().value!);
  }

  private clearSlowTimer(): void {
    if (this.slowTimer) clearTimeout(this.slowTimer);
    this.slowTimer = null;
  }

  // ── Teclado y mouse ───────────────────────────────────────────────────────

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!this.query) return;
        event.preventDefault();
        if (!this.expanded) {
          this.open = true;
          this.request(this.query);
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const from = this.activeIndex < 0 ? (step > 0 ? -1 : this.optionCount) : this.activeIndex;
        this.activeIndex = (from + step + this.optionCount) % this.optionCount;
        this.revealActive();
        return;
      }
      case 'Enter':
        if (this.expanded && this.activeIndex >= 0) {
          event.preventDefault();
          this.chooseIndex(this.activeIndex);
        }
        return;  // Sin opción marcada, el formulario busca en el catálogo.
      case 'Escape':
        if (this.expanded) {
          event.preventDefault();
          this.close();
        } else if (this.term) {
          event.preventDefault();
          this.clear();
        }
        return;
      case 'Tab':
        this.close();
        return;
    }
  }

  /** mousemove y no mouseenter: al bajar con flechas la lista se desplaza bajo un mouse quieto. */
  pointAt(index: number): void {
    if (this.activeIndex !== index) this.activeIndex = index;
  }

  chooseIndex(index: number): void {
    if (index === this.allResultsIndex) {
      this.submit();
      return;
    }
    const option = this.groups.flatMap(g => g.options).find(o => o.index === index);
    if (option) this.choose(option.item);
  }

  private choose(item: SearchSuggestion): void {
    this.term = item.title;
    this.close();
    this.inputRef.nativeElement.blur();  // En el celular baja el teclado al cambiar de página.
    if (item.type === 'book') this.router.navigate(['/book', item.slug || item.id]);
    else if (item.type === 'author') this.router.navigate(['/author', item.slug || item.id]);
    else this.router.navigate(['/categories', item.slug]);
  }

  private revealActive(): void {
    const id = this.optionId(this.activeIndex);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'nearest' }));
  }

  optionId(index: number): string {
    return `${this.listboxId}-${index}`;
  }

  close(): void {
    this.open = false;
    this.activeIndex = -1;
    this.slow = false;
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (this.open && !this.host.contains(event.target as Node)) this.close();
  }

  // ── Acciones del formulario ───────────────────────────────────────────────

  submit(): void {
    const query = this.term.trim();
    this.close();
    this.router.navigate(['/catalog'], query ? { queryParams: { search: query } } : {});
  }

  clear(): void {
    this.term = '';
    this.close();
    this.stopVoice();
    this.onTermChange();
    this.inputRef.nativeElement.focus();
  }

  toggleVoiceSearch(): void {
    if (this.isListening) {
      this.stopVoice();
      return;
    }
    this.isListening = true;
    this.close();
    this.speech.startListening();

    this.voiceSubs.add(this.speech.partialTranscript$.subscribe(text => {
      if (text && this.isListening) this.term = text;
    }));
    this.voiceSubs.add(this.speech.transcript$.subscribe(finalText => {
      if (finalText && this.isListening) {
        this.term = finalText;
        this.stopVoice();
        this.submit();
      }
    }));
    // Corta tras 8 segundos de silencio.
    this.voiceTimer = setTimeout(() => {
      if (!this.isListening) return;
      this.stopVoice();
      if (this.term.trim()) this.submit();
    }, 8000);
  }

  private stopVoice(): void {
    if (this.isListening) this.speech.stopListening();
    this.isListening = false;
    this.voiceSubs.unsubscribe();
    this.voiceSubs = new Subscription();
    if (this.voiceTimer) clearTimeout(this.voiceTimer);
    this.voiceTimer = null;
  }

  trackGroup(_: number, group: SuggestionGroup): string {
    return group.type;
  }

  trackOption(_: number, option: SuggestionOption): string {
    return `${option.item.type}:${option.item.id}`;
  }
}
