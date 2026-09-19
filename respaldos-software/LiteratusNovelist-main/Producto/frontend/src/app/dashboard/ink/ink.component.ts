import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-ink-economy',
  templateUrl: './ink.component.html',
  styleUrls: ['./ink.component.css']
})
export class InkEconomyComponent implements OnInit {
  circulation: any = null;
  transactions: any[] = [];
  loading = true;

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadInkData();
  }

  loadInkData(): void {
    this.loading = true;
    this.dashboardService.getInkEconomy().subscribe({
      next: (res) => {
        this.circulation = res.circulation || null;
        this.transactions = res.transactions || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }
}
