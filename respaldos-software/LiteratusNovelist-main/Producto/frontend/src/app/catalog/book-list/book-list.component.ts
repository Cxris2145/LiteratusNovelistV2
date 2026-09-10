import { Component, OnInit, Input, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';

// Tipos adaptados al BookListSerializer de Django
export interface Book {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  is_featured: boolean;
  cover_image: string | null;
  created_at: string;
  /** Nombre del autor principal (BookListSerializer.author_name) */
  author_name?: string | null;
  /** Nº EXACTO de palabras del libro (BookListSerializer.word_count) */
  word_count?: number;
  /** Nº de páginas = word_count / 230 redondeado (BookListSerializer.page_count) */
  page_count?: number | null;
  genres?: { id?: string; name: string; slug: string }[];
  /** Campos derivados en cliente (no vienen del backend) */
  coverThumb?: string;
  coverLoaded?: boolean;
  coverPriority?: boolean;
}

/** Género con su nº de libros — viene de /catalog/genres/ */
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
  private router = inject(Router);

  @Input() isHome: boolean = false;

  books: Book[] = [];
  isLoading = true;
  errorMsg = '';
  totalCount = 0;
  currentPage = 1;

  /* ── Filtro de géneros (barra lateral) ── */
  genres: GenreCount[] = [];
  genreGroups: GenreGroup[] = [];
  totalBooksCount = 0;
  activeGenreSlug: string | null = null;
  /** En móvil la barra lateral es un panel deslizante. */
  sidebarOpen = false;

  get pageSize(): number {
    return this.activeGenreSlug || this.searchTerm ? 50 : 24;
  }

  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize);
  }

  get activeGenreName(): string | null {
    if (!this.activeGenreSlug) return null;
    const g = this.genres.find(x => x.slug === this.activeGenreSlug);
    return g ? g.name : null;
  }

  /** Slugs que consideramos "Literatura y ficción"; el resto es "No ficción". */
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

  /** Nº de portadas de la primera "pantalla" que cargan con prioridad alta
   *  (eager + fetchpriority=high). El resto usa lazy + prioridad baja. */
  private readonly EAGER_COVERS = 8;

  /**
   * Miniatura optimizada. Usa la transformación de imágenes de Supabase
   * (~1/3 del peso; formato negociado por Accept → webp/avif) para las portadas
   * de Storage; deja igual las locales (assets/). Se calcula UNA vez por libro
   * (ver decorateBooks) — nunca desde el binding del template.
   */
  thumb(url: string | null | undefined): string {
    if (!url) return 'assets/default_cover.jpg';
    if (url.includes('/storage/v1/object/public/')) {
      // Las portadas fuente son cuadradas (800x800); si no se pasa 'height'
      // junto a 'resize=cover', Supabase recorta una franja angosta en vez
      // de reescalar, cortando el titulo. Pedimos el mismo alto que ancho.
      return url.replace('/object/public/', '/render/image/public/')
        + (url.includes('?') ? '&' : '?') + 'width=360&height=360&quality=62&resize=cover';
    }
    return url;
  }

  /** Enriquece cada libro con su URL de miniatura y su prioridad de carga. */
  private decorateBooks(list: Book[]): Book[] {
    return list.map((b, i) => ({
      ...b,
      coverThumb: this.thumb(b.cover_image),
      coverPriority: i < this.EAGER_COVERS,
      coverLoaded: false,
    }));
  }

  onImgLoad(book: Book): void {
    book.coverLoaded = true;
  }

  onImgError(event: Event, book?: Book): void {
    const img = event.target as HTMLImageElement;
    if (book) book.coverLoaded = true; // quita el skeleton igualmente
    if (!img.src.endsWith('default_cover.jpg')) {
      img.src = 'assets/default_cover.jpg';
    }
  }

  trackBook = (_: number, b: Book) => b.id;
  trackGenre = (_: number, g: GenreCount) => g.slug;

  searchTerm = '';
  private searchTimeout: any;

  ngOnInit(): void {
    if (!this.isHome) {
      this.loadGenres();
    }
    this.fetchBooks();
  }

  /* ═══════════════════════════════════════════════════════════════════
     GÉNEROS  (barra lateral con contadores)
     ═══════════════════════════════════════════════════════════════════ */
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
        // Reserva mientras llega /stats/: suma de contadores (cuenta de más
        // los libros multi-género, pero sirve de aproximación inicial).
        if (!this.totalBooksCount) {
          this.totalBooksCount = list.reduce((acc, g) => acc + g.book_count, 0);
        }
      },
      error: () => { /* la barra lateral simplemente no aparece */ }
    });

    // Conteo real de libros distintos para "Todos los géneros".
    this.api.getCached<any>('catalog/stats/', undefined, 10 * 60 * 1000).subscribe({
      next: (stats: any) => {
        if (typeof stats?.total_books === 'number') this.totalBooksCount = stats.total_books;
      },
      error: () => { /* se mantiene la reserva */ }
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
    if (other.length) groups.push({ title: 'Más géneros', items: other });
    return groups;
  }

  selectGenre(slug: string | null): void {
    this.activeGenreSlug = this.activeGenreSlug === slug ? null : slug;
    this.currentPage = 1;
    this.sidebarOpen = false;
    this.fetchBooks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  /* ═══════════════════════════════════════════════════════════════════
     LIBROS
     ═══════════════════════════════════════════════════════════════════ */
  fetchBooks() {
    this.isLoading = true;
    this.errorMsg = '';

    // Construimos los query params para el backend
    let params = new HttpParams();
    if (this.searchTerm) {
      params = params.set('search', this.searchTerm);
    }
    if (this.activeGenreSlug) {
      params = params.set('genres__slug', this.activeGenreSlug);
    }
    // Traer más resultados por página cuando hay filtro activo
    params = params.set('page_size', String(this.pageSize));
    params = params.set('page', this.currentPage);

    // Si no hay filtro activo, mostrar libros de forma aleatoria
    if (!this.activeGenreSlug && !this.searchTerm) {
      params = params.set('ordering', '?');
    }

    // Pinta al instante desde caché (si existe) y refresca en segundo plano:
    // Explorar → Libro → Volver ya no muestra el skeleton de nuevo.
    const cached = this.api.peekCached<PaginatedResponse>('catalog/books/', params);
    if (cached) {
      this.books = this.decorateBooks(cached.results);
      this.totalCount = cached.count;
      this.isLoading = false;
    }

    this.api.getCached<PaginatedResponse>('catalog/books/', params, 3 * 60 * 1000).subscribe({
      next: (response) => {
        this.books = this.decorateBooks(response.results);
        this.totalCount = response.count;
        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        if (!cached) {
          this.errorMsg = 'No pudimos cargar la biblioteca. Por favor, revisa tu conexión.';
        }
        this.isLoading = false;
      }
    });
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value;
    this.currentPage = 1;
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchBooks(), 400);
  }

  clearFilters() {
    this.searchTerm = '';
    this.activeGenreSlug = null;
    this.currentPage = 1;
    this.fetchBooks();
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.fetchBooks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
