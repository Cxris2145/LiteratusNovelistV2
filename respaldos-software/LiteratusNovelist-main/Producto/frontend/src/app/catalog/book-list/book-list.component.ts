import { Component, DestroyRef, OnInit, Input, inject, HostListener } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { HttpParams } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { FavoritesService } from '../../core/services/favorites.service';
import { getBookPages } from '../../core/utils/book-pages.util';

export interface Book {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  is_featured: boolean;
  cover_image: string | null;
  created_at: string;
  author_name?: string | null;
  word_count?: number;
  page_count?: number | null;
  genres?: { id?: string; name: string; slug: string }[];
  coverThumb?: string;
  coverLoaded?: boolean;
  coverPriority?: boolean;
  readingProgress?: number;
  inventoryId?: string;
  readingTimeEstimate?: string;
  badges?: string[];
}

export interface GenreCount {
  id: string;
  name: string;
  slug: string;
  book_count: number;
}

interface GenreGroup {
  title: string;
  items: GenreCount[];
}

interface PaginatedResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Book[];
}

@Component({
  selector: 'app-book-list',
  templateUrl: './book-list.component.html',
  styleUrl: './book-list.component.css'
})
export class BookListComponent implements OnInit {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private favoritesService = inject(FavoritesService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @Input() isHome: boolean = false;
  getBookPages = getBookPages;

  rawBooks: Book[] = [];
  books: Book[] = [];
  isLoading = true;
  errorMsg = '';
  totalCount = 0;
  currentPage = 1;

  /* ── Géneros horizontales y desplegable ── */
  genres: GenreCount[] = [];
  genreGroups: GenreGroup[] = [];
  totalBooksCount = 0;
  activeGenreSlug: string | null = null;
  moreGenresOpen = false;
  moreGenresSearch = '';

  readonly PINNED_GENRES: { name: string; slug: string | null }[] = [
    { name: 'Todos', slug: null },
    { name: 'Aventura', slug: 'accion-y-aventura' },
    { name: 'Fantasía', slug: 'fantasia' },
    { name: 'Clásicos', slug: 'ficcion-clasica' },
    { name: 'Cuentos', slug: 'cuentos' },
    { name: 'Terror', slug: 'terror' },
  ];

  /* ── Filtros rápidos ── */
  readonly QUICK_FILTERS = [
    { id: 'populares', label: 'Más populares', icon: 'trending_up' },
    { id: 'nuevos', label: 'Nuevos', icon: 'auto_awesome' },
    { id: 'clasicos', label: 'Clásicos', icon: 'history_edu' },
    { id: 'cortos', label: 'Cortos', icon: 'schedule' },
    { id: 'gratis', label: 'Gratis', icon: 'redeem' },
  ];
  activeQuickFilter: string | null = null;

  /* ── Selector de orden ── */
  readonly SORT_OPTIONS = [
    { id: 'recommended', label: 'Recomendados' },
    { id: 'popular', label: 'Más leídos' },
    { id: 'top_rated', label: 'Mejor valorados' },
    { id: 'alpha', label: 'A-Z' },
    { id: 'shortest', label: 'Más cortos' },
  ];
  activeSort = 'recommended';
  sortDropdownOpen = false;

  /* ── Modal de filtros avanzados ── */
  advancedFiltersOpen = false;
  filterLength: 'all' | 'short' | 'medium' | 'long' = 'all';
  filterFeaturedOnly = false;

  /* ── Asistente "¿No sabes qué leer?" ── */
  wizardOpen = false;
  wizardStep: 1 | 2 | 3 | 4 = 1;
  wizardMood = '';
  wizardDuration = '';
  wizardExperience = '';
  wizardMatches: { book: Book; matchPercent: number; reason: string }[] = [];

  /* ── Recomendados para ti ── */
  recommendedBooks: Book[] = [];
  isLoadingRecommendations = false;

  /* ── Favoritos & Inventario ── */
  favoritesSet = new Set<string>();
  pendingFavoriteIds = new Set<string>();
  userInventoryMap = new Map<string, { inventoryId: string; progress: number }>();

  get pageSize(): number {
    return this.activeGenreSlug || this.searchTerm ? 50 : 24;
  }

  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize);
  }

  get activeGenreName(): string | null {
    if (!this.activeGenreSlug) return null;
    const g = this.genres.find(x => x.slug === this.activeGenreSlug);
    if (g) return g.name;
    const pinned = this.PINNED_GENRES.find(p => p.slug === this.activeGenreSlug);
    return pinned ? pinned.name : this.activeGenreSlug;
  }

  get isMoreGenreActive(): boolean {
    if (!this.activeGenreSlug) return false;
    return !this.PINNED_GENRES.some(p => p.slug === this.activeGenreSlug);
  }

  get otherGenres(): GenreCount[] {
    const pinnedSlugs = new Set(this.PINNED_GENRES.map(p => p.slug).filter(Boolean));
    let list = this.genres.filter(g => !pinnedSlugs.has(g.slug));
    if (this.moreGenresSearch.trim()) {
      const q = this.moreGenresSearch.toLowerCase().trim();
      list = list.filter(g => g.name.toLowerCase().includes(q));
    }
    return list;
  }

  get activeSortLabel(): string {
    const found = this.SORT_OPTIONS.find(s => s.id === this.activeSort);
    return found ? found.label : 'Recomendados';
  }

  get hasActiveAdvancedFilters(): boolean {
    return this.filterLength !== 'all' || this.filterFeaturedOnly;
  }

  private readonly FICTION_SLUGS = new Set<string>([
    'accion-y-aventura', 'antologias', 'ciencia-ficcion', 'cuentos', 'fantasia',
    'ficcion-clasica', 'ficcion-contemporanea', 'ficcion-erotica', 'ficcion-historica',
    'ficcion-religiosa-y-espiritual', 'literatura-de-viaje', 'mitos-leyendas-y-sagas',
    'novela-corta', 'poesia', 'policiaca-negra-y-suspense', 'romantica', 'satira',
    'teatro', 'terror', 'infantil-y-juvenil', 'humor', 'relatos'
  ]);
  private readonly NONFICTION_SLUGS = new Set<string>([
    'biografias-diarios-y-hechos-reales', 'ensayos', 'filosofia', 'historia',
    'psicologia', 'sociedad-y-ciencias-sociales', 'religion', 'politica',
    'autoayuda-y-superacion-personal', 'ciencias-tecnologia-y-medicina',
    'arte-cine-y-fotografia', 'historia-teoria-literaria-y-critica'
  ]);

  private readonly EAGER_COVERS = 8;
  searchTerm = '';
  private searchTimeout: any;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.more-genres-wrapper')) {
      this.moreGenresOpen = false;
    }
    if (!target.closest('.sort-dropdown-container')) {
      this.sortDropdownOpen = false;
    }
  }

  ngOnInit(): void {
    this.favoritesService.bookKeys$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(keys => this.favoritesSet = new Set(keys));
    this.loadUserInventory();

    if (!this.isHome) {
      this.loadGenres();
      this.loadRecommendations();
    }

    this.route.queryParams.subscribe(params => {
      if (params['search'] !== undefined) {
        this.searchTerm = params['search'] || '';
        this.currentPage = 1;
      }
      this.fetchBooks();
    });
  }

  favoriteToast: string | null = null;
  private toastTimer: any;

  showToast(msg: string): void {
    this.favoriteToast = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.favoriteToast = null;
    }, 3200);
  }

  /* ── Portadas y Decoración ── */
  thumb(url: string | null | undefined): string {
    if (!url) return 'assets/default_cover.jpg';
    return url;
  }

  private decorateBooks(list: Book[]): Book[] {
    return list.map((b, i) => {
      const inv = this.userInventoryMap.get(b.id) || (b.slug ? this.userInventoryMap.get(b.slug) : undefined);
      const readingProgress = inv?.progress;
      const inventoryId = inv?.inventoryId;

      let estTime = '';
      if (b.word_count && b.word_count > 0) {
        const mins = Math.ceil(b.word_count / 200);
        estTime = mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(1)} h`;
      } else if (b.page_count && b.page_count > 0) {
        const mins = Math.ceil((b.page_count * 230) / 200);
        estTime = mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(1)} h`;
      }

      const badges: string[] = [];
      if (b.is_featured) badges.push('Destacado');
      const isClassic = b.genres?.some(g => g.slug === 'ficcion-clasica') || false;
      if (isClassic) badges.push('Clásico');
      if (b.page_count && b.page_count <= 100) badges.push('Corto');
      badges.push('Gratis');

      return {
        ...b,
        coverThumb: this.thumb(b.cover_image),
        coverPriority: i < this.EAGER_COVERS,
        coverLoaded: true,
        readingProgress,
        inventoryId,
        readingTimeEstimate: estTime,
        badges,
      };
    });
  }

  onImgLoad(book: Book): void {
    book.coverLoaded = true;
  }

  onImgError(event: Event, book?: Book): void {
    const img = event.target as HTMLImageElement;
    if (book) book.coverLoaded = true;
    if (!img.src.endsWith('default_cover.jpg')) {
      img.src = 'assets/default_cover.jpg';
    }
  }

  trackBook = (_: number, b: Book) => b.id;
  trackGenre = (_: number, g: GenreCount) => g.slug;

  /* ── Favoritos ── */
  loadFavorites(): void {
    this.favoritesService.load().subscribe({
      error: error => console.warn('No se pudieron cargar los favoritos.', error),
    });
  }

  isFavorite(book: Book): boolean {
    return this.favoritesSet.has(book.id) || (!!book.slug && this.favoritesSet.has(book.slug));
  }

  toggleFavorite(book: Book, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const key = book.id || book.slug;
    if (!key) return;
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (this.pendingFavoriteIds.has(book.id)) return;

    const willBeFavorite = !this.isFavorite(book);
    this.pendingFavoriteIds.add(book.id);
    this.favoritesService
      .setFavorite(book.id, willBeFavorite)
      .pipe(finalize(() => this.pendingFavoriteIds.delete(book.id)))
      .subscribe({
        next: () => {
          this.showToast(willBeFavorite ? `«${book.title}» agregado a tus favoritos.` : `«${book.title}» quitado de favoritos.`);
        },
        error: error => {
          console.error('No se pudo actualizar el favorito.', error);
          this.showToast('No se pudo actualizar el favorito. Intenta nuevamente.');
        },
      });
  }

  /* ── Progreso de lectura e inventario ── */
  loadUserInventory(): void {
    if (!this.authService.isLoggedIn()) return;

    this.api.get<any[]>('library/inventory/').subscribe({
      next: (res: any) => {
        const items = Array.isArray(res) ? res : (res?.results || []);
        this.userInventoryMap.clear();

        for (const item of items) {
          const progress = item.progress?.completion_percentage || 0;
          const invData = { inventoryId: item.id, progress };

          if (item.edition?.book?.id) {
            this.userInventoryMap.set(String(item.edition.book.id), invData);
          }
          if (item.edition?.book?.slug) {
            this.userInventoryMap.set(String(item.edition.book.slug), invData);
          }
          if (item.book_id) {
            this.userInventoryMap.set(String(item.book_id), invData);
          }
          if (item.book_slug) {
            this.userInventoryMap.set(String(item.book_slug), invData);
          }
        }

        if (this.rawBooks.length > 0) {
          this.rawBooks = this.decorateBooks(this.rawBooks);
          this.applySortAndFilter();
        }
      },
      error: () => {}
    });
  }

  /* ── Recomendados para ti ── */
  loadRecommendations(): void {
    this.isLoadingRecommendations = true;
    this.api.getCached<any>('catalog/books/recommendations/', undefined, 10 * 60 * 1000).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res?.results || []);
        this.recommendedBooks = this.decorateBooks(list.slice(0, 6));
        this.isLoadingRecommendations = false;
      },
      error: () => {
        this.isLoadingRecommendations = false;
      }
    });
  }

  /* ── Carga de Géneros ── */
  private loadGenres(): void {
    this.api.getCached<any>('catalog/genres/?page_size=100', undefined, 15 * 60 * 1000).subscribe({
      next: (res) => {
        const list: GenreCount[] = (res?.results ?? res ?? [])
          .map((g: any) => ({
            id: g.id,
            name: g.name,
            slug: g.slug,
            book_count: g.book_count ?? 0,
          }))
          .filter((g: GenreCount) => g.book_count > 0);
        this.genres = list;
        this.genreGroups = this.buildGroups(list);
        if (!this.totalBooksCount) {
          this.totalBooksCount = list.reduce((acc, g) => acc + g.book_count, 0);
        }
      },
      error: () => {}
    });

    this.api.getCached<any>('catalog/stats/', undefined, 10 * 60 * 1000).subscribe({
      next: (stats: any) => {
        if (typeof stats?.total_books === 'number') this.totalBooksCount = stats.total_books;
      },
      error: () => {}
    });
  }

  private buildGroups(list: GenreCount[]): GenreGroup[] {
    const byName = (a: GenreCount, b: GenreCount) => a.name.localeCompare(b.name, 'es');
    const fiction = list.filter(g => this.FICTION_SLUGS.has(g.slug)).sort(byName);
    const nonfiction = list.filter(g => this.NONFICTION_SLUGS.has(g.slug)).sort(byName);
    const known = new Set([...fiction, ...nonfiction].map(g => g.slug));
    const other = list.filter(g => !known.has(g.slug)).sort(byName);

    const groups: GenreGroup[] = [];
    if (fiction.length) groups.push({ title: 'Literatura y ficción', items: fiction });
    if (nonfiction.length) groups.push({ title: 'No ficción', items: nonfiction });
    if (other.length) groups.push({ title: 'Otras categorías', items: other });
    return groups;
  }

  selectGenre(slug: string | null): void {
    this.activeGenreSlug = this.activeGenreSlug === slug ? null : slug;
    this.currentPage = 1;
    this.moreGenresOpen = false;
    this.fetchBooks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleMoreGenres(event: MouseEvent): void {
    event.stopPropagation();
    this.moreGenresOpen = !this.moreGenresOpen;
  }

  /* ── Filtros rápidos ── */
  toggleQuickFilter(filterId: string): void {
    if (this.activeQuickFilter === filterId) {
      this.activeQuickFilter = null;
    } else {
      this.activeQuickFilter = filterId;
    }
    this.applySortAndFilter();
  }

  /* ── Selector de orden ── */
  toggleSortDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.sortDropdownOpen = !this.sortDropdownOpen;
  }

  setSort(sortId: string): void {
    this.activeSort = sortId;
    this.sortDropdownOpen = false;
    this.applySortAndFilter();
  }

  /* ── Filtros avanzados ── */
  toggleAdvancedFilters(): void {
    this.advancedFiltersOpen = !this.advancedFiltersOpen;
  }

  resetAdvancedFilters(): void {
    this.filterLength = 'all';
    this.filterFeaturedOnly = false;
    this.applySortAndFilter();
  }

  applyAdvancedFilters(): void {
    this.advancedFiltersOpen = false;
    this.applySortAndFilter();
  }

  /* ── Asistente "¿No sabes qué leer?" ── */
  openWizard(): void {
    this.wizardOpen = true;
    this.wizardStep = 1;
    this.wizardMood = '';
    this.wizardDuration = '';
    this.wizardExperience = '';
    this.wizardMatches = [];
  }

  closeWizard(): void {
    this.wizardOpen = false;
  }

  selectWizardMood(mood: string): void {
    this.wizardMood = mood;
    this.wizardStep = 2;
  }

  selectWizardDuration(duration: string): void {
    this.wizardDuration = duration;
    this.wizardStep = 3;
  }

  selectWizardExperience(exp: string): void {
    this.wizardExperience = exp;
    this.calculateWizardRecommendations();
  }

  calculateWizardRecommendations(): void {
    const candidates = this.rawBooks.length > 0 ? this.rawBooks : this.books;
    if (candidates.length === 0) {
      this.wizardMatches = [];
      this.wizardStep = 4;
      return;
    }

    const scored = candidates.map(book => {
      let score = 70;
      let reason = 'Excelente obra recomendada para ti';

      if (this.wizardMood === 'epico' && (book.genres?.some(g => g.slug === 'fantasia' || g.slug === 'accion-y-aventura') || book.is_featured)) {
        score += 25;
        reason = 'Aventura épica y mundos fantásticos';
      } else if (this.wizardMood === 'misterio' && book.genres?.some(g => g.slug === 'terror' || g.slug === 'policiaca-negra-y-suspense')) {
        score += 26;
        reason = 'Intriga inmersiva y giros sorprendentes';
      } else if (this.wizardMood === 'reflexion' && (book.genres?.some(g => g.slug === 'ficcion-clasica' || g.slug === 'filosofia' || g.slug === 'ensayos'))) {
        score += 27;
        reason = 'Profundidad literaria y reflexión atemporal';
      } else if (this.wizardMood === 'ligero' && (book.genres?.some(g => g.slug === 'cuentos' || g.slug === 'humor' || g.slug === 'relatos') || (book.page_count && book.page_count < 120))) {
        score += 24;
        reason = 'Lectura ágil, absorbente y placentera';
      }

      if (this.wizardDuration === 'corto' && book.page_count && book.page_count <= 120) {
        score += 15;
      } else if (this.wizardDuration === 'medio' && book.page_count && book.page_count > 120 && book.page_count <= 300) {
        score += 15;
      } else if (this.wizardDuration === 'largo' && book.page_count && book.page_count > 300) {
        score += 15;
      }

      if (book.is_featured) score += 5;
      const matchPercent = Math.min(99, Math.max(82, score));
      return { book, matchPercent, reason };
    });

    scored.sort((a, b) => b.matchPercent - a.matchPercent);
    this.wizardMatches = scored.slice(0, 3);
    this.wizardStep = 4;
  }

  /* ── Consulta y ordenamiento determinístico ── */
  fetchBooks(): void {
    this.isLoading = true;
    this.errorMsg = '';

    let params = new HttpParams();
    if (this.searchTerm) {
      params = params.set('search', this.searchTerm);
    }
    if (this.activeGenreSlug) {
      params = params.set('genres__slug', this.activeGenreSlug);
    }
    params = params.set('page_size', String(this.pageSize));
    params = params.set('page', this.currentPage);

    if (!this.searchTerm) {
      params = params.set('ordering', '-is_featured,-created_at');
    }

    const isInitialPage = !this.activeGenreSlug && !this.searchTerm && this.currentPage === 1;

    if (isInitialPage && this.rawBooks.length === 0) {
      try {
        const stored = sessionStorage.getItem('literatus_static_catalog_p1');
        if (stored) {
          const parsed: PaginatedResponse = JSON.parse(stored);
          if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
            this.rawBooks = this.decorateBooks(parsed.results);
            this.totalCount = parsed.count;
            this.applySortAndFilter();
            this.isLoading = false;
          }
        }
      } catch (_) {}
    }

    const cached = this.api.peekCached<PaginatedResponse>('catalog/books/', params);
    if (cached) {
      this.rawBooks = this.decorateBooks(cached.results);
      this.totalCount = cached.count;
      this.applySortAndFilter();
      this.isLoading = false;
    }

    this.api.getCached<PaginatedResponse>('catalog/books/', params, 10 * 60 * 1000).subscribe({
      next: (response) => {
        this.rawBooks = this.decorateBooks(response.results);
        this.totalCount = response.count;
        this.applySortAndFilter();
        this.isLoading = false;
        if (isInitialPage) {
          try {
            sessionStorage.setItem('literatus_static_catalog_p1', JSON.stringify(response));
          } catch (_) {}
        }
      },
      error: (err) => {
        console.error(err);
        if (!cached && this.rawBooks.length === 0) {
          this.errorMsg = 'No pudimos cargar la biblioteca. Por favor, revisa tu conexión.';
        }
        this.isLoading = false;
      }
    });
  }

  applySortAndFilter(): void {
    let list = [...this.rawBooks];

    // 1. Filtro rápido activo
    if (this.activeQuickFilter) {
      switch (this.activeQuickFilter) {
        case 'populares':
          list = list.filter(b => b.is_featured);
          if (list.length === 0) list = [...this.rawBooks];
          break;
        case 'nuevos':
          list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          break;
        case 'clasicos':
          list = list.filter(b => b.genres?.some(g => g.slug === 'ficcion-clasica') || b.badges?.includes('Clásico'));
          break;
        case 'cortos':
          list = list.filter(b => (b.page_count && b.page_count <= 150) || (b.word_count && b.word_count <= 35000));
          break;
        case 'gratis':
          // Catálogo de dominio público y acceso libre
          break;
      }
    }

    // 2. Filtros avanzados
    if (this.filterFeaturedOnly) {
      list = list.filter(b => b.is_featured);
    }
    if (this.filterLength === 'short') {
      list = list.filter(b => (b.page_count && b.page_count <= 120) || (b.word_count && b.word_count <= 28000));
    } else if (this.filterLength === 'medium') {
      list = list.filter(b => (b.page_count && b.page_count > 120 && b.page_count <= 300));
    } else if (this.filterLength === 'long') {
      list = list.filter(b => (b.page_count && b.page_count > 300));
    }

    // 3. Ordenamiento
    switch (this.activeSort) {
      case 'popular':
        list.sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
        break;
      case 'top_rated':
        list.sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0) || a.title.localeCompare(b.title, 'es'));
        break;
      case 'alpha':
        list.sort((a, b) => a.title.localeCompare(b.title, 'es'));
        break;
      case 'shortest':
        list.sort((a, b) => (a.page_count || 999) - (b.page_count || 999));
        break;
      case 'recommended':
      default:
        // Mantener orden natural estático (-is_featured, -created_at)
        break;
    }

    this.books = list;
  }

  onSearch(event: any): void {
    this.searchTerm = event.target.value;
    this.currentPage = 1;
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchBooks(), 400);
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.activeGenreSlug = null;
    this.activeQuickFilter = null;
    this.activeSort = 'recommended';
    this.filterLength = 'all';
    this.filterFeaturedOnly = false;
    this.currentPage = 1;
    this.fetchBooks();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.fetchBooks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToBook(book: Book): void {
    this.router.navigate(['/book', book.slug]);
  }

  continueReading(book: Book, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (book.inventoryId) {
      this.router.navigate(['/reader', book.inventoryId]);
    } else {
      this.router.navigate(['/book', book.slug]);
    }
  }
}
