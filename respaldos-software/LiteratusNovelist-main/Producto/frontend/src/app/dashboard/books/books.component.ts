import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-books',
  templateUrl: './books.component.html',
  styleUrls: ['./books.component.css']
})
export class BooksComponent implements OnInit {
  books: any[] = [];
  filteredBooks: any[] = [];
  paginatedBooks: any[] = [];
  loading = true;

  // Filtros y Vista
  searchQuery = '';
  activeFilter: 'all' | 'published' | 'draft' | 'featured' = 'all';
  viewMode: 'grid' | 'table' = 'grid';

  // Paginación
  currentPage = 1;
  pageSize = 24;
  totalPages = 1;

  actionToast = '';

  constructor(private bookService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadBooks();
  }

  loadBooks(): void {
    this.loading = true;
    this.bookService.getBooks().subscribe({
      next: (data) => {
        this.books = data;
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  setFilter(filter: 'all' | 'published' | 'draft' | 'featured'): void {
    this.activeFilter = filter;
    this.currentPage = 1;
    this.applyFilters();
  }

  setViewMode(mode: 'grid' | 'table'): void {
    this.viewMode = mode;
  }

  onSearch(event: any): void {
    this.searchQuery = event.target.value.toLowerCase().trim();
    this.currentPage = 1;
    this.applyFilters();
  }

  applyFilters(): void {
    let result = this.books;

    // Filtro por pestaña
    if (this.activeFilter === 'published') {
      result = result.filter(b => b.is_published);
    } else if (this.activeFilter === 'draft') {
      result = result.filter(b => !b.is_published);
    } else if (this.activeFilter === 'featured') {
      result = result.filter(b => b.is_featured);
    }

    // Filtro por búsqueda
    if (this.searchQuery) {
      result = result.filter(b =>
        b.title.toLowerCase().includes(this.searchQuery) ||
        (b.authors && b.authors.some((a: string) => a.toLowerCase().includes(this.searchQuery)))
      );
    }

    this.filteredBooks = result;
    this.totalPages = Math.max(1, Math.ceil(this.filteredBooks.length / this.pageSize));
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    this.updatePagination();
  }

  updatePagination(): void {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    this.paginatedBooks = this.filteredBooks.slice(start, end);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, this.currentPage - 2);
    let end = Math.min(this.totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  togglePublish(book: any, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.bookService.togglePublishBook(book.id).subscribe({
      next: (res) => {
        book.is_published = res.is_published;
        this.actionToast = res.message;
        setTimeout(() => this.actionToast = '', 3500);
      },
      error: () => alert('No se pudo cambiar el estado de publicación.')
    });
  }

  deleteBook(book: any, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (confirm(`¿Estás seguro de eliminar "${book.title}"? Esta acción no se puede deshacer.`)) {
      this.bookService.deleteBook(book.id).subscribe({
        next: () => {
          this.books = this.books.filter(b => b.id !== book.id);
          this.applyFilters();
          this.actionToast = `Libro "${book.title}" eliminado.`;
          setTimeout(() => this.actionToast = '', 3500);
        },
        error: () => alert('No se pudo eliminar el libro.')
      });
    }
  }

  get publishedCount(): number {
    return this.books.filter(b => b.is_published).length;
  }

  get draftCount(): number {
    return this.books.filter(b => !b.is_published).length;
  }

  get featuredCount(): number {
    return this.books.filter(b => b.is_featured).length;
  }
}
