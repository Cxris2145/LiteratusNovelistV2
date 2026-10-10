import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { ApiService } from '../../services/api.service';

/** Resumen del libro completo con IA (GET/POST catalog/books/<slug>/summary/). */
interface BookSummaryContent {
  overview: string;
  plot: string[];
  characters: { name: string; role: string }[];
  themes: string[];
}

interface BookSummaryResponse {
  status: 'ready' | 'generating' | 'missing' | 'unavailable';
  summary?: BookSummaryContent;
  message?: string;
}

const SUMMARY_POLL_MS = 4000;
const SUMMARY_POLL_LIMIT_MS = 5 * 60 * 1000;

/**
 * Resumen completo de un libro (incluye el final), para la ventana de Mi Biblioteca.
 * El lector ya lo pidió al abrirla: si el libro tiene resumen llega al instante; si no, se genera
 * una sola vez en el servidor (ver catalog/summary.py) y se consulta hasta que esté listo.
 */
@Component({
  selector: 'app-book-summary',
  templateUrl: './book-summary.component.html',
  styleUrls: ['./book-summary.component.css']
})
export class BookSummaryComponent implements OnChanges, OnDestroy {
  @Input() slug: string | null = null;

  private api = inject(ApiService);

  summaryState: 'idle' | 'loading' | 'generating' | 'unavailable' = 'idle';
  summary: BookSummaryContent | null = null;
  summaryMessage = '';
  private summaryPoll: ReturnType<typeof setTimeout> | null = null;
  private summaryPollDeadline = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['slug']) return;
    this.resetSummary();
    this.requestSummary();
  }

  ngOnDestroy(): void {
    this.stopSummaryPoll();
  }

  requestSummary(): void {
    if (!this.slug || this.summaryState === 'loading' || this.summaryState === 'generating') return;
    this.summaryState = 'loading';
    this.summaryMessage = '';
    const slug = this.slug;
    this.api.post<BookSummaryResponse>(`catalog/books/${slug}/summary/`, {}).subscribe({
      next: (res) => {
        this.summaryPollDeadline = Date.now() + SUMMARY_POLL_LIMIT_MS;
        this.handleSummary(slug, res);
      },
      error: (err) => this.summaryFailed(err.error?.message || err.error?.error)
    });
  }

  private handleSummary(slug: string, res: BookSummaryResponse): void {
    if (slug !== this.slug) return; // el lector ya pasó a otro libro
    if (res.status === 'ready' && res.summary) {
      this.summary = res.summary;
      this.summaryState = 'idle';
    } else if (res.status === 'generating') {
      this.summaryState = 'generating';
      if (Date.now() > this.summaryPollDeadline) {
        this.summaryFailed('El resumen está tardando más de lo normal. Vuelve a intentarlo en unos minutos.');
        return;
      }
      this.summaryPoll = setTimeout(() => {
        this.api.get<BookSummaryResponse>(`catalog/books/${slug}/summary/`).subscribe({
          next: (next) => this.handleSummary(slug, next),
          error: (err) => this.summaryFailed(err.error?.message)
        });
      }, SUMMARY_POLL_MS);
    } else {
      this.summaryFailed(res.message);
    }
  }

  private summaryFailed(message?: string): void {
    this.stopSummaryPoll();
    this.summaryState = 'unavailable';
    this.summaryMessage = message || 'No se pudo generar el resumen. Intenta de nuevo en unos minutos.';
  }

  private stopSummaryPoll(): void {
    if (this.summaryPoll) clearTimeout(this.summaryPoll);
    this.summaryPoll = null;
  }

  private resetSummary(): void {
    this.stopSummaryPoll();
    this.summary = null;
    this.summaryState = 'idle';
    this.summaryMessage = '';
  }
}
