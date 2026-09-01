import { Component, OnInit, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { HttpParams } from '@angular/common/http';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

@Component({
  selector: 'app-author-list',
  templateUrl: './author-list.component.html',
  styleUrls: ['./author-list.component.css']
})
export class AuthorListComponent implements OnInit {
  authors: any[] = [];
  filteredAuthors: any[] = [];
  loading = true;
  api = inject(ApiService);

  // Paginación
  totalCount = 0;
  currentPage = 1;
  pageSize = 12;
  nextUrl: string | null = null;
  previousUrl: string | null = null;

  // Filtros
  searchTerm = '';
  activeFilter = 'a-z';
  onlyWithPhoto = false;
  private searchTimeout: any;

  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize);
  }

  ngOnInit() {
    this.fetchAuthors();
  }

  fetchAuthors(page = 1) {
    this.loading = true;
    let params = new HttpParams()
      .set('page', page)
      .set('page_size', this.pageSize);

    if (this.searchTerm) {
      params = params.set('search', this.searchTerm);
    }

    // Ordenamiento delegado al servidor
    if (this.activeFilter === 'a-z') {
      params = params.set('ordering', 'full_name');
    } else if (this.activeFilter === 'z-a') {
      params = params.set('ordering', '-full_name');
    } else if (this.activeFilter === 'books') {
      params = params.set('ordering', '-book_count');
    }

    this.api.get<PaginatedResponse<any>>('catalog/authors/', params).subscribe({
      next: (data) => {
        this.totalCount = data.count;
        this.nextUrl = data.next;
        this.previousUrl = data.previous;
        this.currentPage = page;
        this.authors = data.results;
        // Filtro local de foto (no existe en servidor, se aplica aquí)
        this.filteredAuthors = this.onlyWithPhoto
          ? data.results.filter((a: any) => a.photo)
          : data.results;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading authors', err);
        this.loading = false;
      }
    });
  }

  filterAuthors() {
    this.fetchAuthors(1);
  }

  setFilter(event: any) {
    this.activeFilter = event.target.value;
    this.fetchAuthors(1);
  }

  togglePhotoFilter() {
    this.onlyWithPhoto = !this.onlyWithPhoto;
    this.filteredAuthors = this.onlyWithPhoto
      ? this.authors.filter(a => a.photo)
      : [...this.authors];
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value;
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchAuthors(1), 400);
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.fetchAuthors(page);
  }
}
