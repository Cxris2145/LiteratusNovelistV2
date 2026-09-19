import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.component.html',
  styleUrls: ['./transactions.component.css']
})
export class TransactionsComponent implements OnInit {
  transactions: any[] = [];
  summary: any = null;
  loading = true;
  statusFilter = '';
  itemTypeFilter = '';
  searchQuery = '';

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadTransactions();
  }

  loadTransactions(): void {
    this.loading = true;
    const params: any = {};
    if (this.statusFilter) params.status = this.statusFilter;
    if (this.itemTypeFilter) params.item_type = this.itemTypeFilter;
    if (this.searchQuery) params.search = this.searchQuery;

    this.dashboardService.getTransactions(params).subscribe({
      next: (res) => {
        this.transactions = res.transactions || [];
        this.summary = res.summary || null;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  onFilterChange(): void {
    this.loadTransactions();
  }

  onSearch(): void {
    this.loadTransactions();
  }

  clearFilters(): void {
    this.statusFilter = '';
    this.itemTypeFilter = '';
    this.searchQuery = '';
    this.loadTransactions();
  }

  exportCsv(): void {
    if (!this.transactions.length) return;
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Orden Webpay,Usuario,Email,Tipo,Referencia,Monto CLP,Estado,Fecha\r\n';
    this.transactions.forEach(t => {
      const row = `"${t.buy_order}","${(t.username || '').replace(/"/g, '""')}","${t.user_email || ''}","${t.item_type}","${(t.item_reference || '').replace(/"/g, '""')}","${t.amount}","${t.status_display || t.status}","${t.created_at}"`;
      csvContent += row + '\r\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Transacciones_Webpay_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
