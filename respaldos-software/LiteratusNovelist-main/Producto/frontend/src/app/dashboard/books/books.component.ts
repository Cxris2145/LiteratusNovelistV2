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
  loading = true;
  activeFilter: 'all' | 'published' | 'draft' = 'all';
  searchQuery = '';

  constructor(private bookService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadBooks();
  }

  loadBooks(): void {
    this.loading = true;
    this.bookService.getBooks().subscribe({
      next: (data) => {
        this.books = data || [];
        this.applyFilters();
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  reloadBooks(): void {
    this.loadBooks();
  }

  setFilter(filter: 'all' | 'published' | 'draft'): void {
    this.activeFilter = filter;
    this.applyFilters();
  }

  onSearchChange(event: any): void {
    this.searchQuery = (event.target.value || '').toLowerCase();
    this.applyFilters();
  }

  applyFilters(): void {
    const q = this.searchQuery.trim();
    this.filteredBooks = this.books.filter(b => {
      const titleMatch = b.title ? b.title.toLowerCase().includes(q) : false;
      const authorMatch = Array.isArray(b.authors)
        ? b.authors.some((a: string) => a && a.toLowerCase().includes(q))
        : false;
      const searchMatch = !q || titleMatch || authorMatch;

      const statusMatch =
        this.activeFilter === 'all' ||
        (this.activeFilter === 'published' && b.is_published) ||
        (this.activeFilter === 'draft' && !b.is_published);

      return searchMatch && statusMatch;
    });
  }

  get totalPublished(): number {
    return this.books.filter(b => b.is_published).length;
  }

  get totalDrafts(): number {
    return this.books.filter(b => !b.is_published).length;
  }

  deleteBook(book: any): void {
    if (confirm(`¿Estás seguro de eliminar "${book.title}"? Esta acción no se puede deshacer.`)) {
      this.bookService.deleteBook(book.id).subscribe({
        next: () => {
          this.books = this.books.filter(b => b.id !== book.id);
          this.applyFilters();
        },
        error: () => alert('No se pudo eliminar el libro.')
      });
    }
  }
}
