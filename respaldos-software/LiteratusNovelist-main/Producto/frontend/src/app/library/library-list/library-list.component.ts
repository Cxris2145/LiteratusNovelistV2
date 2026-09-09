import { Component, OnInit, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-library-list',
  templateUrl: './library-list.component.html',
  styleUrls: ['./library-list.component.css']
})
export class LibraryListComponent implements OnInit {
  private api = inject(ApiService);

  inventoryItems: any[] = [];
  isLoading = true;
  errorMsg = '';

  private readonly EAGER_COVERS = 6;
  readonly skeletons = [0, 1, 2, 3, 4, 5];

  ngOnInit(): void {
    this.fetchInventory();
  }

  private decorate(list: any[]): any[] {
    return list.map((item, i) => {
      const raw = item.book_cover || item.edition?.book?.cover_image || 'assets/default_cover.jpg';
      return { ...item, coverThumb: this.thumb(raw), coverLoaded: false, coverPriority: i < this.EAGER_COVERS };
    });
  }

  private thumb(url: string): string {
    if (!url) return 'assets/default_cover.jpg';
    if (url.includes('/storage/v1/object/public/')) {
      // Las portadas fuente son cuadradas (800x800); sin 'height' Supabase
      // recorta una franja angosta en vez de reescalar. Pedimos alto = ancho.
      return url.replace('/object/public/', '/render/image/public/')
        + (url.includes('?') ? '&' : '?') + 'width=360&height=360&quality=62&resize=cover';
    }
    return url;
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
        if (!this.inventoryItems.length) {
          this.errorMsg = 'No pudimos cargar tu biblioteca. Intenta de nuevo más tarde.';
        }
        this.isLoading = false;
      }
    });
  }
}
