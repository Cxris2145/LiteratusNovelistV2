import { Component, OnInit, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { getBookPages } from '../../core/utils/book-pages.util';
import { coverThumb } from '../../core/utils/cover-thumb.util';

@Component({
  selector: 'app-library-list',
  templateUrl: './library-list.component.html',
  styleUrls: ['./library-list.component.css']
})
export class LibraryListComponent implements OnInit {
  private api = inject(ApiService);
  public auth = inject(AuthService);
  getBookPages = getBookPages;

  inventoryItems: any[] = [];
  isLoading = true;
  isAnonymous = false;
  errorMsg = '';

  activeFilter: 'all' | 'reading' | 'completed' | 'unread' = 'all';
  searchTerm: string = '';

  private readonly EAGER_COVERS = 6;
  readonly skeletons = [0, 1, 2, 3, 4, 5];

  get filteredItems(): any[] {
    let items = this.inventoryItems;

    // Filtro por estado de lectura
    if (this.activeFilter === 'reading') {
      items = items.filter(item => {
        const pct = item.progress?.completion_percentage || 0;
        return pct > 0 && pct < 100;
      });
    } else if (this.activeFilter === 'completed') {
      items = items.filter(item => {
        const pct = item.progress?.completion_percentage || 0;
        return pct >= 100;
      });
    } else if (this.activeFilter === 'unread') {
      items = items.filter(item => {
        const pct = item.progress?.completion_percentage || 0;
        return pct === 0;
      });
    }

    // Filtro por término de búsqueda (título y autor)
    const q = this.searchTerm.trim().toLowerCase();
    if (q) {
      items = items.filter(item => {
        const title = (item.book_title || item.edition?.book?.title || '').toLowerCase();
        const author = (item.edition?.book?.author_name || '').toLowerCase();
        return title.includes(q) || author.includes(q);
      });
    }

    return items;
  }

  clearSearch(): void {
    this.searchTerm = '';
  }


  get readingCount(): number {
    return this.inventoryItems.filter(item => {
      const pct = item.progress?.completion_percentage || 0;
      return pct > 0 && pct < 100;
    }).length;
  }

  get completedCount(): number {
    return this.inventoryItems.filter(item => (item.progress?.completion_percentage || 0) >= 100).length;
  }

  get unreadCount(): number {
    return this.inventoryItems.filter(item => (item.progress?.completion_percentage || 0) === 0).length;
  }

  setFilter(filter: 'all' | 'reading' | 'completed' | 'unread'): void {
    this.activeFilter = filter;
  }


  ngOnInit(): void {
    if (!this.auth.isLoggedIn()) {
      this.isAnonymous = true;
      this.isLoading = false;
      return;
    }
    this.fetchInventory();
  }

  private decorate(list: any[]): any[] {
    return list.map((item, i) => {
      const raw = item.book_cover || item.edition?.book?.cover_image || 'assets/default_cover.jpg';
      return { ...item, coverThumb: this.thumb(raw), coverLoaded: true, coverPriority: i < this.EAGER_COVERS };
    });
  }

  private thumb(url: string): string {
    return coverThumb(url, 240, 360, 60);
  }

  onImgLoad(item: any): void { item.coverLoaded = true; }
  onImgError(event: Event, item: any): void {
    const img = event.target as HTMLImageElement;
    item.coverLoaded = true;
    if (!img.src.endsWith('default_cover.jpg')) img.src = 'assets/default_cover.jpg';
  }

  trackItem = (_: number, it: any) => it.id;

  fetchInventory(): void {
    // Datos por usuario y mutables (progreso) → GET normal, sin caché compartida.
    this.api.get<any[]>('library/inventory/').subscribe({
      next: (res: any) => {
        this.inventoryItems = this.decorate(Array.isArray(res) ? res : (res.results || []));
        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        if (err.status === 401) {
          this.isAnonymous = true;
        } else if (!this.inventoryItems.length) {
          this.errorMsg = 'No pudimos cargar tu biblioteca en este momento. Intenta de nuevo más tarde.';
        }
        this.isLoading = false;
      }
    });
  }
}
