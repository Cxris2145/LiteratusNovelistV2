import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';
import { NotificationService } from '../../core/services/notification.service';

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
  activeFilter: 'all' | 'authors' | 'drafts' = 'all';

  // Modal de Rechazo con Observaciones
  rejectModalOpen = false;
  bookToReject: any = null;
  rejectionNotes = '';
  submittingReject = false;

  // Modal de Aprobación
  approveModalOpen = false;
  bookToApprove: any = null;
  approvalNotes = '';
  submittingApprove = false;

  constructor(
    private dashboardService: DashboardBooksService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadCuration();
  }

  get authorSubmissionsCount(): number {
    return this.pendingBooks.filter(b => b.submitted_by).length;
  }

  get draftsCount(): number {
    return this.pendingBooks.filter(b => !b.submitted_by).length;
  }

  get filteredBooks(): any[] {
    if (this.activeFilter === 'authors') {
      return this.pendingBooks.filter(b => b.submitted_by);
    }
    if (this.activeFilter === 'drafts') {
      return this.pendingBooks.filter(b => !b.submitted_by);
    }
    return this.pendingBooks;
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
        this.notificationService.error('Error al cargar obras de curaduría.', 'Curaduría');
      }
    });
  }

  openApproveModal(book: any): void {
    this.bookToApprove = book;
    this.approvalNotes = 'La obra cumple satisfactoriamente con los criterios de calidad y rigor literario de Literatus Novelist.';
    this.approveModalOpen = true;
  }

  closeApproveModal(): void {
    this.approveModalOpen = false;
    this.bookToApprove = null;
    this.approvalNotes = '';
  }

  confirmApprove(): void {
    if (!this.bookToApprove) return;
    this.submittingApprove = true;
    const targetBook = this.bookToApprove;

    this.dashboardService.approveBook(targetBook.id, this.approvalNotes).subscribe({
      next: (res) => {
        const msg = res.message || `Obra "${targetBook.title}" aprobada y publicada exitosamente.`;
        this.actionMessage = msg;
        this.notificationService.success(msg, 'Curaduría Editorial');
        this.pendingBooks = this.pendingBooks.filter(b => b.id !== targetBook.id);
        if (this.selectedBook?.id === targetBook.id) this.selectedBook = null;
        this.closeApproveModal();
        this.submittingApprove = false;
        setTimeout(() => this.actionMessage = '', 4000);
      },
      error: () => {
        this.submittingApprove = false;
        this.notificationService.error('Error al aprobar y publicar el libro.', 'Error');
      }
    });
  }

  openRejectModal(book: any): void {
    this.bookToReject = book;
    this.rejectionNotes = '';
    this.rejectModalOpen = true;
  }

  closeRejectModal(): void {
    this.rejectModalOpen = false;
    this.bookToReject = null;
    this.rejectionNotes = '';
  }

  confirmReject(): void {
    if (!this.bookToReject) return;
    if (!this.rejectionNotes.trim()) {
      this.notificationService.warning('Por favor ingresa una nota u observación indicando los motivos o mejoras necesarias.', 'Observación requerida');
      return;
    }

    this.submittingReject = true;
    const targetBook = this.bookToReject;

    this.dashboardService.rejectBook(targetBook.id, this.rejectionNotes).subscribe({
      next: () => {
        const msg = `Obra "${targetBook.title}" marcada con observaciones editoriales para el autor.`;
        this.actionMessage = msg;
        this.notificationService.info(msg, 'Curaduría');
        this.pendingBooks = this.pendingBooks.filter(b => b.id !== targetBook.id);
        if (this.selectedBook?.id === targetBook.id) this.selectedBook = null;
        this.closeRejectModal();
        this.submittingReject = false;
        setTimeout(() => this.actionMessage = '', 4000);
      },
      error: () => {
        this.submittingReject = false;
        this.notificationService.error('No se pudo procesar el rechazo de la obra.', 'Error');
      }
    });
  }

  togglePublish(book: any): void {
    this.dashboardService.togglePublishBook(book.id).subscribe({
      next: (res) => {
        book.is_published = res.is_published;
        book.status = res.status;
        this.actionMessage = res.message;
        this.notificationService.success(res.message, 'Estado Actualizado');
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
}
