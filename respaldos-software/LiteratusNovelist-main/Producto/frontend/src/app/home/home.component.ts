import { Component, OnInit, OnDestroy, PLATFORM_ID, inject, ChangeDetectorRef, HostListener, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';
import { ChatService } from '../core/services/chat.service';
import { FavoritesService } from '../core/services/favorites.service';
import { getBookPages } from '../core/utils/book-pages.util';
import { coverThumb } from '../core/utils/cover-thumb.util';
import { bookFamily, FAMILY_ORDER, genreFamily, GenreFamily } from './genre-family';

export interface Book {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  is_featured: boolean;
  cover_image: string | null;
  tags?: { name: string; slug: string }[];
  price?: number;
  author_name?: string;
  ai_character_count?: number;
  page_count?: number | null;
  word_count?: number;
  genres?: { id: string; name: string; slug: string }[];
}

export interface DemoAvatar {
  id: number;
  name: string;
  description: string;
  avatar_image_url: string | null;
  chat_count: number;
  book_title?: string;
  book_slug?: string;
}

export interface GenreCount {
  id: string;
  name: string;
  slug: string;
  book_count: number;
  family: GenreFamily;
}

export interface MoodOption {
  id: string;
  label: string;
}

/** Palabra de la demo de lectura: `head` va en negrita en lectura biónica. */
interface DemoWord {
  text: string;
  head: string;
  tail: string;
  start: number;
  index: number;
}

type AssistiveMode = 'normal' | 'focus' | 'bionic' | 'dyslexia';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  public auth = inject(AuthService);
  private chatService = inject(ChatService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);
  private destroy$ = new Subject<void>();
  public favoritesService = inject(FavoritesService, { optional: true });

  getBookPages = getBookPages;
  bookFamily = bookFamily;

  // ─── Libros ──────────────────────────────────────────────────────────────
  allBooks: Book[] = [];
  forYouBooks: Book[] = [];
  starterBooks: Book[] = [];
  quickReads: Book[] = [];
  popularBooks: Book[] = [];
  isLoading = true;
  loadFailed = false;

  // ─── Portada ─────────────────────────────────────────────────────────────
  heroBooks: Book[] = [];
  heroBookIndex = 0;
  heroBook: Book | null = null;
  heroCoverFailed = false;
  totalBooksCount = 0;
  totalCharactersCount = 0;

  // ─── Colecciones (géneros) ───────────────────────────────────────────────
  genres: GenreCount[] = [];

  // ─── Reparto (personajes con IA) ─────────────────────────────────────────
  castAvatars: DemoAvatar[] = [];
  characterOfTheDay: DemoAvatar | null = null;
  focusedCastId: number | null = null;

  // ─── ¿Qué leer hoy? ──────────────────────────────────────────────────────
  moodOptions: MoodOption[] = [
    { id: 'adventure', label: 'Aventura' },
    { id: 'thinking', label: 'Algo para pensar' },
    { id: 'drama', label: 'Teatro' },
    { id: 'mystery', label: 'Misterio' },
    { id: 'quick', label: 'Algo corto' }
  ];
  selectedMood = 'adventure';
  filteredMoodBooks: Book[] = [];

  // ─── Lectura asistida ────────────────────────────────────────────────────
  assistiveMode: AssistiveMode = 'normal';
  readonly demoTitle = 'Don Quijote de la Mancha';
  readonly demoAuthor = 'Miguel de Cervantes';
  readonly demoParagraphs = [
    'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor.',
    'Una olla de algo más vaca que carnero, salpicón las más noches, duelos y quebrantos los sábados, lantejas los viernes, algún palomino de añadidura los domingos, consumían las tres partes de su hacienda.'
  ];
  demoWords: DemoWord[][] = [];
  canNarrate = false;
  isNarrating = false;
  narratedWord = -1;
  private narrationTimer: any = null;
  private gotBoundary = false;

  // ─── Sesión ──────────────────────────────────────────────────────────────
  continueReading: any | null = null;
  userStreak = 0;

  // ─── Vista previa ────────────────────────────────────────────────────────
  selectedQuickViewBook: Book | null = null;
  quickViewTab: 'synopsis' | 'details' = 'synopsis';
  private lastFocused: HTMLElement | null = null;

  prefersReducedMotion = false;

  ngOnInit(): void {
    this.buildDemoWords();
    if (!isPlatformBrowser(this.platformId)) return;

    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.canNarrate = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    this.loadStats();
    this.loadBooks();
    this.loadCast();
    this.loadGenres();

    if (this.auth.isLoggedIn()) {
      this.loadContinueReading();
      this.loadProfile();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopNarration();
  }

  // ─── Portada ─────────────────────────────────────────────────────────────
  get heroFamily(): GenreFamily {
    return bookFamily(this.heroBook);
  }

  selectHeroBook(index: number): void {
    if (index < 0 || index >= this.heroBooks.length || index === this.heroBookIndex) return;
    const apply = () => {
      this.heroBookIndex = index;
      this.heroCoverFailed = false;
      this.heroBook = this.heroBooks[index];
      this.cdr.detectChanges();
    };
    type ViewTransition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => ViewTransition };
    if (this.prefersReducedMotion || typeof doc.startViewTransition !== 'function' || document.visibilityState !== 'visible') {
      apply();
      return;
    }
    // Si el navegador cancela la animación (pestaña oculta, clics seguidos), el cambio ya quedó aplicado.
    const transition = doc.startViewTransition(apply);
    const ignore = () => undefined;
    transition.ready.catch(ignore);
    transition.finished.catch(ignore);
    transition.updateCallbackDone.catch(ignore);
  }

  /** El grosor del lomo sigue la extensión del libro: un cuento es delgado, una novela río, gruesa. */
  spineWidth(book: Book): number {
    const pages = Math.min(this.getBookPages(book) || 0, 900);
    return Math.round(34 + (pages / 900) * 30);
  }

  /** Los libros largos también son un poco más altos, como en una repisa real. */
  spineHeight(book: Book): number {
    const pages = Math.min(this.getBookPages(book) || 0, 900);
    return Math.round(184 + (pages / 900) * 36);
  }

  /** En el lomo solo cabe el apellido: "H. P. Lovecraft" pasa a "Lovecraft". */
  spineAuthor(book: Book): string {
    const parts = (book.author_name || '').trim().split(/\s+/);
    return parts[parts.length - 1] || '';
  }

  /** Flechas izquierda/derecha entre los lomos, como en un grupo de pestañas. */
  onSpineKeydown(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + this.heroBooks.length) % this.heroBooks.length;
    this.selectHeroBook(next);
    const spines = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    spines?.[next]?.focus();
  }

  retryLoad(): void {
    this.loadFailed = false;
    this.loadBooks();
  }

  // ─── Carga de datos ──────────────────────────────────────────────────────
  private loadStats(): void {
    this.api.getCached<any>('catalog/stats/', undefined, 5 * 60 * 1000).subscribe({
      next: (res: any) => {
        if (typeof res?.total_books === 'number') this.totalBooksCount = res.total_books;
        if (typeof res?.total_characters === 'number') this.totalCharactersCount = res.total_characters;
        this.cdr.detectChanges();
      },
      error: () => { /* la portada funciona sin cifras */ }
    });
  }

  private loadBooks(): void {
    this.isLoading = true;
    this.api.getCached<any>('catalog/books/?ordering=-is_featured,-created_at&page_size=50', undefined, 5 * 60 * 1000).subscribe({
      next: (response: any) => {
        if (this.destroy$.isStopped) return;
        this.allBooks = response.results || response;
        this.buildSections();
        this.selectMood(this.selectedMood);
        const featured = this.allBooks.filter(b => b.is_featured);
        this.heroBooks = (featured.length ? featured : this.allBooks).slice(0, 20);
        this.heroBookIndex = 0;
        this.heroCoverFailed = false;
        this.heroBook = this.heroBooks[0] || null;
        this.isLoading = false;
        this.loadFailed = false;
        this.cdr.detectChanges();
      },
      error: () => {
        if (this.destroy$.isStopped) return;
        this.isLoading = false;
        this.loadFailed = true;
        this.cdr.detectChanges();
      }
    });

    this.api.get<any>('catalog/books/recommendations/').subscribe({
      next: (response) => {
        this.forYouBooks = response.results || response;
        this.buildPopular();
        this.cdr.detectChanges();
      },
      error: () => { this.forYouBooks = []; }
    });
  }

  private buildSections(): void {
    this.starterBooks = this.allBooks.filter(b => b.is_featured || this.getBookPages(b) >= 220).slice(0, 16);
    this.quickReads = this.allBooks.filter(b => this.isUnderAnHour(b)).slice(0, 16);
    this.buildPopular();
  }

  /**
   * Recomendados: la API los calcula con los géneros de la biblioteca del lector.
   * Sin sesión devuelve los destacados, que ya están en "Para empezar", así que
   * la estantería se oculta en vez de repetirse.
   */
  private buildPopular(): void {
    const shown = new Set(this.starterBooks.map(b => b.slug));
    const fresh = this.forYouBooks.filter(b => !shown.has(b.slug));
    this.popularBooks = this.auth.isLoggedIn() && fresh.length >= 6 ? fresh.slice(0, 16) : [];
  }

  /** Coincide con getReadingTime: 1,4 min por página. */
  private isUnderAnHour(book: Book): boolean {
    const pages = this.getBookPages(book);
    return pages > 0 && pages * 1.4 < 60;
  }

  private loadGenres(): void {
    this.api.getCached<any>('catalog/genres/?page_size=100', undefined, 15 * 60 * 1000).subscribe({
      next: (res: any) => {
        this.genres = (res?.results ?? res ?? [])
          .map((g: any) => ({ id: g.id, name: g.name, slug: g.slug, book_count: g.book_count ?? 0, family: genreFamily(g.slug) }))
          .filter((g: GenreCount) => g.book_count > 0)
          .sort((a: GenreCount, b: GenreCount) => b.book_count - a.book_count)
          .slice(0, 14)
          // Como en una estantería ordenada por colección: los colores quedan juntos.
          .sort((a: GenreCount, b: GenreCount) => FAMILY_ORDER.indexOf(a.family.id) - FAMILY_ORDER.indexOf(b.family.id) || b.book_count - a.book_count);
        this.cdr.detectChanges();
      },
      error: () => { this.genres = []; }
    });
  }

  private loadContinueReading(): void {
    this.api.get<any[]>('library/inventory/').subscribe({
      next: (res: any) => {
        const items = Array.isArray(res) ? res : (res.results || []);
        this.continueReading = items
          .filter((item: any) => {
            const pct = item.progress?.completion_percentage || 0;
            return pct > 0 && pct < 100;
          })
          .sort((a: any, b: any) => (b.progress?.completion_percentage || 0) - (a.progress?.completion_percentage || 0))[0] || null;
        this.cdr.detectChanges();
      },
      error: () => { this.continueReading = null; }
    });
  }

  private loadProfile(): void {
    this.api.get<any>('users/profile/').subscribe({
      next: (profile: any) => {
        if (!profile) return;
        this.userStreak = profile.streak_current ?? 0;
        if (typeof profile.ink_balance === 'number') this.chatService.updateInkBalance(profile.ink_balance);
        this.cdr.detectChanges();
      },
      error: () => { /* sin racha visible */ }
    });
  }

  get continueTitle(): string {
    return this.continueReading?.book_title || this.continueReading?.edition?.book?.title || '';
  }

  get continuePercent(): number {
    return Math.round(this.continueReading?.progress?.completion_percentage || 0);
  }

  // ─── Reparto ─────────────────────────────────────────────────────────────
  private loadCast(): void {
    this.api.get<any>('ai/hub/avatars/?sort=popularity').subscribe({
      next: (response: any) => {
        const avatars: DemoAvatar[] = Array.isArray(response) ? response : (response.results || []);
        this.castAvatars = avatars.slice(0, 7);
        this.characterOfTheDay = this.castAvatars[0] || null;
        this.cdr.detectChanges();
      },
      error: () => { this.castAvatars = []; }
    });
  }

  /** El personaje en foco se destaca y el resto del reparto queda atenuado. */
  focusCast(avatar: DemoAvatar | null): void {
    this.focusedCastId = avatar ? avatar.id : null;
  }

  goToCharacterChat(avatar: DemoAvatar | null): void {
    if (!avatar) return;
    if (!this.auth.isLoggedIn() || !avatar.book_slug) {
      this.router.navigate(['/demo-chat', avatar.id]);
      return;
    }
    this.api.get<any>(`library/inventory/check/?slug=${avatar.book_slug}`).subscribe({
      next: (res: any) => {
        if (res.owned) {
          this.router.navigate(['/reader', res.inventory_id], { queryParams: { chatWith: avatar.id } });
        } else {
          this.router.navigate(['/book', avatar.book_slug]);
        }
      },
      error: () => { this.router.navigate(['/book', avatar.book_slug]); }
    });
  }

  // ─── ¿Qué leer hoy? ──────────────────────────────────────────────────────
  selectMood(moodId: string): void {
    this.selectedMood = moodId;
    const inFamily = (b: Book, id: string) => b.genres?.some(g => genreFamily(g.slug).id === id);
    const pick: Record<string, (b: Book) => boolean> = {
      quick: b => this.isUnderAnHour(b),
      adventure: b => !!inFamily(b, 'aventura'),
      thinking: b => !!inFamily(b, 'pensamiento'),
      drama: b => !!b.genres?.some(g => g.slug === 'teatro'),
      mystery: b => !!inFamily(b, 'misterio')
    };
    const filter = pick[moodId];
    const result = filter ? this.allBooks.filter(filter) : this.allBooks;
    // Primero lo que no aparece en las estanterías de arriba, para que la sugerencia sume.
    const shown = new Set([...this.starterBooks, ...this.quickReads].map(b => b.slug));
    const fresh = result.filter(b => !shown.has(b.slug));
    const pool = fresh.length >= 6 ? fresh : result;
    this.filteredMoodBooks = (pool.length ? pool : this.allBooks).slice(0, 12);
    this.cdr.detectChanges();
  }

  /** Abre la vista previa de un libro al azar del catálogo cargado. */
  surpriseMe(event?: MouseEvent): void {
    const pool = this.allBooks.filter(b => b.synopsis);
    const list = pool.length ? pool : this.allBooks;
    if (!list.length) return;
    this.openQuickView(list[Math.floor(Math.random() * list.length)], event);
  }

  // ─── Lectura asistida ────────────────────────────────────────────────────
  setAssistiveMode(mode: AssistiveMode): void {
    this.assistiveMode = mode;
  }

  private buildDemoWords(): void {
    let offset = 0;
    let index = 0;
    this.demoWords = this.demoParagraphs.map(paragraph => {
      const words = paragraph.split(' ').map(text => {
        const letters = text.replace(/[^\p{L}]/gu, '').length;
        const cut = letters <= 3 ? text.length : Math.ceil(text.length / 2);
        const word: DemoWord = { text, head: text.slice(0, cut), tail: text.slice(cut), start: offset, index: index++ };
        offset += text.length + 1;
        return word;
      });
      return words;
    });
  }

  get demoText(): string {
    return this.demoParagraphs.join(' ');
  }

  toggleNarration(): void {
    if (this.isNarrating) {
      this.stopNarration();
      return;
    }
    if (!this.canNarrate) return;

    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(this.demoText);
    const voices = synth.getVoices().filter(v => v.lang?.toLowerCase().startsWith('es'));
    const voice = voices.find(v => /es[-_](cl|419|mx|us)/i.test(v.lang)) || voices.find(v => /es[-_]es/i.test(v.lang)) || voices[0];
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'es-CL';
    utterance.rate = 0.95;

    const allWords = this.demoWords.flat();
    this.gotBoundary = false;

    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name && event.name !== 'word') return;
      this.gotBoundary = true;
      const word = allWords.filter(w => w.start <= event.charIndex).pop();
      this.zone.run(() => {
        this.narratedWord = word ? word.index : -1;
        this.cdr.detectChanges();
      });
    };
    utterance.onstart = () => {
      // Algunas voces no emiten límites de palabra: se estima el avance.
      const startedAt = performance.now();
      this.narrationTimer = setInterval(() => {
        if (this.gotBoundary) return;
        const estimate = Math.floor(((performance.now() - startedAt) / 1000) * 2.5);
        this.zone.run(() => {
          this.narratedWord = Math.min(estimate, allWords.length - 1);
          this.cdr.detectChanges();
        });
      }, 200);
    };
    utterance.onend = () => this.zone.run(() => this.stopNarration());
    utterance.onerror = () => this.zone.run(() => this.stopNarration());

    this.isNarrating = true;
    this.narratedWord = -1;
    synth.speak(utterance);
  }

  private stopNarration(): void {
    if (this.narrationTimer) {
      clearInterval(this.narrationTimer);
      this.narrationTimer = null;
    }
    if (isPlatformBrowser(this.platformId) && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isNarrating = false;
    this.narratedWord = -1;
    this.cdr.detectChanges();
  }

  // ─── Vista previa ────────────────────────────────────────────────────────
  openQuickView(book: Book, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.lastFocused = isPlatformBrowser(this.platformId) ? document.activeElement as HTMLElement : null;
    this.selectedQuickViewBook = book;
    this.quickViewTab = 'synopsis';
    this.cdr.detectChanges();
  }

  closeQuickView(): void {
    if (!this.selectedQuickViewBook) return;
    this.selectedQuickViewBook = null;
    this.cdr.detectChanges();
    this.lastFocused?.focus?.();
    this.lastFocused = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeQuickView();
  }

  setQuickViewTab(tab: 'synopsis' | 'details'): void {
    this.quickViewTab = tab;
  }

  // ─── Favoritos ───────────────────────────────────────────────────────────
  toggleFavorite(book: Book, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.favoritesService?.setFavorite(book.id, !this.isBookFavorite(book)).subscribe({
      error: (err: any) => console.warn('Error al actualizar favorito:', err)
    });
  }

  isBookFavorite(book: Book): boolean {
    return this.favoritesService?.isFavorite(book.id, book.slug) ?? false;
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────
  /** Portadas que no cargaron: se muestra la ficha tipográfica en su lugar. */
  brokenCovers = new Set<string>();

  markCoverBroken(book: Book): void {
    this.brokenCovers.add(book.slug);
  }

  fmt(value: number): string {
    return value.toLocaleString('es-CL');
  }

  genreNames(book: Book): string {
    return (book.genres || []).map(g => g.name).join(', ');
  }

  thumbUrl(url: string | null | undefined, width = 360, height = 540, quality = 62): string {
    return coverThumb(url, width, height, quality);
  }

  getReadingTime(book: Book): string {
    const pages = this.getBookPages(book);
    if (!pages || pages <= 0) return '';
    const minutes = Math.round(pages * 1.4);
    if (minutes < 60) return `${Math.max(5, minutes)} min`;
    const hours = minutes / 60;
    return hours < 10 ? `${hours.toFixed(1).replace('.', ',')} h` : `${Math.round(hours)} h`;
  }

  scrollShelf(track: HTMLElement, direction: number): void {
    if (!track) return;
    const amount = Math.max(280, Math.floor(track.clientWidth * 0.8));
    track.scrollBy({ left: amount * direction, behavior: this.prefersReducedMotion ? 'auto' : 'smooth' });
  }

  trackBySlug(_: number, book: Book): string {
    return book.slug;
  }

  trackById(_: number, avatar: DemoAvatar): number {
    return avatar.id;
  }

  trackByGenreSlug(_: number, genre: GenreCount): string {
    return genre.slug;
  }

  trackByMoodId(_: number, mood: MoodOption): string {
    return mood.id;
  }
}
