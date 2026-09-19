import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-curation',
  templateUrl: './curation.component.html',
  styleUrls: ['./curation.component.css']
})
export class CurationComponent implements OnInit {
  pendingBooks: any[] = [];
  loading = true;
  actionMessage = '';
  selectedBook: any = null;

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadCuration();
  }

  loadCuration(): void {
    this.loading = true;
    this.dashboardService.getCuration().subscribe({
      next: (res) => {
        this.pendingBooks = res.books || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  approve(book: any): void {
    if (!confirm(`¿Aprobar y publicar "${book.title}" inmediatamente?`)) return;
    this.dashboardService.approveBook(book.id).subscribe({
      next: (res) => {
        this.actionMessage = res.message || 'Libro aprobado con éxito.';
        this.pendingBooks = this.pendingBooks.filter(b => b.id !== book.id);
        setTimeout(() => this.actionMessage = '', 4000);
      },
      error: () => alert('Error al aprobar el libro.')
    });
  }

  togglePublish(book: any): void {
    this.dashboardService.togglePublishBook(book.id).subscribe({
      next: (res) => {
        book.is_published = res.is_published;
        book.status = res.status;
        this.actionMessage = res.message;
        setTimeout(() => this.actionMessage = '', 4000);
      }
    });
  }

  selectBookForReview(book: any): void {
    this.selectedBook = book;
  }

  closeReview(): void {
    this.selectedBook = null;
  }

  rejectBook(book: any): void {
    if (!confirm(`¿Estás seguro de rechazar y descartar el borrador de "${book.title}"?`)) return;
    this.dashboardService.deleteBook(book.id).subscribe({
      next: () => {
        this.actionMessage = `Borrador "${book.title}" rechazado y eliminado.`;
        this.pendingBooks = this.pendingBooks.filter(b => b.id !== book.id);
        if (this.selectedBook?.id === book.id) this.selectedBook = null;
        setTimeout(() => this.actionMessage = '', 4000);
      },
      error: () => alert('No se pudo descartar el libro.')
    });
  }
}
