import { Component, OnInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

export interface BookReportItem {
  id: string;
  book_id: string;
  book_title: string;
  book_slug: string;
  chapter_id: string;
  chapter_title: string;
  chapter_order: number;
  error_type: string;
  error_type_display: string;
  severity: string;
  severity_display: string;
  status: string;
  status_display: string;
  selected_text: string;
  context_snippet: string;
  start_word_index: number | null;
  end_word_index: number | null;
  paragraph_index: number | null;
  audio_timestamp_seconds: number | null;
  voice_name: string;
  user_comment: string;
  reporter_username: string;
  assigned_username: string | null;
  admin_notes: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ReportStats {
  total: number;
  pending: number;
  in_review: number;
  resolved: number;
  dismissed: number;
  audio_count: number;
  text_count: number;
  by_type: Record<string, number>;
}

@Component({
  selector: 'app-book-reports',
  templateUrl: './book-reports.component.html',
  styleUrls: ['./book-reports.component.css']
})
export class BookReportsComponent implements OnInit {
  private api = inject(ApiService);
  private notify = inject(NotificationService);

  reports: BookReportItem[] = [];
  stats: ReportStats | null = null;
  loading = true;
  totalCount = 0;

  // Filtros
  statusFilter = 'all';
  typeFilter = 'all';
  mediaFilter = 'all';
  severityFilter = 'all';
  searchTerm = '';
  private searchSubject = new Subject<string>();

  // Selección múltiple
  selectedIds = new Set<string>();

  // Drawer de Inspección / Edición
  selectedReport: BookReportItem | null = null;
  isSavingReport = false;
  editingStatus = 'pending';
  editingNotes = '';
  editingAssignee: string | null = null;

  readonly statusOptions = [
    { id: 'all', label: 'Todos los estados' },
    { id: 'pending', label: 'Pendiente' },
    { id: 'in_review', label: 'En Revisión' },
    { id: 'resolved', label: 'Resuelto' },
    { id: 'dismissed', label: 'Descartado' },
    { id: 'duplicate', label: 'Duplicado' },
  ];

  readonly typeOptions = [
    { id: 'all', label: 'Todos los tipos' },
    { id: 'typo', label: 'Tipeo u ortografía' },
    { id: 'cut_word', label: 'Palabra cortada / guión' },
    { id: 'repeated_text', label: 'Párrafo repetido' },
    { id: 'missing_content', label: 'Texto incompleto' },
    { id: 'format_glitch', label: 'Formato visual roto' },
    { id: 'audio_desync', label: 'Audio desincronizado' },
    { id: 'audio_glitch', label: 'Falla o corte de audio' },
    { id: 'audio_pronunciation', label: 'Pronunciación incorrecta' },
    { id: 'other', label: 'Otro' },
  ];

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(350),
      distinctUntilChanged()
    ).subscribe(term => {
      this.searchTerm = term;
      this.loadReports();
    });

    this.loadStats();
    this.loadReports();
  }

  loadStats(): void {
    this.api.get<ReportStats>('dashboard/book-reports/stats/').subscribe({
      next: (data) => this.stats = data,
      error: () => console.warn('No se pudieron cargar estadísticas de reportes')
    });
  }

  loadReports(): void {
    this.loading = true;
    let url = 'dashboard/book-reports/?';
    if (this.statusFilter !== 'all') url += `&status=${this.statusFilter}`;
    if (this.typeFilter !== 'all') url += `&error_type=${this.typeFilter}`;
    if (this.mediaFilter !== 'all') url += `&media_type=${this.mediaFilter}`;
    if (this.severityFilter !== 'all') url += `&severity=${this.severityFilter}`;
    if (this.searchTerm.trim()) url += `&search=${encodeURIComponent(this.searchTerm.trim())}`;

    this.api.get<any>(url).subscribe({
      next: (res) => {
        if (Array.isArray(res)) {
          this.reports = res;
          this.totalCount = res.length;
        } else if (res && res.results) {
          this.reports = res.results;
          this.totalCount = res.count || res.results.length;
        } else {
          this.reports = [];
          this.totalCount = 0;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al cargar reportes:', err);
        this.notify.error('No se pudo cargar la lista de reportes.', 'Error');
        this.loading = false;
      }
    });
  }

  onSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.searchSubject.next(val);
  }

  setStatusFilter(status: string): void {
    this.statusFilter = status;
    this.loadReports();
  }

  setMediaFilter(media: string): void {
    this.mediaFilter = media;
    this.loadReports();
  }

  // ── Selección múltiple ──────────────────────────────────────────
  toggleSelectAll(): void {
    if (this.selectedIds.size === this.reports.length) {
      this.selectedIds.clear();
    } else {
      this.reports.forEach(r => this.selectedIds.add(r.id));
    }
  }

  toggleSelectOne(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  isAllSelected(): boolean {
    return this.reports.length > 0 && this.selectedIds.size === this.reports.length;
  }

  batchUpdateStatus(newStatus: string): void {
    if (this.selectedIds.size === 0) return;
    const ids = Array.from(this.selectedIds);
    this.api.post('dashboard/book-reports/batch-status/', {
      ids,
      status: newStatus,
      admin_notes: `Actualización masiva a estado ${newStatus}`
    }).subscribe({
      next: () => {
        this.notify.success(`Se actualizaron ${ids.length} reportes a ${newStatus}.`, 'Operación exitosa');
        this.selectedIds.clear();
        this.loadStats();
        this.loadReports();
      },
      error: () => this.notify.error('Error al actualizar reportes masivamente.', 'Error')
    });
  }

  // ── Inspección y Resolución ─────────────────────────────────────
  openInspectDrawer(report: BookReportItem): void {
    this.selectedReport = report;
    this.editingStatus = report.status;
    this.editingNotes = report.admin_notes || '';
    this.editingAssignee = report.assigned_username;
  }

  closeInspectDrawer(): void {
    this.selectedReport = null;
  }

  saveReportChanges(): void {
    if (!this.selectedReport) return;
    this.isSavingReport = true;

    const payload: any = {
      status: this.editingStatus,
      admin_notes: this.editingNotes
    };

    this.api.patch(`dashboard/book-reports/${this.selectedReport.id}/`, payload).subscribe({
      next: (updated: any) => {
        this.notify.success('Reporte actualizado correctamente.', 'Guardado');
        this.isSavingReport = false;
        // Refrescar en la lista
        const idx = this.reports.findIndex(r => r.id === this.selectedReport?.id);
        if (idx !== -1) {
          this.reports[idx] = { ...this.reports[idx], ...updated };
        }
        this.selectedReport = { ...this.selectedReport, ...updated };
        this.loadStats();
      },
      error: () => {
        this.notify.error('No se pudo guardar la actualización.', 'Error');
        this.isSavingReport = false;
      }
    });
  }

  deleteReport(report: BookReportItem): void {
    if (!confirm(`¿Eliminar definitivamente el reporte de "${report.book_title}"?`)) return;

    this.api.delete(`dashboard/book-reports/${report.id}/`).subscribe({
      next: () => {
        this.notify.info('Reporte eliminado.', 'Eliminado');
        this.closeInspectDrawer();
        this.loadStats();
        this.loadReports();
      },
      error: () => this.notify.error('No se pudo eliminar el reporte.', 'Error')
    });
  }

  openInReader(report: BookReportItem): void {
    // Si tenemos el libro y capítulo, abrimos el lector con deep link directo
    let url = `/reader/${report.book_id}?chapter=${report.chapter_id}`;
    if (report.start_word_index != null) {
      url += `&word=${report.start_word_index}`;
    }
    if (report.audio_timestamp_seconds != null) {
      url += `&audioTime=${report.audio_timestamp_seconds}`;
    }
    window.open(url, '_blank');
  }

  formatTimestamp(seconds: number | null): string {
    if (seconds == null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
