import {
  Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { coverThumb } from '../../utils/cover-thumb.util';
import { getBookPages } from '../../utils/book-pages.util';
import { NAV_GENRES } from './nav-genres';

export type NavPanel = 'categories' | 'authors' | 'library';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  /** Rutas que marcan la sección como activa (prefijos). */
  match: string[];
  panel?: NavPanel;
}

interface ShelfBook {
  id: string;
  title: string;
  cover: string;
  pct: number;
  meta: string;
}

/** Intención: cruzar la barra con el mouse no debe abrir menús. */
const OPEN_DELAY_MS = 120;
/** Margen para pasar del botón al panel sin que se cierre. */
const CLOSE_DELAY_MS = 160;
/** La biblioteca cambia con la lectura: se vuelve a pedir si pasó más de un minuto. */
const LIBRARY_TTL_MS = 60_000;
const PANEL_MAX_WIDTH = 500;
const PANEL_GUTTER = 16;
const AUTHORS_BANNER_GENRE = 'biografias-diarios-y-hechos-reales';

/** true solo la primera vez que se consulta la clave en esta pestaña. */
export function firstTimeThisSession(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch {
    // Sin almacenamiento (modo privado estricto): se muestra, no pasa nada.
  }
  return true;
}

/**
 * Segunda fila del header: secciones con un indicador que se desliza a la activa,
 * menús amplios (Categorías, Autores, Mi Biblioteca) y el botón "Sé parte de Literatus".
 *
 * Los paneles se posicionan contra el header (sticky) para no quedar recortados por la
 * barra, que oculta su contenido al plegarse. Con mouse se abren por intención (hover
 * con retardo); en táctil y teclado, con la flecha junto a cada sección.
 */
@Component({
  selector: 'app-main-nav',
  templateUrl: './main-nav.component.html',
  styleUrl: './main-nav.component.css',
})
export class MainNavComponent implements OnInit, OnChanges, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  @Input() isLoggedIn = false;
  @Input() rewardReady: boolean | null = false;
  /** La barra está plegada: no puede quedar un menú abierto. */
  @Input() collapsed = false;

  readonly items: NavItem[] = [
    { label: 'Explorar', icon: 'explore', link: '/catalog', match: ['/catalog', '/book/'] },
    { label: 'Categorías', icon: 'grid_view', link: '/categories', match: ['/categories'], panel: 'categories' },
    { label: 'Autores', icon: 'history_edu', link: '/authors', match: ['/authors', '/author/'], panel: 'authors' },
    { label: 'Personajes', icon: 'groups', link: '/characters', match: ['/characters', '/demo-chat'] },
    { label: 'La Taberna', icon: 'local_cafe', link: '/tavern', match: ['/tavern'] },
    { label: 'Mi Biblioteca', icon: 'menu_book', link: '/library', match: ['/library', '/favorites'], panel: 'library' },
    { label: 'La Senda', icon: 'map', link: '/learn', match: ['/learn'] },
    { label: 'El Enigma', icon: 'extension', link: '/games/enigma', match: ['/games/enigma'] },
    { label: 'Interrogatorio', icon: 'visibility_off', link: '/games/interrogatorio', match: ['/games/interrogatorio', '/games/blind-interrogation', '/interrogatorio'] },
    { label: 'Logros', icon: 'emoji_events', link: '/achievements', match: ['/achievements'] },
  ];

  readonly genres = NAV_GENRES;
  readonly featuredGenres = [
    { slug: 'cuentos', title: 'Cuentos clásicos', text: 'Las historias que nunca pasan de moda.', cover: '' },
    { slug: 'fantasia', title: 'Fantasía', text: 'Mundos mágicos y grandes aventuras.', cover: '' },
  ];
  readonly authors = [
    { name: 'Oscar Wilde', slug: 'oscar-wilde', photo: '' },
    { name: 'Franz Kafka', slug: 'franz-kafka', photo: '' },
    { name: 'Lewis Carroll', slug: 'lewis-carroll', photo: '' },
    { name: 'Julio Verne', slug: 'julio-verne', photo: '' },
    { name: 'Jane Austen', slug: 'jane-austen', photo: '' },
  ];
  authorsBanner = '';

  library: { state: 'idle' | 'loading' | 'ready' | 'error'; current: ShelfBook | null; shelf: ShelfBook[]; more: number } =
    { state: 'idle', current: null, shelf: [], more: 0 };

  openPanel: NavPanel | null = null;
  /** De un menú abierto a otro el cambio es inmediato: la animación ya se vio. */
  instant = false;
  readonly pos: Record<NavPanel, { left: number; origin: string }> = {
    categories: { left: 0, origin: '50% 0' },
    authors: { left: 0, origin: '50% 0' },
    library: { left: 0, origin: '50% 0' },
  };

  /** El destello del botón destacado se ve una vez por sesión, no en cada recarga del header. */
  readonly showSheen = firstTimeThisSession('lit-nav-sheen');

  indicatorIndex = 0;
  indicatorVisible = false;
  /** Al aparecer (o volver de una ruta sin sección) el indicador no se desliza, solo aparece. */
  indicatorInstant = true;

  private openTimer: ReturnType<typeof setTimeout> | undefined;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;
  private genresRequested = false;
  private authorsRequested = false;
  private libraryFetchedAt = 0;
  private revealed = false;
  private routerSub?: Subscription;
  private readonly finePointer =
    typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  ngOnInit(): void {
    this.syncActive(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        this.close();
        this.syncActive(e.urlAfterRedirects);
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['collapsed'] && this.collapsed) this.close();
    if (changes['isLoggedIn'] && !changes['isLoggedIn'].firstChange) {
      this.library = { state: 'idle', current: null, shelf: [], more: 0 };
      this.libraryFetchedAt = 0;
    }
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
  }

  // ── Indicador de sección activa ─────────────────────────────────────

  private syncActive(url: string): void {
    const path = url.split(/[?#]/)[0];
    const index = this.items.findIndex(item =>
      item.match.some(m => (m.endsWith('/') ? path.startsWith(m) : path === m || path.startsWith(m + '/'))));
    if (index === -1) {
      this.indicatorVisible = false;
      return;
    }
    this.indicatorInstant = !this.indicatorVisible;
    this.indicatorIndex = index;
    this.indicatorVisible = true;
    setTimeout(() => this.revealActive(index));
  }

  /**
   * En móvil la fila se desliza: la sección activa queda centrada a la vista. Al cargar la
   * página ya aparece en su sitio; al cambiar de sección se desliza hasta ella.
   */
  private revealActive(index: number): void {
    const row = this.host.querySelector<HTMLElement>('.mn-items');
    const item = this.host.querySelectorAll<HTMLElement>('.mn-item')[index];
    if (!row || !item || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({
      left: item.offsetLeft - (row.clientWidth - item.offsetWidth) / 2,
      behavior: this.revealed && !this.reducedMotion ? 'smooth' : 'auto',
    });
    this.revealed = true;
  }

  // ── Menús: intención con mouse ──────────────────────────────────────

  /** Al entrar a la barra se adelantan los datos públicos: el menú abre ya con fotos. */
  warmUp(): void {
    if (!this.finePointer) return;
    this.load('categories');
    this.load('authors');
  }

  onItemEnter(item: NavItem, trigger: HTMLElement): void {
    if (!this.finePointer || this.collapsed) return;
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    if (!item.panel) {
      if (this.openPanel) this.scheduleClose();
      return;
    }
    const panel = item.panel;
    this.load(panel);
    if (this.openPanel) {
      this.open(panel, trigger, true);
    } else {
      this.openTimer = setTimeout(() => this.open(panel, trigger, false), OPEN_DELAY_MS);
    }
  }

  onItemLeave(): void {
    if (!this.finePointer) return;
    clearTimeout(this.openTimer);
    if (this.openPanel) this.scheduleClose();
  }

  onPanelEnter(): void {
    clearTimeout(this.closeTimer);
  }

  onPanelLeave(): void {
    if (this.finePointer) this.scheduleClose();
  }

  // ── Menús: flecha (táctil y teclado) ────────────────────────────────

  toggle(item: NavItem, trigger: HTMLElement, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!item.panel) return;
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    if (this.openPanel === item.panel) {
      this.close();
      return;
    }
    const panel = item.panel;
    this.load(panel);
    this.open(panel, trigger, !!this.openPanel);
    // detail === 0: se activó con teclado; el foco entra al menú.
    if (event.detail === 0) setTimeout(() => this.focusables(panel)[0]?.focus());
  }

  onPanelKeydown(event: KeyboardEvent, panel: NavPanel): void {
    if (event.key !== 'Tab') return;
    const list = this.focusables(panel);
    if (!list.length) return;
    const active = document.activeElement;
    if (event.shiftKey && active === list[0]) {
      event.preventDefault();
      this.caret(panel)?.focus();
    } else if (!event.shiftKey && active === list[list.length - 1]) {
      // Al salir por el final se sigue con la sección que viene después del botón.
      event.preventDefault();
      const index = this.items.findIndex(i => i.panel === panel);
      this.close();
      const next = this.host.querySelectorAll<HTMLElement>('.mn-link, .mn-cta')[index + 1];
      next?.focus();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.openPanel) return;
    const panel = this.openPanel;
    const focusInside = this.host.querySelector(`#mn-panel-${panel}`)?.contains(document.activeElement);
    this.close();
    if (focusInside) this.caret(panel)?.focus();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.openPanel && !this.host.contains(event.target as Node)) this.close();
  }

  close(): void {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    this.openPanel = null;
    this.instant = false;
  }

  private scheduleClose(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.close(), CLOSE_DELAY_MS);
  }

  private open(panel: NavPanel, trigger: HTMLElement, instant: boolean): void {
    this.place(panel, trigger);
    this.instant = instant;
    this.openPanel = panel;
  }

  /** Centra el panel bajo su sección sin salirse del header; crece desde la sección. */
  private place(panel: NavPanel, trigger: HTMLElement): void {
    const header = this.host.closest('header') ?? this.host;
    const bounds = header.getBoundingClientRect();
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(PANEL_MAX_WIDTH, bounds.width - PANEL_GUTTER * 2);
    const center = rect.left + rect.width / 2 - bounds.left;
    const left = Math.max(PANEL_GUTTER, Math.min(center - width / 2, bounds.width - width - PANEL_GUTTER));
    this.pos[panel] = { left, origin: `${Math.round(center - left)}px 0` };
  }

  private focusables(panel: NavPanel): HTMLElement[] {
    const root = this.host.querySelector(`#mn-panel-${panel}`);
    return root ? Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')) : [];
  }

  private caret(panel: NavPanel): HTMLElement | null {
    return this.host.querySelector<HTMLElement>(`[aria-controls="mn-panel-${panel}"]`);
  }

  // ── Datos de los paneles (se piden al primer uso) ───────────────────

  private load(panel: NavPanel): void {
    if (panel === 'library') {
      this.loadLibrary();
      return;
    }
    if (!this.genresRequested) {
      this.genresRequested = true;
      this.api.getCached<any>('catalog/genres/?page_size=100').subscribe({
        next: res => {
          const list: any[] = Array.isArray(res) ? res : (res?.results ?? []);
          const bySlug = new Map(list.map(g => [g.slug, g]));
          for (const feature of this.featuredGenres) {
            const cover = bySlug.get(feature.slug)?.cover_image;
            feature.cover = cover ? coverThumb(cover, 320, 200, 62) : '';
          }
          const banner = bySlug.get(AUTHORS_BANNER_GENRE)?.cover_image;
          this.authorsBanner = banner ? coverThumb(banner, 640, 240, 62) : '';
        },
        error: () => (this.genresRequested = false),
      });
    }
    if (panel === 'authors' && !this.authorsRequested) {
      this.authorsRequested = true;
      for (const author of this.authors) {
        this.api.getCached<any>(`catalog/authors/${author.slug}/`).subscribe({
          next: detail => (author.photo = detail?.photo ? coverThumb(detail.photo, 128, 128, 70) : ''),
          error: () => undefined,
        });
      }
    }
  }

  private loadLibrary(): void {
    // Sin sesión la API responde 401 y el interceptor mandaría a /login.
    if (!this.isLoggedIn || this.library.state === 'loading') return;
    if (Date.now() - this.libraryFetchedAt < LIBRARY_TTL_MS) return;
    if (this.library.state !== 'ready') this.library = { ...this.library, state: 'loading' };

    this.api.get<any>('library/inventory/').subscribe({
      next: res => {
        const list: any[] = Array.isArray(res) ? res : (res?.results ?? []);
        const total: number = Array.isArray(res) ? list.length : (res?.count ?? list.length);
        const pct = (it: any) => it.progress?.completion_percentage || 0;
        const stamp = (it: any) => Date.parse(it.progress?.updated_at || it.acquired_at || '') || 0;
        const reading = list.filter(it => pct(it) > 0 && pct(it) < 100).sort((a, b) => stamp(b) - stamp(a));
        const current = reading[0] ?? list[0] ?? null;
        const shelf = list.filter(it => it !== current).slice(0, 4);
        this.library = {
          state: 'ready',
          current: current ? this.toShelfBook(current) : null,
          shelf: shelf.map(it => this.toShelfBook(it)),
          more: Math.max(0, total - (current ? 1 : 0) - shelf.length),
        };
        this.libraryFetchedAt = Date.now();
      },
      error: () => {
        this.library = { ...this.library, state: this.library.current ? 'ready' : 'error' };
      },
    });
  }

  private toShelfBook(item: any): ShelfBook {
    const pct = Math.round(item.progress?.completion_percentage || 0);
    const pages = getBookPages(item);
    const page = item.progress?.current_page || 0;
    const meta = page > 0 ? `Página ${page} de ${pages}` : pct > 0 ? `${pct} % leído` : `${pages} páginas`;
    return {
      id: item.id,
      title: item.book_title || item.edition?.book?.title || 'Sin título',
      cover: coverThumb(item.book_cover || item.edition?.book?.cover_image, 160, 240, 62),
      pct,
      meta,
    };
  }

  /** Las imágenes aparecen con un fundido al terminar de cargar, en vez de saltar. */
  onImageLoad(event: Event): void {
    (event.target as HTMLElement).classList.add('is-loaded');
  }

  onCoverError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('default_cover.jpg')) img.src = 'assets/default_cover.jpg';
  }
}
