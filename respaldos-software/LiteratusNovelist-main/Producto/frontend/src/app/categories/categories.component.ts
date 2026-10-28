import { ScrollRevealService } from '../core/services/scroll-reveal.service';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/services/api.service';
import { environment } from '../../environments/environment';

export interface Category {
  name: string;
  slug: string;
  image: string;
  description: string;
  color: string;
  bookCount?: number;
  family: 'fiction' | 'thought' | 'arts';
  imageLoaded?: boolean;
}

const CATEGORY_METADATA: Record<string, { desc: string; family: 'fiction' | 'thought' | 'arts' }> = {
  'literatura-y-ficcion': { desc: 'Clásicos inmortales, cuentos y novelas que definieron el curso de la historia.', family: 'fiction' },
  'ficcion-clasica': { desc: 'Las grandes novelas de todos los tiempos: Cervantes, Flaubert, Galdós, Tolstói y Dostoievski.', family: 'fiction' },
  'accion-y-aventura': { desc: 'Naufragios, islas desiertas y vueltas al mundo: viajes y expediciones al límite.', family: 'fiction' },
  'ciencia-ficcion': { desc: 'Viajes a la Luna, futuros imaginados y mundos fantásticos, de Verne a Lewis Carroll.', family: 'fiction' },
  'terror': { desc: 'Detectives, crímenes y relatos góticos para leer con la luz encendida.', family: 'fiction' },
  'romantica': { desc: 'Pasiones, cartas y amores contra toda adversidad, de Jane Austen a Jorge Isaacs.', family: 'fiction' },
  'ficcion-historica': { desc: 'Mosqueteros, caballeros y revoluciones: el pasado contado como una aventura.', family: 'fiction' },
  'cuentos': { desc: 'Cuentos clásicos, fábulas y relatos infantiles para leer en una tarde.', family: 'fiction' },
  'teatro': { desc: 'Tragedias, comedias y dramas de Sófocles a Lorca, para leer en voz alta.', family: 'arts' },
  'poesia': { desc: 'Epopeyas y versos inmortales: Homero, Dante, Bécquer, Darío y Machado.', family: 'arts' },
  'filosofia': { desc: 'Las preguntas de siempre: Platón, Marco Aurelio, Kant, Nietzsche y los grandes ensayistas.', family: 'thought' }
};

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.css']
})
export class CategoriesComponent implements OnInit {
  private router = inject(Router);
  private api = inject(ApiService);
  private scrollReveal = inject(ScrollRevealService);

  searchTerm = '';
  isLoading = true;
  totalBooksCount = 0;

  // Filtros y ordenamiento
  selectedFamily: 'all' | 'fiction' | 'thought' | 'arts' = 'all';
  sortOption: 'popular' | 'alpha' = 'popular';

  categories: Category[] = [];

  // Paleta de acentos temáticos
  private colors = [
    '#a855f7', '#ef4444', '#06b6d4', '#22c55e', 
    '#f59e0b', '#fb923c', '#ec4899', '#f43f5e',
    '#8b5cf6', '#3b82f6', '#10b981', '#eab308'
  ];

  // Placeholder para skeleton
  skeletonCards = Array(12).fill(0);

  get filteredCategories(): Category[] {
    let result = this.categories;

    // Filtro por familia
    if (this.selectedFamily !== 'all') {
      result = result.filter(c => c.family === this.selectedFamily);
    }

    // Filtro por término de búsqueda
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      result = result.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.description.toLowerCase().includes(term)
      );
    }

    // Ordenamiento
    if (this.sortOption === 'alpha') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    } else {
      result = [...result].sort((a, b) => (b.bookCount || 0) - (a.bookCount || 0));
    }

    return result;
  }

  get totalCategoriesCount(): number {
    return this.categories.length;
  }

  ngOnInit(): void {
    this.loadCounts();
  }

  loadCounts(): void {
    this.isLoading = true;
    this.api.getCached<any>('catalog/genres/?page_size=100', undefined, 15 * 60 * 1000).subscribe({
      next: (res) => {
        const genres = res.results || res;
        this.categories = genres.map((g: any, index: number) => {
          const meta = CATEGORY_METADATA[g.slug] || {
            desc: `Explora nuestra colección selecta de obras de ${g.name.toLowerCase()}.`,
            family: 'fiction' as const
          };

          const color = this.colors[index % this.colors.length];
          const resolvedCover = this.resolveCategoryCover(g);

          return {
            name: g.name,
            slug: g.slug,
            image: resolvedCover,
            description: meta.desc,
            color: color,
            family: meta.family,
            bookCount: g.book_count || 0,
            imageLoaded: false
          };
        });

        // Asegurar tarjeta insignia "Literatura y Ficción"
        if (!this.categories.find(c => c.slug === 'literatura-y-ficcion')) {
          this.categories.unshift({
            name: 'Literatura y Ficción',
            slug: 'literatura-y-ficcion',
            image: 'https://tknsbrxgkreikcbowvla.supabase.co/storage/v1/object/public/literatus-media/category_covers/literatura-de-viaje.webp',
            description: 'Clásicos inmortales, cuentos y novelas que definieron la historia.',
            color: '#D4AF37',
            family: 'fiction',
            bookCount: this.categories.reduce((acc, curr) => acc + (curr.bookCount || 0), 0),
            imageLoaded: false
          });
        }

        this.isLoading = false;
        this.scrollReveal.debouncedScan(); // la grilla .stagger-group recién se pinta

        // Conteo general en vivo de libros
        this.api.getCached<any>('catalog/stats/', undefined, 10 * 60 * 1000).subscribe({
          next: (stats: any) => {
            const card = this.categories.find(c => c.slug === 'literatura-y-ficcion');
            if (stats && typeof stats.total_books === 'number') {
              this.totalBooksCount = stats.total_books;
              if (card) {
                card.bookCount = stats.total_books;
              }
            } else {
              this.totalBooksCount = this.categories.reduce((acc, c) => acc + (c.bookCount || 0), 0);
            }
          },
          error: () => {
            this.totalBooksCount = this.categories.reduce((acc, c) => acc + (c.bookCount || 0), 0);
          }
        });
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  /**
   * Resuelve la portada asegurando fallback en cascada
   */
  private resolveCategoryCover(g: any): string {
    if (g.cover_image && typeof g.cover_image === 'string' && g.cover_image.trim()) {
      return g.cover_image;
    }
    // Fallback a CDN de Supabase activo
    return `https://tknsbrxgkreikcbowvla.supabase.co/storage/v1/object/public/literatus-media/category_covers/${g.slug}.webp`;
  }

  /**
   * Manejador de error cuando una imagen no puede cargarse
   */
  onImageError(cat: Category): void {
    // Si falla la URL principal, intentamos con el CDN alterno o el SVG artesanal
    const secondaryUrl = `https://srbmswjsbkpftjabcurg.supabase.co/storage/v1/object/public/literatus-media/category_covers/${cat.slug}.webp`;
    if (cat.image !== secondaryUrl && !cat.image.includes('default_category.svg')) {
      cat.image = secondaryUrl;
    } else {
      cat.image = 'assets/images/default_category.svg';
    }
    cat.imageLoaded = true;
  }

  onImageLoad(cat: Category): void {
    cat.imageLoaded = true;
  }

  setFamily(family: 'all' | 'fiction' | 'thought' | 'arts'): void {
    this.selectedFamily = family;
  }

  setSort(sort: 'popular' | 'alpha'): void {
    this.sortOption = sort;
  }

  goToCategory(slug: string): void {
    this.router.navigate(['/categories', slug]);
  }

  onSearch(event: any): void {
    this.searchTerm = event.target.value;
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  trackBySlug(index: number, cat: Category): string {
    return cat.slug;
  }
}
