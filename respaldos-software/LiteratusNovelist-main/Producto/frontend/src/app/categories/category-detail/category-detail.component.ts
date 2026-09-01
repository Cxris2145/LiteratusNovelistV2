import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { HttpParams } from '@angular/common/http';
import { Category } from '../categories.component';

interface Book {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  cover_image: string | null;
  is_featured: boolean;
  created_at: string;
  book_authors?: any[];
}

@Component({
  selector: 'app-category-detail',
  templateUrl: './category-detail.component.html',
  styleUrls: ['./category-detail.component.css']
})
export class CategoryDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);

  categorySlug = '';
  category: Category | null = null;
  books: Book[] = [];
  isLoading = true;
  isLoadingMore = false;
  searchTerm = '';
  totalCount = 0;
  
  // Pagination
  currentPage = 1;
  pageSize = 10;
  hasMore = true;
  
  private searchTimeout: any;

  // Paleta de colores Premium (fallback)
  private colors = [
    '#a855f7', '#ef4444', '#06b6d4', '#22c55e', 
    '#f59e0b', '#fb923c', '#ec4899', '#f43f5e'
  ];

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.categorySlug = params['slug'];
      this.loadCategoryMeta();
      this.resetPagination();
      this.fetchBooks();
    });
  }

  loadCategoryMeta(): void {
    const hash = Array.from(this.categorySlug).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const color = this.colors[hash % this.colors.length];
    const nameStr = this.categorySlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Fallback inicial mientras carga
    this.category = {
      name: nameStr,
      slug: this.categorySlug,
      image: '/assets/default_cover.jpg',
      description: `Explora nuestra colección de ${nameStr.toLowerCase()}`,
      color: color,
    };

    // Obtenemos los detalles reales del backend
    this.api.get<any>(`catalog/genres/${this.categorySlug}/`).subscribe({
      next: (res) => {
        this.category = {
          name: res.name || nameStr,
          slug: res.slug || this.categorySlug,
          image: res.cover_image || '/assets/default_cover.jpg',
          description: `Explora nuestra colección de ${(res.name || nameStr).toLowerCase()}`,
          color: color,
        };
      },
      error: (err) => console.error('Error fetching category', err)
    });
  }

  resetPagination(): void {
    this.currentPage = 1;
    this.books = [];
    this.hasMore = true;
    this.totalCount = 0;
  }

  fetchBooks(isLoadMore = false): void {
    if (isLoadMore) {
      this.isLoadingMore = true;
      this.currentPage++;
    } else {
      this.isLoading = true;
    }

    let params = new HttpParams()
      .set('page', this.currentPage.toString())
      .set('page_size', this.pageSize.toString());
      
    // En el backend, el filtro usa el ID o el slug, vamos a pasar genres__slug
    if (this.categorySlug !== 'literatura-y-ficcion') {
      params = params.set('genres__slug', this.categorySlug);
    }

    if (this.searchTerm) {
      params = params.set('search', this.searchTerm);
    }

    this.api.get<any>('catalog/books/', params).subscribe({
      next: (res) => {
        const newBooks = res.results || res;
        if (isLoadMore) {
          this.books = [...this.books, ...newBooks];
        } else {
          this.books = newBooks;
        }
        
        this.totalCount = res.count || this.books.length;
        // Check si hay página siguiente
        this.hasMore = !!res.next;
        
        this.isLoading = false;
        this.isLoadingMore = false;
      },
      error: () => {
        this.isLoading = false;
        this.isLoadingMore = false;
      }
    });
  }

  onSearch(event: any): void {
    this.searchTerm = event.target.value;
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.resetPagination();
      this.fetchBooks();
    }, 500);
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.resetPagination();
    this.fetchBooks();
  }

  loadMore(): void {
    if (this.hasMore && !this.isLoadingMore) {
      this.fetchBooks(true);
    }
  }

  goToBook(slug: string): void {
    this.router.navigate(['/book', slug]);
  }

  goBack(): void {
    this.router.navigate(['/categories']);
  }
}
