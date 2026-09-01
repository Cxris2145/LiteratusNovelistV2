import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/services/api.service';

export interface Category {
  name: string;
  slug: string;
  image: string;
  description: string;
  color: string;
  bookCount?: number;
}

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.css']
})
export class CategoriesComponent implements OnInit {
  private router = inject(Router);
  private api = inject(ApiService);

  searchTerm = '';
  isLoading = false;

  categories: Category[] = [];

  // Paleta de colores Premium
  private colors = [
    '#a855f7', '#ef4444', '#06b6d4', '#22c55e', 
    '#f59e0b', '#fb923c', '#ec4899', '#f43f5e',
    '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'
  ];

  get filteredCategories(): Category[] {
    if (!this.searchTerm) return this.categories;
    return this.categories.filter(c =>
      c.name.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  ngOnInit(): void {
    this.loadCounts();
  }

  loadCounts(): void {
    this.isLoading = true;
    this.api.get<any>('catalog/genres/?page_size=100').subscribe({
      next: (res) => {
        const genres = res.results || res;
        this.categories = genres.map((g: any, index: number) => {
          // Asignar color secuencial
          const color = this.colors[index % this.colors.length];
          
          return {
            name: g.name,
            slug: g.slug,
            image: g.cover_image || '/assets/default_cover.jpg',
            description: `Explora nuestra increíble colección de ${g.name.toLowerCase()}`,
            color: color,
            bookCount: g.book_count || 0
          };
        });
        
        // Agregar manualmente "Literatura y Ficción" general (si se desea) u otras personalizadas
        if (!this.categories.find(c => c.slug === 'literatura-y-ficcion')) {
          this.categories.unshift({
            name: 'Literatura y Ficción',
            slug: 'literatura-y-ficcion',
            image: 'https://srbmswjsbkpftjabcurg.supabase.co/storage/v1/object/public/literatus-media/category_covers/literatura-de-viaje.webp',
            description: 'Clásicos inmortales, cuentos y novelas que definieron la historia',
            color: '#a855f7',
            bookCount: this.categories.reduce((acc, curr) => acc + (curr.bookCount || 0), 0)
          });
        }

        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
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
}
