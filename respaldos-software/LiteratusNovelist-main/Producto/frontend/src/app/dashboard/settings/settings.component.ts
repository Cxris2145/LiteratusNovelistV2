import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-store-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class StoreSettingsComponent implements OnInit {
  settings: any = null;
  loading = true;
  saving = false;
  toastMessage = '';
  selectedTheme = 'default';

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loading = true;
    this.dashboardService.getSettings().subscribe({
      next: (data) => {
        this.settings = data;
        this.selectedTheme = data.theme || 'default';
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  saveTheme(): void {
    this.saving = true;
    this.dashboardService.saveSettings({ theme: this.selectedTheme }).subscribe({
      next: (res) => {
        this.saving = false;
        this.toastMessage = res.message || 'Configuración guardada exitosamente.';
        // Apply theme to body
        document.body.setAttribute('data-theme', this.selectedTheme);
        setTimeout(() => this.toastMessage = '', 4000);
      },
      error: () => {
        this.saving = false;
        alert('Error al guardar la configuración.');
      }
    });
  }
}
