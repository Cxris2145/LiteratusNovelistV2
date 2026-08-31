import { Component, OnInit, OnDestroy, Input, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { HttpParams } from '@angular/common/http';
import { Subscription } from 'rxjs';

export interface Book {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  is_featured: boolean;
  cover_image: string | null;
  created_at: string;
}

interface PaginatedResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Book[];
}

interface GenreFilter {
  name: string;
  slug: string;
  book_count?: number;
}

@Component({
  selector: 'app-book-list',
  templateUrl: './book-list.component.html',
  styleUrl: './book-list.component.css'
})
export class BookListComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  @Input() isHome: boolean = false;

  books: Book[] = [];
  categoryFilters: GenreFilter[] = [];
  isLoading = true;
  errorMsg = '';
  totalCount = 0;
  currentPage = 1;
  searchTerm = '';
  activeCategory: GenreFilter | null = null;
  ordering = '-created_at';

  private searchTimeout: any;
  private booksRequestSub?: Subscription;
  private genresRequestSub?: Subscription;

  get totalPages(): number {
    const size = this.activeCategory || this.searchTerm ? 50 : 24;
    return Math.ceil(this.totalCount / size);
  }

  ngOnInit(): void {
    this.fetchCategories();
    this.fetchBooks();
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimeout);
    this.booksRequestSub?.unsubscribe();
    this.genresRequestSub?.unsubscribe();
  }

  fetchCategories(): void {
    const params = new HttpParams()
      .set('page_size', '100')
      .set('ordering', 'name');

    this.genresRequestSub = this.api.get<any>('catalog/genres/', params).subscribe({
      next: (response) => {
        this.categoryFilters = (response.results || response)
          .filter((genre: GenreFilter) => genre.book_count === undefined || genre.book_count > 0)
          .map((genre: GenreFilter) => ({
            name: genre.name,
            slug: genre.slug,
            book_count: genre.book_count || 0,
          }));
      },
      error: (err) => console.error('Error loading category filters', err)
    });
  }

  fetchBooks(): void {
    this.isLoading = true;
    this.errorMsg = '';

    let params = new HttpParams();
    if (this.searchTerm) {
      params = params.set('search', this.searchTerm);
    }
    if (this.activeCategory) {
      params = params.set('genres__slug', this.activeCategory.slug);
    }
    if (this.ordering) {
      params = params.set('ordering', this.ordering);
    }

    params = params.set('page_size', this.activeCategory || this.searchTerm ? '50' : '24');
    params = params.set('page', this.currentPage);
    params = params.set('compact', 'true');

    this.booksRequestSub?.unsubscribe();
    this.booksRequestSub = this.api.get<PaginatedResponse>('catalog/books/', params).subscribe({
      next: (response) => {
        this.books = response.results;
        this.totalCount = response.count;
        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.errorMsg = 'No pudimos cargar la biblioteca. Por favor, revisa tu conexión.';
        this.isLoading = false;
      }
    });
  }

  onSearch(event: any): void {
    this.searchTerm = (event.target.value || '').trim();
    this.currentPage = 1;
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchBooks(), 400);
  }

  setCategory(category: GenreFilter): void {
    this.activeCategory = this.activeCategory?.slug === category.slug ? null : category;
    this.currentPage = 1;
    this.fetchBooks();
  }

  onOrderingChange(event: any): void {
    this.ordering = event.target.value;
    this.currentPage = 1;
    this.fetchBooks();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.activeCategory = null;
    this.ordering = '-created_at';
    this.currentPage = 1;
    this.fetchBooks();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.fetchBooks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  trackByBook(index: number, book: Book): string {
    return book.slug || String(book.id || index);
  }

  trackByCategory(index: number, category: GenreFilter): string {
    return category.slug || String(index);
  }
}
