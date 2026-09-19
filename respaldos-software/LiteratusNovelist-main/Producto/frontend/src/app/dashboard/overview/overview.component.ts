import { Component, OnInit, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { DashboardBooksService } from '../services/dashboard-books.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.css']
})
export class OverviewComponent implements OnInit {
  stats: any = null;
  loading = true;
  activeChartTab: 'sales' | 'reading' | 'ai' = 'sales';
  topBooksTab: 'views' | 'purchases' = 'views';
  actionToast = '';

  private api = inject(ApiService);
  private dashboardService = inject(DashboardBooksService);

  constructor() {}

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    this.loading = true;
    this.api.get<any>('dashboard/stats/').subscribe({
      next: (data) => {
        this.stats = data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  setChartTab(tab: 'sales' | 'reading' | 'ai'): void {
    this.activeChartTab = tab;
  }

  setTopBooksTab(tab: 'views' | 'purchases'): void {
    this.topBooksTab = tab;
  }

  publishBookQuick(book: any): void {
    this.dashboardService.approveBook(book.id).subscribe({
      next: (res) => {
        this.actionToast = res.message || 'Libro publicado con éxito.';
        this.loadStats();
        setTimeout(() => this.actionToast = '', 4000);
      }
    });
  }

  getBarHeight(value: number, chartType: 'sales' | 'reading' | 'ai'): number {
    if (!this.stats) return 0;
    let max = 1;
    if (chartType === 'sales') {
      max = Math.max(...(this.stats.sales_chart || []).map((d: any) => d.amount), 1);
    } else if (chartType === 'reading') {
      max = Math.max(...(this.stats.reading?.reading_chart || []).map((d: any) => d.minutes), 1);
    } else if (chartType === 'ai') {
      max = Math.max(...(this.stats.ai?.ai_chart || []).map((d: any) => d.messages), 1);
    }
    return Math.max((value / max) * 100, 4);
  }

  exportPdf(): void {
    if (!this.stats) return;

    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    // Cabecera Corporativa
    doc.setFillColor(8, 16, 17);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 179, 83);
    doc.setFontSize(22);
    doc.text('LITERATUS NOVELIST', 14, 20);

    doc.setTextColor(207, 227, 232);
    doc.setFontSize(11);
    doc.text('REPORTE GENERAL DE CONTROL — NEXUS ADMIN', 14, 28);
    doc.text(`Generado el: ${dateStr}`, 14, 34);

    // Resumen de Métricas
    doc.setTextColor(23, 44, 48);
    doc.setFontSize(14);
    doc.text('Resumen Ejecutivo de la Plataforma', 14, 52);

    autoTable(doc, {
      startY: 56,
      head: [['Métrica Principal', 'Valor Registrado']],
      body: [
        ['Libros Publicados', this.stats.content?.published_books?.toString() || '0'],
        ['Libros en Borrador / Pendientes', this.stats.content?.draft_books?.toString() || '0'],
        ['Autores Registrados', this.stats.content?.total_authors?.toString() || '0'],
        ['Categorías / Géneros', this.stats.content?.total_genres?.toString() || '0'],
        ['Usuarios Totales', this.stats.users?.total?.toString() || '0'],
        ['Sesiones de Lectura', this.stats.reading?.total_sessions?.toString() || '0'],
        ['Minutos de Lectura Registrados', this.stats.reading?.total_minutes?.toString() || '0'],
        ['Tinta en Circulación', this.stats.gamification?.ink_in_circulation?.toLocaleString() || '0'],
        ['Personajes Literarios IA', this.stats.ai?.total_avatars?.toString() || '0'],
        ['Total Mensajes IA', ((this.stats.ai?.total_character_messages || 0) + (this.stats.ai?.total_assistant_messages || 0)).toString()],
        ['Recaudación Total (Webpay)', `$${this.stats.revenue?.total || 0}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [53, 100, 110] },
      styles: { fontSize: 9 }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 140;

    // Top Libros
    if (this.stats.top_books_views && this.stats.top_books_views.length > 0) {
      doc.setFontSize(13);
      doc.text('Top Libros Más Vistos', 14, finalY + 12);

      const booksBody = this.stats.top_books_views.map((b: any, index: number) => [
        (index + 1).toString(),
        b.title || 'Desconocido',
        b.view_count?.toString() || '0',
        b.download_count?.toString() || '0'
      ]);

      autoTable(doc, {
        startY: finalY + 16,
        head: [['#', 'Título', 'Vistas', 'Descargas']],
        body: booksBody,
        theme: 'striped',
        headStyles: { fillColor: [65, 122, 135] }
      });
    }

    doc.save(`Literatus_Nexus_Resumen_${new Date().toISOString().slice(0, 10)}.pdf`);
  }
}
