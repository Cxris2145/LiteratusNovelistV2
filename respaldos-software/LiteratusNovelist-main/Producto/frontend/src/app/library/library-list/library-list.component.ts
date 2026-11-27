import { Component, DestroyRef, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { NotebookService } from '../../notebook/notebook.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { getBookPages } from '../../core/utils/book-pages.util';
import { imageThumb } from '../../core/utils/cover-thumb.util';

const DEFAULT_COVER = 'assets/default_cover.jpg';

@Component({
  selector: 'app-library-list',
  templateUrl: './library-list.component.html',
  styleUrls: ['./library-list.component.css']
})
export class LibraryListComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  public auth = inject(AuthService);
  private characterChat = inject(CharacterChatService);
  private notebook = inject(NotebookService);
  private destroyRef = inject(DestroyRef);
  private zone = inject(NgZone);
  private unbindKeydown?: () => void;
  private summaryFocusTimer?: ReturnType<typeof setTimeout>;
  getBookPages = getBookPages;

  inventoryItems: any[] = [];
  isLoading = true;
  isAnonymous = false;
  errorMsg = '';

  activeFilter: 'all' | 'reading' | 'completed' | 'unread' = 'all';
  searchTerm: string = '';

  private readonly EAGER_COVERS = 6;
  readonly skeletons = [0, 1, 2, 3, 4, 5];

  /** Libro cuyo resumen con IA está abierto en la ventana (null = cerrada). */
  summaryItem: any | null = null;
  @ViewChild('summaryClose') summaryClose?: ElementRef<HTMLButtonElement>;

  private filteredSource?: any[];
  private filteredMode?: string;
  private filteredQuery?: string;
  private filteredResult: any[] = [];
  private countsSource?: any[];
  private counts = { reading: 0, completed: 0, unread: 0 };

  get filteredItems(): any[] {
    const q = this.searchTerm.trim().toLowerCase();
    if (this.filteredSource === this.inventoryItems && this.filteredMode === this.activeFilter && this.filteredQuery === q) {
      return this.filteredResult;
    }
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
    if (q) {
      items = items.filter(item => {
        const title = (item.book_title || item.edition?.book?.title || '').toLowerCase();
        const author = (item.author_name || item.edition?.book?.author_name || '').toLowerCase();
        return title.includes(q) || author.includes(q);
      });
    }

    this.filteredSource = this.inventoryItems;
    this.filteredMode = this.activeFilter;
    this.filteredQuery = q;
    this.filteredResult = items;
    return this.filteredResult;
  }

  clearSearch(): void {
    this.searchTerm = '';
  }


  get readingCount(): number {
    return this.readingCounts.reading;
  }

  get completedCount(): number {
    return this.readingCounts.completed;
  }

  get unreadCount(): number {
    return this.readingCounts.unread;
  }

  private get readingCounts(): typeof this.counts {
    if (this.countsSource !== this.inventoryItems) {
      const counts = { reading: 0, completed: 0, unread: 0 };
      for (const item of this.inventoryItems) {
        const pct = item.progress?.completion_percentage || 0;
        if (pct === 0) counts.unread++;
        else if (pct >= 100) counts.completed++;
        else if (pct > 0) counts.reading++;
      }
      this.countsSource = this.inventoryItems;
      this.counts = counts;
    }
    return this.counts;
  }

  setFilter(filter: 'all' | 'reading' | 'completed' | 'unread'): void {
    this.activeFilter = filter;
  }


  ngOnInit(): void {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.summaryItem) this.zone.run(() => this.closeSummary());
    };
    this.zone.runOutsideAngular(() => document.addEventListener('keydown', onKeydown));
    this.unbindKeydown = () => document.removeEventListener('keydown', onKeydown);
    // Los accesos del menú de Mi Biblioteca llegan con ?estado=leyendo|completados|pendientes.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const estado = params.get('estado');
      this.activeFilter = estado === 'leyendo' ? 'reading'
        : estado === 'completados' ? 'completed'
        : estado === 'pendientes' ? 'unread'
        : 'all';
    });

    if (!this.auth.isLoggedIn()) {
      this.isAnonymous = true;
      this.isLoading = false;
      return;
    }
    this.fetchInventory();
  }

  ngOnDestroy(): void {
    this.unbindKeydown?.();
    clearTimeout(this.summaryFocusTimer);
    document.body.style.overflow = '';
  }

  // ── Resumen del libro (ventana) ───────────────────────────────
  /** La tarjeta entera lleva al lector: el botón del resumen no debe dejar pasar el clic. */
  /** Conversar con los personajes del libro en la ventana rápida, sin abrir el lector. */
  openCharacters(item: any, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.characterChat.openForBook(item.id);
  }

  /** Cuaderno del libro: apuntes propios y sus subrayados, notas y palabras guardadas. */
  openNotebook(item: any, event: Event): void {
    event.stopPropagation();
    if (item?.id) this.notebook.openForBook(String(item.id));
  }

  openSummary(item: any, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.summaryItem = item;
    document.body.style.overflow = 'hidden';
    clearTimeout(this.summaryFocusTimer);
    this.summaryFocusTimer = setTimeout(() => this.summaryClose?.nativeElement.focus());
  }

  closeSummary(): void {
    if (!this.summaryItem) return;
    clearTimeout(this.summaryFocusTimer);
    this.summaryItem = null;
    document.body.style.overflow = '';
  }

  private decorate(list: any[]): any[] {
    return list.map((item, i) => {
      const originalCover = item.book_cover || item.edition?.book?.cover_image || DEFAULT_COVER;
      return {
        ...item,
        originalCover,
        coverThumb: imageThumb(originalCover, 360, 60),
        coverLoaded: true,
        coverPriority: i < this.EAGER_COVERS
      };
    });
  }

  onImgLoad(item: any): void { item.coverLoaded = true; }
  onImgError(item: any): void {
    item.coverLoaded = true;
    if (item.coverThumb === DEFAULT_COVER) return;
    item.coverThumb = item.coverThumb === item.originalCover ? DEFAULT_COVER : item.originalCover;
  }

  trackItem = (_: number, it: any) => it.id;

  fetchInventory(): void {
    // Datos por usuario y mutables (progreso) → GET normal, sin caché compartida.
    this.api.get<any[]>('library/inventory/').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
