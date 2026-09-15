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
  'cuentos': { desc: 'Narraciones breves y relatos fascinantes de los más grandes maestros de la pluma.', family: 'fiction' },
  'novela-corta': { desc: 'Tramas intensas y cautivadoras diseñadas para leerse en una sola sentada.', family: 'fiction' },
  'teatro': { desc: 'Dramas, tragedias y comedias memorables que cobran vida sobre el escenario.', family: 'arts' },
  'ficcion-clasica': { desc: 'Obras cumbre universales que han trascendido los siglos y civilizaciones.', family: 'fiction' },
  'filosofia': { desc: 'Indagaciones sobre el ser, la ética, el cosmos y los enigmas del pensamiento.', family: 'thought' },
  'poesia': { desc: 'El ritmo, la rima y la métrica de los versos más sublimes de la lírica universal.', family: 'arts' },
  'accion-y-aventura': { desc: 'Viajes audaces, expediciones épicas y hazañas al límite del peligro.', family: 'fiction' },
  'terror': { desc: 'Misterios siniestros, horror psicológico y relatos para estremecer los sentidos.', family: 'fiction' },
  'ficcion-contemporanea': { desc: 'Narrativas modernas que exploran las complejidades y dilemas del presente.', family: 'fiction' },
  'ficcion-historica': { desc: 'Crónicas de época que reviven el pasado con precisión y atmósfera envolvente.', family: 'fiction' },
  'ensayos': { desc: 'Disertaciones críticas, miradas agudas y reflexiones lúcidas del intelecto.', family: 'thought' },
  'religion': { desc: 'Textos sagrados, espiritualidad profunda y búsquedas místicas trascendentes.', family: 'thought' },
  'biografias-diarios-y-hechos-reales': { desc: 'Memorias conmovedoras, testimonios íntimos y vidas que dejaron huella.', family: 'thought' },
  'ciencia-ficcion': { desc: 'Futuros posibles, distopías, viajes interestelares y horizontes tecnológicos.', family: 'fiction' },
  'romantica': { desc: 'Pasiones intensas, vínculos inolvidables y amores contra toda adversidad.', family: 'fiction' },
  'fantasia': { desc: 'Mundos míticos, magia ancestral, héroes de leyenda y sagas épicas.', family: 'fiction' },
  'autoayuda-y-superacion-personal': { desc: 'Sabiduría práctica, crecimiento interior y herramientas para el bienestar.', family: 'thought' },
  'literatura-de-viaje': { desc: 'Crónicas de intrépidos exploradores y rutas remotas a través del planeta.', family: 'thought' },
  'sociedad-y-ciencias-sociales': { desc: 'Análisis de la cultura humana, estructuras sociales y dinámicas colectivas.', family: 'thought' },
  'antologias': { desc: 'Compilaciones selectas de relatos, ensayos y poemas de múltiples voces.', family: 'arts' },
  'politica': { desc: 'Teoría del poder, ideologías, reformas de estado y lucha por la justicia social.', family: 'thought' },
  'policiaca-negra-y-suspense': { desc: 'Enigmas criminales, detectives perspicaces e investigaciones trepidantes.', family: 'fiction' },
  'historia': { desc: 'Los grandes hitos, revoluciones y personajes que forjaron el devenir humano.', family: 'thought' },
  'mitos-leyendas-y-sagas': { desc: 'Tradiciones orales, dioses antiguos y relatos fundacionales de los pueblos.', family: 'arts' },
  'ficcion-erotica': { desc: 'Deseo, sensualidad y narrativas intimistas cargadas de pasión y belleza.', family: 'fiction' },
  'ciencias-tecnologia-y-medicina': { desc: 'Divulgación científica, descubrimientos revolucionarios e innovación.', family: 'thought' },
  'ficcion-religiosa-y-espiritual': { desc: 'Alegorías morales, parábolas y despertares del espíritu y la fe.', family: 'thought' },
  'psicologia': { desc: 'La mente, las emociones, la conducta humana y la búsqueda de autoconocimiento.', family: 'thought' },
  'arte-cine-y-fotografia': { desc: 'Estética visual, historia del arte, teoría del cine y composición visual.', family: 'arts' },
  'historia-teoria-literaria-y-critica': { desc: 'El arte de la retórica, la evolución de los géneros y el análisis literario.', family: 'arts' },
  'infantil-y-juvenil': { desc: 'Historias llenas de imaginación, enseñanzas luminosas y aventuras mágicas.', family: 'fiction' },
  'humor': { desc: 'Ingenio, comedia fina, chispa literaria y una mirada divertida al mundo.', family: 'arts' },
  'satira': { desc: 'Ironía mordaz y crítica incisiva hacia las costumbres e hipocresías sociales.', family: 'arts' }
};

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.css']
})
export class CategoriesComponent implements OnInit {
  private router = inject(Router);
  private api = inject(ApiService);

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
