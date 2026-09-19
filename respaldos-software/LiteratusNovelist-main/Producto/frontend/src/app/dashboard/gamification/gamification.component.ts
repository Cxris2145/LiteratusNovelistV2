import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-gamification-admin',
  templateUrl: './gamification.component.html',
  styleUrls: ['./gamification.component.css']
})
export class GamificationAdminComponent implements OnInit {
  achievements: any[] = [];
  missions: any[] = [];
  levelsDistribution: any[] = [];
  loading = true;
  activeTab: 'achievements' | 'missions' | 'levels' = 'achievements';

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.dashboardService.getGamification().subscribe({
      next: (res) => {
        this.achievements = res.achievements || [];
        this.missions = res.missions || [];
        this.levelsDistribution = res.levels_distribution || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  setTab(tab: 'achievements' | 'missions' | 'levels'): void {
    this.activeTab = tab;
  }

  getLevelBarWidth(userCount: number): number {
    if (!this.levelsDistribution || this.levelsDistribution.length === 0) return 0;
    const max = Math.max(...this.levelsDistribution.map(l => l.user_count || 0), 1);
    return Math.min(100, Math.max(6, (userCount / max) * 100));
  }
}
