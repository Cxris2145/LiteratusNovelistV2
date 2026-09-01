import { Component, OnInit, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
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
  maxSale = 1;

  private api = inject(ApiService);

  constructor() {}

  ngOnInit(): void {
    this.api.get<any>('dashboard/stats/').subscribe({
      next: (data) => {
        this.stats = data;
        // Calcular el máximo para normalizar el gráfico de barras
        this.maxSale = Math.max(...data.sales_chart.map((d: any) => d.amount), 1);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  getBarHeight(amount: number): number {
    if (this.maxSale === 0) return 0;
    return Math.max((amount / this.maxSale) * 100, 4);
  }

  exportPdf() {
    if (!this.stats) return;

    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('es-ES');

    // Título
    doc.setFontSize(18);
    doc.text('Reporte de Literatus Novelist', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Fecha de generación: ${dateStr}`, 14, 30);
    
    // Resumen de Métricas
    doc.setFontSize(14);
    doc.text('Resumen de Métricas', 14, 45);
    
    autoTable(doc, {
      startY: 50,
      head: [['Métrica', 'Valor Total']],
      body: [
        ['Usuarios Activos', this.stats.users?.total?.toString() || '0'],
        ['Libros Publicados', this.stats.content?.total_books?.toString() || '0'],
        ['Ingresos Totales ($)', this.stats.revenue?.total?.toString() || '0'],
        ['Ingresos Últimos 30 días ($)', this.stats.revenue?.last_30_days?.toString() || '0'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [168, 85, 247] }
    });

    // Top Libros
    if (this.stats.top_books && this.stats.top_books.length > 0) {
      const finalY = (doc as any).lastAutoTable.finalY || 100;
      doc.text('Top Libros (Más comprados)', 14, finalY + 15);
      
      const booksBody = this.stats.top_books.map((b: any, index: number) => [
        (index + 1).toString(),
        b.edition__book__title || 'Desconocido',
        b.purchases?.toString() || '0'
      ]);

      autoTable(doc, {
        startY: finalY + 20,
        head: [['#', 'Título', 'Ventas']],
        body: booksBody,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] }
      });
    }

    doc.save(`Reporte_Literatus_${dateStr.replace(/\//g, '-')}.pdf`);
  }
}
