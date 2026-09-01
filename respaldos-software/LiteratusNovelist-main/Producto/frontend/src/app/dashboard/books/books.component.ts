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

  constructor(private bookService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadBooks();
  }

  loadBooks(): void {
    this.loading = true;
    this.bookService.getBooks().subscribe({
      next: (data) => {
        this.books = data;
        this.filteredBooks = data;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  filterBooks(event: any): void {
    const query = event.target.value.toLowerCase();
    this.filteredBooks = this.books.filter(b => 
      b.title.toLowerCase().includes(query) || 
      b.authors.some((a: string) => a.toLowerCase().includes(query))
    );
  }

  deleteBook(book: any): void {
    if (confirm(`¿Estás seguro de eliminar "${book.title}"? Esta acción no se puede deshacer.`)) {
      this.bookService.deleteBook(book.id).subscribe({
        next: () => {
          this.books = this.books.filter(b => b.id !== book.id);
          this.filteredBooks = this.filteredBooks.filter(b => b.id !== book.id);
        },
        error: () => alert('No se pudo eliminar el libro.')
      });
    }
  }
}
