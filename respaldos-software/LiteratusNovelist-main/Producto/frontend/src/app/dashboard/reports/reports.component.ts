import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css']
})
export class ReportsComponent implements OnInit {
  stats: any = null;
  loading = true;
  toastMessage = '';
  exportingPdf = false;
  exportingBooks = false;
  exportingUsers = false;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
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

  private showToast(msg: string): void {
    this.toastMessage = msg;
    setTimeout(() => this.toastMessage = '', 4000);
  }

  exportExecutivePdf(): void {
    if (!this.stats) return;
    this.exportingPdf = true;
    this.showToast('Generando reporte ejecutivo en PDF...');

    try {
      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

      // Portada y Cabecera Editorial
      doc.setFillColor(8, 16, 17); // Obsidian Teal oscuro
      doc.rect(0, 0, 210, 40, 'F');

      doc.setTextColor(255, 179, 83); // Ámbar de Literatus
      doc.setFontSize(22);
      doc.text('LITERATUS NOVELIST', 14, 20);

      doc.setTextColor(207, 227, 232);
      doc.setFontSize(11);
      doc.text('CENTRO DE CONTROL NEXUS — REPORTE EJECUTIVO DE PLATAFORMA', 14, 28);
      doc.text(`Fecha de emisión: ${dateStr}`, 14, 34);

      // Kpis Generales
      doc.setTextColor(23, 44, 48);
      doc.setFontSize(14);
      doc.text('1. Métricas de Rendimiento General', 14, 52);

      autoTable(doc, {
        startY: 56,
        head: [['Dimensión', 'Métrica', 'Valor']],
        body: [
          ['Catálogo', 'Libros Totales', this.stats.content?.total_books?.toString() || '0'],
          ['Catálogo', 'Libros Publicados', this.stats.content?.published_books?.toString() || '0'],
          ['Catálogo', 'Autores Registrados', this.stats.content?.total_authors?.toString() || '0'],
          ['Catálogo', 'Categorías / Géneros', this.stats.content?.total_genres?.toString() || '0'],
          ['Comunidad', 'Usuarios Totales', this.stats.users?.total?.toString() || '0'],
          ['Comunidad', 'Lectores Activos', this.stats.users?.active?.toString() || '0'],
          ['Lectura', 'Sesiones de Lectura', this.stats.reading?.total_sessions?.toString() || '0'],
          ['Lectura', 'Minutos de Lectura Registrados', this.stats.reading?.total_minutes?.toString() || '0'],
          ['Economía', 'Tinta en Circulación', this.stats.gamification?.ink_in_circulation?.toLocaleString() || '0'],
          ['Inteligencia Artificial', 'Personajes Literarios', this.stats.ai?.total_avatars?.toString() || '0'],
          ['Inteligencia Artificial', 'Mensajes con Personajes', this.stats.ai?.total_character_messages?.toString() || '0'],
          ['Inteligencia Artificial', 'Mensajes con Asistente Global', this.stats.ai?.total_assistant_messages?.toString() || '0'],
          ['Finanzas', 'Recaudación Total (Webpay)', `$${this.stats.revenue?.total || 0}`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [53, 100, 110] },
        styles: { fontSize: 9 }
      });

      const finalY = (doc as any).lastAutoTable.finalY || 140;

      // Top Libros
      if (this.stats.top_books_views && this.stats.top_books_views.length > 0) {
        doc.setFontSize(14);
        doc.text('2. Top 5 Libros Más Vistos del Catálogo', 14, finalY + 12);

        const booksRows = this.stats.top_books_views.map((b: any, idx: number) => [
          (idx + 1).toString(),
          b.title,
          b.view_count?.toString() || '0',
          b.download_count?.toString() || '0'
        ]);

        autoTable(doc, {
          startY: finalY + 16,
          head: [['#', 'Título de la Obra', 'Vistas de Ficha', 'Descargas']],
          body: booksRows,
          theme: 'striped',
          headStyles: { fillColor: [65, 122, 135] }
        });
      }

      doc.save(`Reporte_Literatus_Nexus_${new Date().toISOString().slice(0, 10)}.pdf`);
      this.exportingPdf = false;
      this.showToast('Informe ejecutivo en PDF descargado exitosamente.');
    } catch (e) {
      this.exportingPdf = false;
      this.showToast('Error al generar el PDF.');
    }
  }

  exportBooksCsv(): void {
    if (!this.stats) return;
    this.exportingBooks = true;
    this.showToast('Extrayendo catálogo de libros para CSV...');

    this.api.get<any[]>('dashboard/books/').subscribe({
      next: (books) => {
        let csvContent = 'data:text/csv;charset=utf-8,';
        csvContent += 'ID,Título,Slug,Publicado,Autores,Capítulos,Vistas\r\n';
        books.forEach(b => {
          const authors = (b.authors || []).join('; ');
          const row = `"${b.id}","${(b.title || '').replace(/"/g, '""')}","${b.slug}","${b.is_published}","${authors}","${b.chapters_count}","${b.view_count}"`;
          csvContent += row + '\r\n';
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Catalogo_Libros_Literatus_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.exportingBooks = false;
        this.showToast('Catálogo de libros exportado exitosamente.');
      },
      error: () => {
        this.exportingBooks = false;
        this.showToast('Error al exportar catálogo de libros.');
      }
    });
  }

  exportUsersCsv(): void {
    if (!this.stats) return;
    this.exportingUsers = true;
    this.showToast('Extrayendo padrón de usuarios para CSV...');

    this.api.get<any[]>('dashboard/users/').subscribe({
      next: (users) => {
        let csvContent = 'data:text/csv;charset=utf-8,';
        csvContent += 'ID,Usuario,Email,Rol,Tinta,Chats,Último Login\r\n';
        users.forEach(u => {
          const row = `"${u.id}","${(u.username || '').replace(/"/g, '""')}","${u.email}","${u.role}","${u.ink_balance}","${u.chats_count}","${u.last_login || ''}"`;
          csvContent += row + '\r\n';
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Usuarios_Literatus_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.exportingUsers = false;
        this.showToast('Padrón de usuarios exportado exitosamente.');
      },
      error: () => {
        this.exportingUsers = false;
        this.showToast('Error al exportar usuarios.');
      }
    });
  }
}
