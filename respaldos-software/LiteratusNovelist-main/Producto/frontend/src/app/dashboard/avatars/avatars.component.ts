import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-avatars',
  templateUrl: './avatars.component.html',
  styleUrls: ['./avatars.component.css']
})
export class AvatarsComponent implements OnInit {
  avatars: any[] = [];
  filteredAvatars: any[] = [];
  paginatedAvatars: any[] = [];
  loading = true;

  // Filtros y Búsqueda
  searchQuery = '';
  activeFilter: 'all' | 'major' | 'secondary' | 'with_book' | 'no_book' = 'all';
  viewMode: 'grid' | 'table' = 'grid';

  // Paginación
  currentPage = 1;
  pageSize = 24;
  totalPages = 1;

  actionToast = '';

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadAvatars();
  }

  loadAvatars() {
    this.loading = true;
    this.dashboardService.getAllAvatars().subscribe({
      next: (data) => {
        this.avatars = data;
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading avatars', err);
        this.loading = false;
      }
    });
  }

  setFilter(filter: 'all' | 'major' | 'secondary' | 'with_book' | 'no_book') {
    this.activeFilter = filter;
    this.currentPage = 1;
    this.applyFilters();
  }

  setViewMode(mode: 'grid' | 'table') {
    this.viewMode = mode;
  }

  filterAvatars(event: Event) {
    this.searchQuery = (event.target as HTMLInputElement).value.toLowerCase().trim();
    this.currentPage = 1;
    this.applyFilters();
  }

  applyFilters() {
    let result = this.avatars;

    if (this.activeFilter === 'major') {
      result = result.filter(a => a.is_major_character);
    } else if (this.activeFilter === 'secondary') {
      result = result.filter(a => !a.is_major_character);
    } else if (this.activeFilter === 'with_book') {
      result = result.filter(a => !!a.book_id);
    } else if (this.activeFilter === 'no_book') {
      result = result.filter(a => !a.book_id);
    }

    if (this.searchQuery) {
      result = result.filter(a => 
        a.name.toLowerCase().includes(this.searchQuery) || 
        (a.book_title && a.book_title.toLowerCase().includes(this.searchQuery))
      );
    }

    this.filteredAvatars = result;
    this.totalPages = Math.max(1, Math.ceil(this.filteredAvatars.length / this.pageSize));
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    this.updatePagination();
  }

  updatePagination() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    this.paginatedAvatars = this.filteredAvatars.slice(start, end);
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, this.currentPage - 2);
    let end = Math.min(this.totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  deleteAvatar(avatar: any, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (!confirm(`¿Eliminar al personaje "${avatar.name}"? Esta acción es irreversible.`)) return;

    this.dashboardService.deleteAvatar(avatar.id).subscribe({
      next: () => {
        this.avatars = this.avatars.filter(a => a.id !== avatar.id);
        this.applyFilters();
        this.actionToast = `Personaje "${avatar.name}" eliminado con éxito.`;
        setTimeout(() => this.actionToast = '', 3500);
      },
      error: () => alert('No se pudo eliminar el personaje.')
    });
  }

  get majorCount(): number {
    return this.avatars.filter(a => a.is_major_character).length;
  }

  get secondaryCount(): number {
    return this.avatars.filter(a => !a.is_major_character).length;
  }
}
