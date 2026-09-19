import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-audit-logs',
  templateUrl: './audit.component.html',
  styleUrls: ['./audit.component.css']
})
export class AuditLogsComponent implements OnInit {
  logs: any[] = [];
  loading = true;

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadLogs();
  }

  loadLogs(): void {
    this.loading = true;
    this.dashboardService.getAuditLogs().subscribe({
      next: (res) => {
        this.logs = res.logs || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }
}
