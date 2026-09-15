import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { FavoriteApiBook, FavoritesService } from '../../core/services/favorites.service';

export interface FavoriteBook {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  is_featured: boolean;
  cover_image: string | null;
  coverThumb: string;
  coverLoaded?: boolean;
  author_name?: string | null;
  word_count?: number;
  page_count?: number | null;
  readingTimeEstimate?: string;
  inventoryId?: string;
  readingProgress?: number;
}

@Component({
  selector: 'app-favorites',
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.css']
})
export class FavoritesComponent implements OnInit {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private favoritesService = inject(FavoritesService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);

  favoriteBooks: FavoriteBook[] = [];
  isLoading = true;
  errorMsg = '';
  searchTerm = '';
  pendingBookIds = new Set<string>();
  isClearing = false;

  userInventoryMap = new Map<string, { inventoryId: string; progress: number }>();

  get totalPages(): number {
    return this.favoriteBooks.reduce((acc, b) => acc + (b.page_count || 0), 0);
  }

  get totalEstimatedHours(): string {
    let totalMins = 0;
    for (const b of this.favoriteBooks) {
      if (b.word_count) {
        totalMins += Math.ceil(b.word_count / 200);
      } else if (b.page_count) {
        totalMins += Math.ceil((b.page_count * 230) / 200);
      }
    }
    const hours = (totalMins / 60).toFixed(1);
    return `${hours} hrs`;
  }

  get filteredBooks(): FavoriteBook[] {
    if (!this.searchTerm.trim()) return this.favoriteBooks;
    const q = this.searchTerm.toLowerCase().trim();
    return this.favoriteBooks.filter(b =>
      b.title.toLowerCase().includes(q) ||
      (b.author_name && b.author_name.toLowerCase().includes(q))
    );
  }

  ngOnInit(): void {
    this.favoritesService.favorites$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(favorites => {
        this.favoriteBooks = favorites.map(favorite => this.decorateBook(favorite.book));
        this.updateInventoryProgress();
      });
    this.loadUserInventory();
    this.loadFavorites();
  }

  thumb(url: string | null | undefined): string {
    if (!url) return 'assets/default_cover.jpg';
    return url;
  }

  loadUserInventory(): void {
    if (!this.authService.isLoggedIn()) return;
    this.api.get<any[]>('library/inventory/').subscribe({
      next: (res: any) => {
        const items = Array.isArray(res) ? res : (res?.results || []);
        for (const item of items) {
          const progress = item.progress?.completion_percentage || 0;
          const invData = { inventoryId: item.id, progress };
          if (item.edition?.book?.id) this.userInventoryMap.set(String(item.edition.book.id), invData);
          if (item.edition?.book?.slug) this.userInventoryMap.set(String(item.edition.book.slug), invData);
          if (item.book_id) this.userInventoryMap.set(String(item.book_id), invData);
          if (item.book_slug) this.userInventoryMap.set(String(item.book_slug), invData);
        }
        this.updateInventoryProgress();
      },
      error: () => {}
    });
  }

  private updateInventoryProgress(): void {
    this.favoriteBooks.forEach(b => {
      const inv = this.userInventoryMap.get(b.id) || this.userInventoryMap.get(b.slug);
      if (inv) {
        b.inventoryId = inv.inventoryId;
        b.readingProgress = inv.progress;
      }
    });
  }

  loadFavorites(): void {
    this.isLoading = true;
    this.errorMsg = '';
    this.favoritesService.load().subscribe({
      next: () => this.isLoading = false,
      error: (err) => {
        console.error(err);
        this.errorMsg = 'No pudimos cargar tus obras favoritas. Por favor, intenta de nuevo.';
        this.isLoading = false;
      }
    });
  }

  private decorateBook(b: FavoriteApiBook): FavoriteBook {
    let estTime = '';
    if (b.word_count && b.word_count > 0) {
      const mins = Math.ceil(b.word_count / 200);
      estTime = mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(1)} h`;
    } else if (b.page_count && b.page_count > 0) {
      const mins = Math.ceil((b.page_count * 230) / 200);
      estTime = mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(1)} h`;
    }

    const inv = this.userInventoryMap.get(String(b.id)) || (b.slug ? this.userInventoryMap.get(String(b.slug)) : undefined);

    return {
      id: String(b.id),
      title: b.title,
      slug: b.slug,
      synopsis: b.synopsis || '',
      is_featured: !!b.is_featured,
      cover_image: b.cover_image,
      coverThumb: this.thumb(b.cover_image),
      coverLoaded: true,
      author_name: b.author_name || 'Autor Clásico',
      word_count: b.word_count,
      page_count: b.page_count,
      readingTimeEstimate: estTime,
      inventoryId: inv?.inventoryId,
      readingProgress: inv?.progress
    };
  }

  removeFavorite(book: FavoriteBook, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.pendingBookIds.has(book.id)) return;
    this.pendingBookIds.add(book.id);
    this.errorMsg = '';

    this.favoritesService
      .setFavorite(book.id, false)
      .pipe(finalize(() => this.pendingBookIds.delete(book.id)))
      .subscribe({
        error: error => {
          console.error('No se pudo quitar el favorito.', error);
          this.errorMsg = 'No se pudo quitar la obra. Intenta nuevamente.';
        },
      });
  }

  clearAllFavorites(): void {
    if (!confirm('¿Estás seguro de que deseas eliminar todas las obras de tus favoritos?')) return;
    if (this.isClearing) return;

    this.isClearing = true;
    this.errorMsg = '';
    this.favoritesService
      .clear()
      .pipe(finalize(() => this.isClearing = false))
      .subscribe({
        error: error => {
          console.error('No se pudieron limpiar los favoritos.', error);
          this.errorMsg = 'No se pudieron quitar las obras. Intenta nuevamente.';
        },
      });
  }

  onImgLoad(book: FavoriteBook): void {
    book.coverLoaded = true;
  }

  onImgError(event: Event, book: FavoriteBook): void {
    const img = event.target as HTMLImageElement;
    book.coverLoaded = true;
    if (!img.src.endsWith('default_cover.jpg')) {
      img.src = 'assets/default_cover.jpg';
    }
  }

  goToReader(book: FavoriteBook, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (book.inventoryId) {
      this.router.navigate(['/reader', book.inventoryId]);
    } else {
      this.router.navigate(['/book', book.slug]);
    }
  }

  addToCart(book: FavoriteBook, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    try {
      const raw = localStorage.getItem('literatus_cart');
      const cart: any[] = raw ? JSON.parse(raw) : [];
      const exists = cart.some(item => item.id === book.id || item.slug === book.slug);
      if (!exists) {
        cart.push({
          id: book.id,
          title: book.title,
          slug: book.slug,
          coverThumb: book.coverThumb,
          author_name: book.author_name,
          price: 0,
          type: 'book',
          label: 'Obra Literaria'
        });
        localStorage.setItem('literatus_cart', JSON.stringify(cart));
        window.dispatchEvent(new Event('literatus-cart-updated'));
      }
      this.router.navigate(['/cart']);
    } catch {
      this.router.navigate(['/cart']);
    }
  }
}
