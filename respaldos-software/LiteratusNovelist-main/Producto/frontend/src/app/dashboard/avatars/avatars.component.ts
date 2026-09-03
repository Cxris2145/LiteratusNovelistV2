import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-avatars',
  templateUrl: './avatars.component.html',
  styleUrls: ['./avatars.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AvatarsComponent implements OnInit {
  avatars: any[] = [];
  filteredAvatars: any[] = [];
  loading = true;

  constructor(private dashboardService: DashboardBooksService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadAvatars();
  }

  loadAvatars() {
    this.loading = true;
    this.dashboardService.getAllAvatars().subscribe({
      next: (data) => {
        this.avatars = data;
        this.filteredAvatars = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error loading avatars', err);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  filterAvatars(event: Event) {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    this.filteredAvatars = this.avatars.filter(a => 
      a.name.toLowerCase().includes(query) || 
      a.book_title.toLowerCase().includes(query)
    );
  }

  trackByAvatar(index: number, avatar: any): string {
    return String(avatar?.id ?? index);
  }
}
