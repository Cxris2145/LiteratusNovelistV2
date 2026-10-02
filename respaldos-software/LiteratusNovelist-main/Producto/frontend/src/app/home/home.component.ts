import { Component, OnInit, OnDestroy, AfterViewInit, PLATFORM_ID, inject, ChangeDetectorRef, ElementRef, NgZone, ViewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, map, takeUntil } from 'rxjs/operators';

import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';
import { ScrollRevealService } from '../core/services/scroll-reveal.service';
import { coverThumb } from '../core/utils/cover-thumb.util';

export interface Book {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  is_featured: boolean;
  cover_image: string | null;
  author_name?: string;
  ai_character_count?: number;
  genres?: { id: string; name: string; slug: string }[];
}

export interface StarterBook {
  slug: string;
  title: string;
  author: string;
  genre: string;
  cover: string;
}

export interface GenreTile {
  name: string;
  slug: string;
  bookCount: number;
  image: string;
}

/** Personaje del reparto de la portada, ya resuelto contra la API. */
export interface CastCard {
  id: string;
  name: string;
  role: string;
  bookTitle: string;
  bookSlug: string;
  image: string;
  isPortrait: boolean;
}

type HowStep = 'read' | 'listen' | 'adapt' | 'talk';
type ReadingMode = 'normal' | 'focus' | 'bionic' | 'dyslexia';

interface PassageWord {
  head: string;
  tail: string;
}

/**
 * Reparto elegido a mano: personajes conocidos por estudiantes y que existen en
 * el catálogo. La API solo aporta el id del avatar (para abrir el chat) y la
 * portada del libro; si alguno deja de existir, simplemente no se muestra.
 */
const CAST: { name: string; bookSlug: string; role: string }[] = [
  { name: 'Odiseo', bookSlug: 'la-odisea-homero', role: 'Rey de Ítaca. Tarda veinte años en volver a casa.' },
  { name: 'Aquiles', bookSlug: 'la-iliada-homero', role: 'El mejor guerrero griego, y el más orgulloso.' },
  { name: 'Virgilio', bookSlug: 'la-divina-comedia-dante-alighieri', role: 'Guía a Dante por el Infierno y el Purgatorio.' },
  { name: 'Capitán Nemo', bookSlug: 'veinte-mil-leguas-de-viaje-submarino-verne-julio', role: 'Comandante del Nautilus, en guerra con la superficie.' },
  { name: 'Gregorio Samsa', bookSlug: 'la-metamorfosis-kafka-franz', role: 'Despierta convertido en insecto y aún piensa en su trabajo.' },
  { name: 'Alicia', bookSlug: 'las-aventuras-de-alicia-en-el-pais-de-las-maravillas-carroll-lewis', role: 'Cae por la madriguera y discute con todo el que encuentra.' },
  { name: 'El Monstruo', bookSlug: 'frankenstein-mary-shelley', role: 'Busca respuestas de quien le dio la vida.' },
  { name: 'Julieta', bookSlug: 'romeo-y-julieta-shakespeare-william', role: 'Desafía a su familia por amor a un Montesco.' }
];

/**
 * Estantería "Clásicos para empezar": obras conocidas, íntegras y con personajes.
 * Se elige a mano porque ordenar por cantidad de personajes trae títulos al azar
 * (algunos poco adecuados para una portada pensada en estudiantes).
 */
const STARTER_SLUGS = [
  'la-odisea-homero',
  'la-metamorfosis-kafka-franz',
  'romeo-y-julieta-shakespeare-william',
  'la-casa-de-bernarda-alba-garcia-lorca-federico',
  'las-aventuras-de-alicia-en-el-pais-de-las-maravillas-carroll-lewis',
  'frankenstein-mary-shelley',
  'la-vida-de-lazarillo-de-tormes-anonimo',
  'rimas-gustavo-adolfo-becquer',
  'veinte-mil-leguas-de-viaje-submarino-verne-julio',
  'hamlet-shakespeare-william',
  'la-divina-comedia-dante-alighieri',
  'la-celestina-fernando-de-rojas'
];

/**
 * Comienzo real de La Odisea en el catálogo (trad. Luis Segalá y Estalella, 1910),
 * con la ortografía actualizada ("vio", "a").
 */
const ODYSSEY_OPENING = [
  'Háblame, Musa, de aquel varón de multiforme ingenio que, después de destruir la sacra ciudad de Troya, ' +
  'anduvo peregrinando larguísimo tiempo, vio las poblaciones y conoció las costumbres de muchos hombres ' +
  'y padeció en su ánimo gran número de trabajos en su navegación por el ponto, en cuanto procuraba salvar ' +
  'su vida y la vuelta de sus compañeros a la patria.',
  'Mas ni aun así pudo librarlos, como deseaba, y todos perecieron por sus propias locuras. ¡Insensatos! ' +
  'Comiéronse las vacas del Sol, hijo de Hiperión; el cual no permitió que les llegara el día del regreso.'
];

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  public auth = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private host = inject(ElementRef<HTMLElement>);
  private platformId = inject(PLATFORM_ID);
  private scrollReveal = inject(ScrollRevealService);
  private destroy$ = new Subject<void>();
  private observers: IntersectionObserver[] = [];
  private headerObserver?: ResizeObserver;
  private timers: any[] = [];

  prefersReducedMotion = false;
  isLoggedIn = false;

  // ─── Hero ────────────────────────────────────────────────────────────────
  /** Columnas del muro de portadas; cada una se repite en la plantilla para el bucle. */
  wallColumns: string[][] = [];
  totalBooks = 1046;
  totalCharacters = 4477;
  totalAuthors = 313;
  totalGenres = 33;
  private statsCounted = false;

  greeting = 'Hola';
  userName = '';
  userStreak = 0;
  userLevel = 1;
  userLevelName = '';
  userXpPercent = 0;
  userInk = 0;
  profileLoaded = false;
  continueItem: { id: string; title: string; cover: string; percent: number } | null = null;

  /**
   * Qué tarjetas flotantes se ven. Con sesión se espera a saber si hay un libro
   * en curso ('pending') para no mostrar las de visitante y cambiarlas de golpe.
   */
  cardsMode: 'pending' | 'visitor' | 'resume' = 'visitor';
  /** Retraso de entrada: se sincroniza con la secuencia de carga del hero. */
  cardsEnterDelay = 700;
  private initAt = 0;

  // ─── Cómo funciona (panel fijo) ─────────────────────────────────────────
  readonly steps: HowStep[] = ['read', 'listen', 'adapt', 'talk'];
  activeStep: HowStep = 'read';
  readingMode: ReadingMode = 'normal';
  readonly readingModes: { id: ReadingMode; label: string }[] = [
    { id: 'normal', label: 'Normal' },
    { id: 'focus', label: 'Enfoque (TDAH)' },
    { id: 'bionic', label: 'Biónica' },
    { id: 'dyslexia', label: 'Dislexia' }
  ];
  /** Párrafos de muestra, palabra por palabra (lectura biónica y narración). */
  readonly passage: PassageWord[][] = ODYSSEY_OPENING.map(paragraph => paragraph.split(' ').map(word => {
    // Lectura biónica: se resalta la primera mitad de cada palabra.
    const cut = word.length <= 3 ? word.length : Math.ceil(word.length / 2);
    return { head: word.slice(0, cut), tail: word.slice(cut) };
  }));
  /** Índice global de la primera palabra de cada párrafo. */
  readonly passageOffsets = this.passage.map((_, p) => this.passage.slice(0, p).reduce((n, words) => n + words.length, 0));
  private readonly passageLength = this.passage.reduce((n, words) => n + words.length, 0);
  spokenIndex = 0;
  readonly waveBars = Array.from({ length: 32 }, (_, i) => i);
  private narrationTimer: any = null;
  private howVisible = false;

  // ─── Personajes, géneros y libros ───────────────────────────────────────
  cast: CastCard[] = [];
  castLoaded = false;
  odysseus: CastCard | null = null;
  genreTiles: GenreTile[] = [];
  starterBooks: StarterBook[] = [];
  private allBooks: Book[] = [];

  // ─── Carrusel de libros (Clásicos para empezar) ──────────────────────────
  @ViewChild('shelfTrack') shelfTrack?: ElementRef<HTMLDivElement>;
  private shelfObserver?: ResizeObserver;
  shelfCurrentPage = 0;
  shelfTotalPages = 1;
  shelfDots: number[] = [];
  canShelfPrev = false;
  canShelfNext = true;

  // Ilustración del Enigma: "LA ODISEA" con algunas letras aún ocultas.
  readonly enigmaLetters = [
    { ch: 'L', shown: true }, { ch: 'A', shown: true }, { ch: ' ', shown: true },
    { ch: 'O', shown: false }, { ch: 'D', shown: true }, { ch: 'I', shown: false },
    { ch: 'S', shown: true }, { ch: 'E', shown: true }, { ch: 'A', shown: false }
  ];
  readonly inkDrops = [true, true, true, false, false];
  /** Nodos de La Senda en coordenadas del viewBox 0 0 200 320 del trazado SVG. */
  readonly sendaNodes: { state: 'done' | 'current' | 'locked'; x: number; y: number }[] = [
    { state: 'done', x: 100, y: 32 },
    { state: 'done', x: 164, y: 96 },
    { state: 'current', x: 100, y: 160 },
    { state: 'locked', x: 36, y: 224 },
    { state: 'locked', x: 100, y: 288 }
  ];
  readonly sendaPath = this.sendaNodes.map(n => n.x + ',' + n.y).join(' ');
  readonly sendaDonePath = this.sendaNodes.slice(0, 3).map(n => n.x + ',' + n.y).join(' ');
  readonly weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isLoggedIn = this.auth.isLoggedIn();
    this.greeting = this.greetingForHour(new Date().getHours());
    this.initAt = performance.now();
    this.cardsMode = this.isLoggedIn ? 'pending' : 'visitor';

    this.loadStats();
    this.loadBooks();
    this.loadGenres();
    if (this.isLoggedIn) {
      this.loadProfile();
      this.loadContinueReading();
      // Si la biblioteca tarda, se muestran las tarjetas generales mientras tanto.
      this.timers.push(setTimeout(() => {
        if (this.cardsMode === 'pending') this.showCards('visitor');
      }, 2500));
    }
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.trackHeaderHeight();
    this.scrollReveal.scan(this.host.nativeElement);
    this.observeHowSteps();
    // El reparto se pide con margen antes del paso "Conversa", que enlaza a Odiseo.
    this.whenNear('[data-how-step="listen"]', () => this.loadCast());
    this.whenNear('.shelf-section', () => this.loadStarterBooks());
    this.runStatsCounter();

    if (this.shelfTrack?.nativeElement && 'ResizeObserver' in window) {
      this.shelfObserver = new ResizeObserver(() => {
        this.zone.run(() => this.updateShelfPagination());
      });
      this.shelfObserver.observe(this.shelfTrack.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.observers.forEach(o => o.disconnect());
    this.headerObserver?.disconnect();
    this.shelfObserver?.disconnect();
    this.timers.forEach(t => clearTimeout(t));
    this.stopNarration();
  }

  // ─── Datos ───────────────────────────────────────────────────────────────
  private loadStats(): void {
    this.api.getCached<any>('catalog/stats/', undefined, 5 * 60 * 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          if (!res) return;
          if (typeof res.total_books === 'number') this.totalBooks = res.total_books;
          if (typeof res.total_characters === 'number') this.totalCharacters = res.total_characters;
          if (typeof res.total_authors === 'number') this.totalAuthors = res.total_authors;
          if (typeof res.total_genres === 'number') this.totalGenres = res.total_genres;
          this.cdr.detectChanges();
          // Si el contador ya corrió con los valores de respaldo, fija los reales.
          if (this.statsCounted) this.paintStats();
        },
        error: () => { /* conserva los valores de respaldo */ }
      });
  }

  private loadBooks(): void {
    this.api.getCached<any>('catalog/books/?ordering=-is_featured,-created_at&page_size=50', undefined, 5 * 60 * 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.allBooks = res?.results ?? res ?? [];
          this.wallColumns = this.buildWall(this.allBooks);
        },
        error: () => { this.wallColumns = []; }
      });
  }

  /** Detalle de cada libro de la estantería (cacheado; lo comparte el reparto). */
  private loadStarterBooks(): void {
    const requests = STARTER_SLUGS.map(slug =>
      this.api.getCached<any>(`catalog/books/${slug}/`, undefined, 15 * 60 * 1000).pipe(catchError(() => of(null)))
    );
    forkJoin(requests).pipe(takeUntil(this.destroy$)).subscribe(books => {
      this.starterBooks = books
        .filter(b => b?.cover_image)
        .map(b => ({
          slug: b.slug,
          title: b.title,
          author: b.book_authors?.[0]?.author?.full_name || '',
          genre: b.genres?.[0]?.name || '',
          cover: this.thumb(b.cover_image)
        }));
      this.rescan();
      setTimeout(() => this.updateShelfPagination(), 100);
    });
  }

  private buildWall(books: Book[]): string[][] {
    const covers = Array.from(new Set(books.map(b => b.cover_image).filter((c): c is string => !!c)))
      .map(c => coverThumb(c, 320, 320, 58));
    if (covers.length < 10) return [];
    const columns = 6;
    const perColumn = Math.min(6, Math.floor(covers.length / columns));
    return Array.from({ length: columns }, (_, col) =>
      Array.from({ length: perColumn }, (_, row) => covers[(col * perColumn + row) % covers.length])
    );
  }

  private loadGenres(): void {
    this.api.getCached<any>('catalog/genres/?page_size=100', undefined, 15 * 60 * 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          const list: any[] = res?.results ?? res ?? [];
          this.genreTiles = list
            .filter(g => (g.book_count ?? 0) > 0)
            .sort((a, b) => b.book_count - a.book_count)
            .slice(0, 13)
            .map((g, i) => ({
              name: g.name,
              slug: g.slug,
              bookCount: g.book_count,
              image: g.cover_image ? coverThumb(g.cover_image, i === 0 ? 900 : 560, i === 0 ? 900 : 560, 62) : ''
            }));
          this.rescan();
        },
        error: () => { this.genreTiles = []; }
      });
  }

  /** Resuelve el reparto: id del avatar (para el chat) y portada del libro. */
  private loadCast(): void {
    const requests = CAST.map(member => {
      const avatar$ = this.api.getCached<any>(`ai/hub/avatars/?q=${encodeURIComponent(member.name)}&page_size=10`, undefined, 15 * 60 * 1000).pipe(
        map(res => (res?.results ?? res ?? []).find((a: any) => a.book_slug === member.bookSlug) ?? null),
        catchError(() => of(null))
      );
      const book$ = this.api.getCached<any>(`catalog/books/${member.bookSlug}/`, undefined, 15 * 60 * 1000).pipe(catchError(() => of(null)));
      return forkJoin([avatar$, book$]).pipe(
        map(([avatar, book]): CastCard | null => {
          if (!avatar) return null;
          const portrait = avatar.avatar_image_url as string | null;
          return {
            id: String(avatar.id),
            name: member.name,
            role: member.role,
            bookTitle: avatar.book_title || book?.title || '',
            bookSlug: member.bookSlug,
            image: portrait || coverThumb(book?.cover_image, 480, 640, 62),
            isPortrait: !!portrait
          };
        })
      );
    });

    forkJoin(requests).pipe(takeUntil(this.destroy$)).subscribe(cards => {
      this.cast = cards.filter((c): c is CastCard => !!c);
      this.odysseus = this.cast.find(c => c.bookSlug === 'la-odisea-homero') ?? null;
      this.castLoaded = true;
      this.rescan();
    });
  }

  private loadProfile(): void {
    this.api.get<any>('users/profile/').pipe(takeUntil(this.destroy$)).subscribe({
      next: p => {
        if (!p) return;
        const user = this.auth.currentUser();
        this.userName = user?.username || user?.email?.split('@')[0] || '';
        this.userStreak = p.streak_current ?? 0;
        this.userLevel = p.level ?? 1;
        this.userLevelName = p.level_name || '';
        this.userInk = p.ink_balance ?? 0;
        const toNext = Number(p.xp_to_next_level) || 0;
        const xp = Number(p.xp) || 0;
        this.userXpPercent = toNext > 0 ? Math.min(100, Math.round((xp / (xp + toNext)) * 100)) : 100;
        this.profileLoaded = true;
        this.cdr.detectChanges();
      },
      error: () => { this.profileLoaded = false; }
    });
  }

  private loadContinueReading(): void {
    this.api.get<any>('library/inventory/').pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        const items: any[] = Array.isArray(res) ? res : (res?.results ?? []);
        const inProgress = items
          .map(it => ({ it, pct: it.progress?.completion_percentage || 0 }))
          .filter(x => x.pct > 0 && x.pct < 100)
          .sort((a, b) => b.pct - a.pct)[0];
        if (!inProgress) {
          this.showCards('visitor');
          return;
        }
        this.continueItem = {
          id: inProgress.it.id,
          title: inProgress.it.book_title || inProgress.it.edition?.book?.title || 'Tu libro',
          cover: coverThumb(inProgress.it.book_cover, 120, 160, 62),
          percent: Math.round(inProgress.pct)
        };
        this.showCards('resume');
      },
      error: () => {
        this.continueItem = null;
        this.showCards('visitor');
      }
    });
  }

  /**
   * Cambia el grupo de tarjetas visible. La entrada y la salida son transiciones
   * CSS; aquí solo se decide cuándo empieza a entrar el grupo nuevo: nunca antes
   * de la secuencia de carga del hero y, si reemplaza a otro, un poco después de
   * que ese empiece a salir.
   */
  private showCards(mode: 'visitor' | 'resume'): void {
    if (this.cardsMode === mode) return;
    const replacing = this.cardsMode !== 'pending';
    const sinceLoad = performance.now() - this.initAt;
    this.cardsEnterDelay = Math.round(Math.max(replacing ? 160 : 0, 700 - sinceLoad));
    this.cardsMode = mode;
    this.cdr.detectChanges();
  }

  // ─── Navegación ──────────────────────────────────────────────────────────
  scrollToSection(id: string): void {
    const el = this.host.nativeElement.querySelector(`#${id}`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: this.prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  goToCharacterChat(card: CastCard | null): void {
    if (!card) {
      this.router.navigate(['/characters']);
      return;
    }
    if (!this.isLoggedIn) {
      this.router.navigate(['/demo-chat', card.id]);
      return;
    }
    this.api.get<any>(`library/inventory/check/?slug=${card.bookSlug}`).subscribe({
      next: res => res?.owned
        ? this.router.navigate(['/reader', res.inventory_id], { queryParams: { chatWith: card.id } })
        : this.router.navigate(['/book', card.bookSlug]),
      error: () => this.router.navigate(['/book', card.bookSlug])
    });
  }

  openRandomBook(): void {
    const pool: { slug: string }[] = this.allBooks.length ? this.allBooks : this.starterBooks;
    if (!pool.length) {
      this.router.navigate(['/catalog']);
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.router.navigate(['/book', pick.slug]);
  }

  scrollShelf(track: HTMLElement, direction: number): void {
    const amount = Math.max(260, Math.floor(track.clientWidth * 0.8)) * direction;
    track.scrollBy({ left: amount, behavior: this.prefersReducedMotion ? 'auto' : 'smooth' });
  }

  onShelfScroll(): void {
    if (!this.shelfTrack?.nativeElement) return;
    const el = this.shelfTrack.nativeElement;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 5) {
      this.canShelfPrev = false;
      this.canShelfNext = false;
      this.shelfCurrentPage = 0;
      this.cdr.markForCheck();
      return;
    }
    this.canShelfPrev = el.scrollLeft > 10;
    this.canShelfNext = el.scrollLeft < maxScroll - 10;

    const cardWidth = 184 + 22;
    const visibleCards = Math.max(1, Math.floor(el.clientWidth / cardWidth));
    const pageFraction = el.scrollLeft / (visibleCards * cardWidth);
    this.shelfCurrentPage = Math.min(Math.max(0, this.shelfDots.length - 1), Math.max(0, Math.round(pageFraction)));
    this.cdr.markForCheck();
  }

  updateShelfPagination(): void {
    if (!this.shelfTrack?.nativeElement || !this.starterBooks.length) return;
    const el = this.shelfTrack.nativeElement;
    const cardWidth = 184 + 22;
    const visibleCards = Math.max(1, Math.floor(el.clientWidth / cardWidth));
    const pages = Math.ceil(this.starterBooks.length / visibleCards);
    this.shelfTotalPages = Math.max(1, pages);
    this.shelfDots = Array.from({ length: this.shelfTotalPages }, (_, i) => i);
    this.onShelfScroll();
    this.cdr.markForCheck();
  }

  scrollShelfPage(direction: number): void {
    if (!this.shelfTrack?.nativeElement) return;
    const el = this.shelfTrack.nativeElement;
    const cardWidth = 184 + 22;
    const visibleCards = Math.max(1, Math.floor(el.clientWidth / cardWidth));
    const scrollAmount = visibleCards * cardWidth * direction;
    el.scrollBy({ left: scrollAmount, behavior: this.prefersReducedMotion ? 'auto' : 'smooth' });
    setTimeout(() => this.onShelfScroll(), 350);
  }

  goToShelfPage(pageIndex: number): void {
    if (!this.shelfTrack?.nativeElement) return;
    const el = this.shelfTrack.nativeElement;
    const cardWidth = 184 + 22;
    const visibleCards = Math.max(1, Math.floor(el.clientWidth / cardWidth));
    const targetScroll = pageIndex * visibleCards * cardWidth;
    el.scrollTo({ left: targetScroll, behavior: this.prefersReducedMotion ? 'auto' : 'smooth' });
    this.shelfCurrentPage = pageIndex;
    setTimeout(() => this.onShelfScroll(), 350);
  }

  // ─── Cómo funciona: pasos que cambian el panel ──────────────────────────
  setReadingMode(mode: ReadingMode): void {
    this.readingMode = mode;
  }

  private observeHowSteps(): void {
    const root = this.host.nativeElement as HTMLElement;
    const stepEls = Array.from(root.querySelectorAll<HTMLElement>('[data-how-step]'));
    const section = root.querySelector('.how-section');
    if (!stepEls.length || !section || !('IntersectionObserver' in window)) return;

    this.zone.runOutsideAngular(() => {
      // Un paso se activa cuando cruza la franja central de la pantalla.
      const stepObserver = new IntersectionObserver(entries => {
        const hit = entries.find(e => e.isIntersecting);
        if (!hit) return;
        const step = (hit.target as HTMLElement).dataset['howStep'] as HowStep;
        this.zone.run(() => this.activateStep(step));
      }, {
        // En pantallas angostas el panel ocupa la parte de arriba: la franja baja.
        rootMargin: window.matchMedia('(max-width: 899px)').matches ? '-70% 0px -20% 0px' : '-45% 0px -45% 0px'
      });
      stepEls.forEach(el => stepObserver.observe(el));

      // La narración de muestra solo avanza mientras la sección está en pantalla.
      const sectionObserver = new IntersectionObserver(([entry]) => {
        this.howVisible = entry.isIntersecting;
        this.zone.run(() => this.syncNarration());
      });
      sectionObserver.observe(section);

      this.observers.push(stepObserver, sectionObserver);
    });
  }

  private activateStep(step: HowStep): void {
    if (step === this.activeStep) return;
    this.activeStep = step;
    // Al llegar a "Adapta" se muestra un modo distinto para que el cambio se note.
    if (step === 'adapt' && this.readingMode === 'normal') this.readingMode = 'bionic';
    if (step !== 'adapt') this.readingMode = 'normal';
    this.syncNarration();
    this.cdr.detectChanges();
  }

  private syncNarration(): void {
    const shouldRun = this.howVisible && this.activeStep === 'listen' && !this.prefersReducedMotion;
    if (shouldRun && !this.narrationTimer) {
      this.zone.runOutsideAngular(() => {
        this.narrationTimer = setInterval(() => {
          this.spokenIndex = (this.spokenIndex + 1) % this.passageLength;
          this.cdr.detectChanges();
        }, 340);
      });
    } else if (!shouldRun) {
      this.stopNarration();
      if (this.prefersReducedMotion) this.spokenIndex = 8;
    }
  }

  private stopNarration(): void {
    if (this.narrationTimer) {
      clearInterval(this.narrationTimer);
      this.narrationTimer = null;
    }
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────
  private greetingForHour(hour: number): string {
    if (hour >= 6 && hour < 12) return 'Buenos días';
    if (hour >= 12 && hour < 20) return 'Buenas tardes';
    return 'Buenas noches';
  }

  /**
   * El header global es sticky y su alto cambia (burbujas plegadas, móvil).
   * Se expone como --header-h para que el hero y el panel fijo no queden debajo.
   */
  private trackHeaderHeight(): void {
    const header = document.querySelector<HTMLElement>('.main-header');
    const host = this.host.nativeElement as HTMLElement;
    if (!header || !('ResizeObserver' in window)) return;
    this.zone.runOutsideAngular(() => {
      this.headerObserver = new ResizeObserver(() => {
        host.style.setProperty('--header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
      });
      this.headerObserver.observe(header);
    });
  }

  /** Ejecuta `cb` una sola vez cuando el elemento se acerca al viewport. */
  private whenNear(selector: string, cb: () => void): void {
    const el = (this.host.nativeElement as HTMLElement).querySelector(selector);
    if (!el || !('IntersectionObserver' in window)) {
      cb();
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      this.zone.run(cb);
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    this.observers.push(io);
  }

  /** Vuelve a registrar los elementos recién pintados en el observador de scroll. */
  private rescan(): void {
    this.cdr.detectChanges();
    this.timers.push(setTimeout(() => this.scrollReveal.scan(this.host.nativeElement), 0));
  }

  /** Cifras del hero: cuentan hacia arriba una sola vez al cargar la portada. */
  private runStatsCounter(): void {
    const els = this.statEls();
    if (this.prefersReducedMotion || !els.length) {
      this.statsCounted = true;
      this.paintStats();
      return;
    }
    this.zone.runOutsideAngular(() => {
      const start = performance.now() + 450;
      const duration = 1100;
      const tick = (now: number) => {
        const t = Math.min(Math.max((now - start) / duration, 0), 1);
        const eased = 1 - Math.pow(1 - t, 3);
        els.forEach(el => {
          const target = this.statTarget(el);
          el.textContent = Math.round(target * eased).toLocaleString('es-CL');
        });
        if (t < 1 && !this.destroy$.isStopped) {
          requestAnimationFrame(tick);
        } else {
          this.statsCounted = true;
          this.paintStats();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private statEls(): HTMLElement[] {
    return Array.from((this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-stat]'));
  }

  private statTarget(el: HTMLElement): number {
    switch (el.dataset['stat']) {
      case 'books': return this.totalBooks;
      case 'characters': return this.totalCharacters;
      case 'authors': return this.totalAuthors;
      default: return 0;
    }
  }

  private paintStats(): void {
    this.statEls().forEach(el => el.textContent = this.statTarget(el).toLocaleString('es-CL'));
  }

  thumb(url: string | null): string {
    return coverThumb(url, 360, 480, 62);
  }

  trackBySlug(_: number, item: { slug: string }): string {
    return item.slug;
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
