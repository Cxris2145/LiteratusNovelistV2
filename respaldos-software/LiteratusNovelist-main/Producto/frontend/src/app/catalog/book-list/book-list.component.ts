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
  /** Campos derivados en cliente (no vienen del backend) */
  coverThumb?: string;
  coverLoaded?: boolean;
  coverPriority?: boolean;
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

  get totalPages(): number {
    const size = this.activeCategory || this.searchTerm ? 50 : 24;
    return Math.ceil(this.totalCount / size);
  }

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
      return url.replace('/object/public/', '/render/image/public/')
        + (url.includes('?') ? '&' : '?') + 'width=360&quality=62&resize=cover';
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

  searchTerm = '';
  activeCategory: string | null = null;
  private searchTimeout: any;

  // Mapeo: Nombre en la píldora → Nombre exacto guardado en la DB
  // Algunas categorías quedaron con .title() en el backend, otras no.
  genreDbMap: Record<string, string> = {
    'Acción y aventura':        'Acción y aventura',
    'Ciencia ficción':          'Ciencia ficción',
    'Cuentos':                  'Cuentos',
    'Fantasía':                 'Fantasía',
    'Ficción clásica':          'Ficción clásica',
    'Ficción contemporánea':    'Ficción contemporánea',
    'Poesía':                   'Poesía',
    'Romántica':                'Romántica',
    'Terror':                   'Terror',
    'Antologías':               'Antologías',
    'Novela corta':             'Novela corta',
    'Teatro':                   'Teatro',
    'Ficción histórica':        'Ficción histórica',
    'Ficción erótica':          'Ficción erótica',
    'Ficción religiosa y espiritual': 'Ficción religiosa y espiritual',
    'Mitos, leyendas y sagas':  'Mitos, leyendas y sagas',
    'Policíaca, negra y suspense': 'Policíaca, negra y suspense',
    'Sátira':                   'Sátira',
    'Literatura de viaje':      'Literatura de viaje',
    // No ficción — algunas de estas están con mayúsculas en la DB
    'Filosofía':                'Filosofía',
    'Historia':                 'Historia',
    'Psicología':               'Psicología',
    'Biografías, diarios y hechos reales': 'Biografías, Diarios Y Hechos Reales',
    'Ensayos':                  'Ensayos',
    'Sociedad y ciencias sociales': 'Sociedad Y Ciencias Sociales',
  };

  categories = [
    { name: 'Literatura y ficción', sub: [
      'Acción y aventura', 'Antologías', 'Ciencia ficción', 'Cuentos', 'Fantasía',
      'Ficción clásica', 'Ficción contemporánea', 'Ficción erótica', 'Ficción histórica',
      'Ficción religiosa y espiritual', 'Literatura de viaje', 'Mitos, leyendas y sagas',
      'Novela corta', 'Poesía', 'Policíaca, negra y suspense', 'Romántica',
      'Sátira', 'Teatro', 'Terror'
    ]},
    { name: 'No ficción', sub: [
      'Biografías, diarios y hechos reales', 'Ensayos', 'Filosofía',
      'Historia', 'Psicología', 'Sociedad y ciencias sociales'
    ]}
  ];
  allSubcategories: string[] = [];

  ngOnInit(): void {
    this.categories.forEach(cat => this.allSubcategories.push(...cat.sub));
    this.fetchBooks();
  }

  fetchBooks() {
    this.isLoading = true;
    this.errorMsg = '';

    // Construimos los query params para el backend
    let params = new HttpParams();
    if (this.searchTerm) {
      params = params.set('search', this.searchTerm);
    }
    if (this.activeCategory) {
      // Usar el mapa para enviar el nombre exacto como está en la DB
      const dbName = this.genreDbMap[this.activeCategory] || this.activeCategory;
      params = params.set('genres__name', dbName);
    }
    // Traer más resultados por página cuando hay filtro activo
    params = params.set('page_size', this.activeCategory || this.searchTerm ? '50' : '24');
    params = params.set('page', this.currentPage);

    // Si no hay filtro activo, mostrar libros de forma aleatoria
    if (!this.activeCategory && !this.searchTerm) {
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

  setCategory(cat: string) {
    this.activeCategory = this.activeCategory === cat ? null : cat;
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
