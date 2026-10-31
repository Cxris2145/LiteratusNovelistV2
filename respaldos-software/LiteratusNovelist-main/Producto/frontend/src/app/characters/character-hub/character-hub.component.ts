import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  TemplateRef,
  inject
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { EMPTY, Observable, Subject, Subscription, merge, throwError, timer } from 'rxjs';
import { catchError, debounce, filter, map, shareReplay, switchMap, tap } from 'rxjs/operators';

import { ApiService } from '../../core/services/api.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { ScrollRevealService } from '../../core/services/scroll-reveal.service';
import { AuthService } from '../../core/services/auth.service';
import {
  ChatService, HUB_PAGE_SIZE, HubAvatar, HubKind, HubSearchField, HubSort, Paginated
} from '../../core/services/chat.service';

/** Retrato de respaldo mientras el personaje no tenga imagen generada. */
import { FALLBACK_AVATAR, hubIdentity, pageWindow, portraitThumbnail, segmentClip, uniqueCharacters } from './character-hub.util';

/**
 * Diapositiva del carrusel. Lleva precalculados el extracto y las URLs de imagen
 * para no recalcularlos en cada ciclo de detección de cambios: el `SlicePipe` es
 * impuro y se re-ejecutaba en cada tick.
 */
interface HeroSlide extends HubAvatar {
  excerpt: string;
  portrait: string;
  background: string;
}

type ListSort = Exclude<HubSort, 'daily'>;

/** Lo que pide la grilla. `immediate`: un filtro tocado no espera como el texto. */
interface HubQuery {
  q: string;
  field: HubSearchField;
  sort: ListSort;
  withPhoto: boolean;
  kind: HubKind;
  genre: string;
  /** Sin filtros, la grilla empieza después de los que ya mostró «Más destacados». */
  skip: number;
  immediate?: boolean;
}

/** Una página de la grilla. `focusTitle`: se pidió desde el paginador de abajo. */
interface GridRequest {
  query: HubQuery;
  page: number;
  reveal: boolean;
  focusTitle?: boolean;
}

interface GenreOption {
  slug: string;
  name: string;
}

/** Diapositivas del carrusel: se piden algunas de más por si el lector ya habló con ellas. */
const HERO_SLIDES = 6;
const HERO_REQUEST = 10;
/** Tarjetas de «Más destacados». La grilla de abajo empieza después de ellas. */
const FEATURED_STRIP = 12;
/** Páginas guardadas: volver a una ya vista (o a la que se precargó) es instantáneo. */
const PAGE_CACHE_LIMIT = 30;
/** Desplazamiento horizontal mínimo para que un deslizamiento cambie de diapositiva. */
const SWIPE_MIN = 40;

/** El campo solo cuenta si hay texto: sin él, cambiar "Buscar en" no cambia los resultados. */
function queryKey(query: HubQuery): string {
  return [query.q, query.q ? query.field : '', query.sort, query.withPhoto, query.kind, query.genre, query.skip].join('|');
}

@Component({
  selector: 'app-character-hub',
  templateUrl: './character-hub.component.html',
  styleUrls: ['./character-hub.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CharacterHubComponent implements OnInit, OnDestroy {
  chatService = inject(ChatService);
  api = inject(ApiService);
  router = inject(Router);
  auth = inject(AuthService);
  private characterChat = inject(CharacterChatService);
  /** Las secciones se pintan al llegar los datos: hay que pedir que se revelen. */
  private scrollReveal = inject(ScrollRevealService);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private dialog = inject(MatDialog);
  @ViewChild('bookPicker') private bookPicker!: TemplateRef<unknown>;
  @ViewChild('gridTop') private gridTop?: ElementRef<HTMLElement>;
  @ViewChild('gridTitle') private gridTitle?: ElementRef<HTMLElement>;

  readonly fallbackAvatar = FALLBACK_AVATAR;

  readonly searchFields: { value: HubSearchField; label: string }[] = [
    { value: 'all', label: 'Todo' },
    { value: 'name', label: 'Nombre' },
    { value: 'book', label: 'Libro' },
    { value: 'author', label: 'Autor' },
  ];
  readonly kindOptions: { value: HubKind; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'character', label: 'Personajes' },
    { value: 'author', label: 'Autores' },
  ];
  readonly sortOptions: { value: ListSort; label: string }[] = [
    { value: 'featured', label: 'Destacados' },
    { value: 'popularity', label: 'Populares' },
    { value: 'name', label: 'A–Z' },
  ];
  private readonly placeholders: Record<HubSearchField, string> = {
    all: 'Busca personajes, libros o autores...',
    name: 'Nombre del personaje...',
    book: 'Título del libro...',
    author: 'Nombre del autor...',
  };

  /** Categorías del catálogo para el filtro. */
  genres: GenreOption[] = [];

  // Secciones de arriba
  heroCharacters: HeroSlide[] = [];
  featuredCharacters: HubAvatar[] = [];
  recentCharacters: HubAvatar[] = [];
  /** Tal como llegan; updateSections los reparte sin repetir a nadie. */
  private heroSource: HubAvatar[] = [];
  private stripSource: HubAvatar[] = [];

  isStripLoading = true;
  isHeroLoading = true;
  /** Hay texto o algún filtro distinto del predeterminado: se ocultan las secciones de arriba. */
  isSearching = false;

  // Filtros
  searchQuery = '';
  searchField: HubSearchField = 'all';
  sort: ListSort = 'featured';
  withPhoto = false;
  kind: HubKind = 'all';
  genre = '';

  // Control del Carrusel Hero
  currentHeroIndex = 0;

  // Grilla paginada (sin filtros: «Más personajes»; con filtros: los resultados)
  gridCharacters: HubAvatar[] = [];
  gridPage = 1;
  /** `count` del backend para la consulta actual. */
  gridTotal = 0;
  gridLoading = true;
  gridError = false;
  /** -1, 0 o 1: hacia dónde entran las tarjetas (0 al cambiar los filtros). */
  gridDirection = 0;
  readonly pageSize = HUB_PAGE_SIZE;
  /** Lo que muestra (o está pidiendo) la grilla. */
  private gridQuery!: HubQuery;
  private gridKey = '';
  /** Cambia con cada página: las tarjetas se montan de nuevo y entran todas parejas. */
  private resultsVersion = 0;

  private readonly query$ = new Subject<HubQuery>();
  private readonly pageNav$ = new Subject<GridRequest>();
  private readonly pageCache = new Map<string, Observable<Paginated<HubAvatar>>>();
  private readonly subs = new Subscription();

  // Skeleton
  skeletonArray = Array(6).fill(0);
  readonly gridSkeleton = Array(12).fill(0);

  ngOnInit() {
    this.loadStrip();
    this.loadHero();
    this.loadRecent();
    this.loadGenres();
    this.initGrid();
    this.refreshResults(true);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.carouselCleanup?.();
  }

  // ─── Carga de datos ──────────────────────────────────────────────────────────

  private loadStrip() {
    this.subs.add(this.chatService.getGlobalAvatars('', 'featured', 1, FEATURED_STRIP).subscribe({
      next: (res) => {
        this.stripSource = uniqueCharacters(res.results);
        this.isStripLoading = false;
        this.updateSections();
        this.cdr.markForCheck();
        this.scrollReveal.debouncedScan();
      },
      error: () => {
        this.isStripLoading = false;
        this.cdr.markForCheck();
      }
    }));
  }

  /** El carrusel solo muestra retratos: personajes del día primero y autores si faltan. */
  private loadHero() {
    this.subs.add(this.chatService.getGlobalAvatars('', 'daily', 1, HERO_REQUEST, { withPhoto: true }).subscribe({
      next: (res) => {
        this.heroSource = uniqueCharacters(res.results);
        this.isHeroLoading = false;
        this.updateSections();
        this.cdr.markForCheck();
      },
      error: () => {
        this.isHeroLoading = false;
        this.cdr.markForCheck();
      }
    }));
  }

  private loadRecent() {
    this.subs.add(this.chatService.getRecentAvatars().subscribe({
      next: (data) => {
        this.recentCharacters = uniqueCharacters(data);
        this.updateSections();
        this.cdr.markForCheck();
        this.scrollReveal.debouncedScan();
      },
      error: (err) => console.warn('No se pudieron cargar recientes', err)
    }));
  }

  private loadGenres() {
    this.subs.add(this.api.getCached<any>('catalog/genres/?page_size=100', undefined, 15 * 60 * 1000).subscribe({
      next: (res) => {
        this.genres = (res?.results ?? res ?? [])
          .filter((genre: any) => (genre.book_count ?? 0) > 0)
          .map((genre: any) => ({ slug: genre.slug, name: genre.name }));
        this.cdr.markForCheck();
      },
      error: () => {}
    }));
  }

  // ─── Grilla paginada ─────────────────────────────────────────────────────────

  get gridPages(): number {
    return Math.max(1, Math.ceil(this.gridTotal / this.pageSize));
  }

  get pageItems(): (number | null)[] {
    return pageWindow(this.gridPage, this.gridPages);
  }

  get gridSummary(): string {
    if (!this.isSearching) {
      return this.gridTotal ? `${this.gridTotal + FEATURED_STRIP} personajes para conversar, de ${this.pageSize} en ${this.pageSize}.` : '';
    }
    const parts = [this.sortLabel];
    if (this.genre) parts.push(this.genres.find(genre => genre.slug === this.genre)?.name ?? '');
    if (this.withPhoto) parts.push('solo con retrato');
    if (!this.gridLoading) {
      const one = this.gridTotal === 1;
      const noun = this.kind === 'author' ? (one ? 'autor' : 'autores') : (one ? 'personaje' : 'personajes');
      parts.push(`${this.gridTotal} ${noun}`);
    }
    return parts.filter(Boolean).join(' · ');
  }

  /** Título de la grilla con filtros y sin texto. */
  get resultsTitle(): string {
    return this.kind === 'author' ? 'Todos los autores' : 'Todos los personajes';
  }

  /**
   * Filtros (con espera para el texto) y cambios de página entran por el mismo `switchMap`:
   * la última página pedida gana aunque una anterior responda después.
   */
  private initGrid() {
    const fromFilters$ = this.query$.pipe(
      debounce((query) => timer(query.immediate ? 0 : 400)),
      // Escribir y borrar dentro de la espera vuelve a lo que ya se ve: no se pide de nuevo.
      filter((query) => queryKey(query) !== this.gridKey),
      map((query): GridRequest => ({ query, page: 1, reveal: false })),
    );
    this.subs.add(merge(fromFilters$, this.pageNav$).pipe(
      tap((request) => {
        if (request.page === 1 && !request.reveal) this.gridDirection = 0;
        this.gridQuery = request.query;
        this.gridKey = queryKey(request.query);
        this.gridPage = request.page;
        this.gridLoading = true;
        this.gridError = false;
        this.cdr.markForCheck();
      }),
      switchMap((request) => this.fetchPage(request.query, request.page).pipe(
        map((res) => ({ request, res })),
        catchError(() => {
          this.gridLoading = false;
          this.gridError = true;
          this.cdr.markForCheck();
          return EMPTY;
        }),
      )),
    ).subscribe(({ request, res }) => {
      this.resultsVersion += 1;
      this.gridCharacters = uniqueCharacters(res.results);
      this.gridTotal = res.count;
      this.gridLoading = false;
      this.cdr.markForCheck();
      this.scrollReveal.debouncedScan();
      if (request.reveal) this.revealGrid(request.focusTitle);
    }));
  }

  private fetchPage(query: HubQuery, page: number): Observable<Paginated<HubAvatar>> {
    const key = `${queryKey(query)}#${page}`;
    let page$ = this.pageCache.get(key);
    if (!page$) {
      page$ = this.chatService.getGlobalAvatars(query.q, query.sort, page, this.pageSize, {
        field: query.field, withPhoto: query.withPhoto, kind: query.kind, genre: query.genre, skip: query.skip,
      }).pipe(
        // Un fallo no se queda guardado: el siguiente intento vuelve a pedirla.
        catchError((err) => {
          this.pageCache.delete(key);
          return throwError(() => err);
        }),
        shareReplay(1),
      );
      this.pageCache.set(key, page$);
      if (this.pageCache.size > PAGE_CACHE_LIMIT) {
        this.pageCache.delete(this.pageCache.keys().next().value as string);
      }
    }
    return page$;
  }

  /** `fromPager`: el botón quedó abajo, así que el foco sube al título de la grilla. */
  goToPage(page: number, fromPager = false) {
    if (!this.gridQuery || page < 1 || page > this.gridPages || page === this.gridPage) return;
    this.gridDirection = page > this.gridPage ? 1 : -1;
    this.pageNav$.next({ query: this.gridQuery, page, reveal: true, focusTitle: fromPager });
  }

  /** Al apuntar a una flecha ya se pide esa página: al hacer clic suele estar lista. */
  prefetch(page: number) {
    if (!this.gridQuery || page < 1 || page > this.gridPages || page === this.gridPage) return;
    this.subs.add(this.fetchPage(this.gridQuery, page).subscribe({ error: () => {} }));
  }

  retryGrid() {
    if (this.gridQuery) this.pageNav$.next({ query: this.gridQuery, page: this.gridPage, reveal: false });
  }

  /**
   * Si el comienzo de la grilla quedó arriba (bajo el menú), vuelve a él. Desde el paginador de
   * abajo es más de una pantalla: salta de una vez, como al dar vuelta la hoja.
   */
  private revealGrid(focusTitle = false) {
    const section = this.gridTop?.nativeElement;
    if (!section) return;
    const headerBottom = document.querySelector('header.main-header')?.getBoundingClientRect().bottom ?? 0;
    const distance = section.getBoundingClientRect().top - headerBottom - 16;
    if (distance < 0) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const far = -distance > window.innerHeight;
      window.scrollTo({ top: window.scrollY + distance, behavior: reduced || far ? 'auto' : 'smooth' });
    }
    if (focusTitle) this.gridTitle?.nativeElement.focus({ preventScroll: true });
  }

  // ─── Búsqueda y filtros ──────────────────────────────────────────────────────

  get placeholder(): string {
    return this.placeholders[this.searchField];
  }

  get hasActiveFilters(): boolean {
    return this.searchField !== 'all' || this.sort !== 'featured' || this.withPhoto
      || this.kind !== 'all' || !!this.genre;
  }

  get sortLabel(): string {
    return this.sortOptions.find(option => option.value === this.sort)?.label ?? '';
  }

  /** Recorte de la copia activa de cada control segmentado (receta "tab indicator"). */
  get kindClip(): string {
    return segmentClip(this.kindOptions.findIndex(option => option.value === this.kind), this.kindOptions.length);
  }

  get sortClip(): string {
    return segmentClip(this.sortOptions.findIndex(option => option.value === this.sort), this.sortOptions.length);
  }

  onSearchChange() {
    this.refreshResults(false);
  }

  setSearchField(field: HubSearchField) {
    this.searchField = field;
    this.refreshResults(true);
  }

  setSort(sort: ListSort) {
    this.sort = sort;
    this.refreshResults(true);
  }

  setKind(kind: HubKind) {
    this.kind = kind;
    this.refreshResults(true);
  }

  setGenre(genre: string) {
    this.genre = genre;
    this.refreshResults(true);
  }

  toggleWithPhoto() {
    this.withPhoto = !this.withPhoto;
    this.refreshResults(true);
  }

  clearFilters() {
    this.searchQuery = '';
    this.searchField = 'all';
    this.sort = 'featured';
    this.withPhoto = false;
    this.kind = 'all';
    this.genre = '';
    this.refreshResults(true);
  }

  private refreshResults(immediate: boolean) {
    const q = this.searchQuery.trim();
    this.isSearching = !!q || this.sort !== 'featured' || this.withPhoto || this.kind !== 'all' || !!this.genre;
    const query: HubQuery = {
      q, field: this.searchField, sort: this.sort, withPhoto: this.withPhoto, kind: this.kind, genre: this.genre,
      skip: this.isSearching ? 0 : FEATURED_STRIP, immediate,
    };
    // Mientras espera, lo de antes se atenúa; si se volvió a lo que ya se ve, no.
    this.gridLoading = queryKey(query) !== this.gridKey;
    this.query$.next(query);
    this.cdr.markForCheck();
    this.scrollReveal.debouncedScan();
  }

  // ─── Carrusel ────────────────────────────────────────────────────────────────

  private carouselCleanup?: () => void;

  /**
   * El avance automático lo marca la barra de progreso del punto activo (CSS): al
   * terminar su animación pasa a la siguiente. Así, pausarla con hover, foco o la
   * pestaña oculta pausa también el avance, y con movimiento reducido no hay avance.
   * Los listeners viven fuera de NgZone: dentro, cada cambio disparaba la detección
   * de cambios de TODA la aplicación. Solo se repinta este componente.
   */
  @ViewChild('heroCarousel')
  set heroCarousel(el: ElementRef<HTMLElement> | undefined) {
    this.carouselCleanup?.();
    this.carouselCleanup = undefined;
    if (!el) return;
    const node = el.nativeElement;

    this.zone.runOutsideAngular(() => {
      let startX = 0;
      let startY = 0;
      let tracking = false;
      // Angular renombra los keyframes del componente (_ngcontent-…_hero-progress): se reconoce
      // la barra por su elemento, no por el nombre exacto.
      const onEnd = (event: AnimationEvent) => {
        const target = event.target as Element;
        if (event.pseudoElement === '::after' && target.classList?.contains('hero-dot')) {
          this.showHero(this.currentHeroIndex + 1);
        }
      };
      const onVisibility = () => node.classList.toggle('is-paused', document.hidden);
      // Deslizar con el dedo (o lápiz); el mouse usa los puntos.
      const onDown = (event: PointerEvent) => {
        tracking = event.pointerType !== 'mouse';
        startX = event.clientX;
        startY = event.clientY;
      };
      const onUp = (event: PointerEvent) => {
        if (!tracking) return;
        tracking = false;
        const dx = event.clientX - startX;
        if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(event.clientY - startY)) {
          this.showHero(this.currentHeroIndex + (dx < 0 ? 1 : -1));
        }
      };
      const onCancel = () => { tracking = false; };

      node.addEventListener('animationend', onEnd);
      node.addEventListener('pointerdown', onDown);
      node.addEventListener('pointerup', onUp);
      node.addEventListener('pointercancel', onCancel);
      document.addEventListener('visibilitychange', onVisibility);
      this.carouselCleanup = () => {
        node.removeEventListener('animationend', onEnd);
        node.removeEventListener('pointerdown', onDown);
        node.removeEventListener('pointerup', onUp);
        node.removeEventListener('pointercancel', onCancel);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    });
  }

  setHeroIndex(idx: number) {
    this.showHero(idx);
  }

  private showHero(index: number) {
    const count = this.heroCharacters.length;
    if (!count) return;
    this.currentHeroIndex = (index + count) % count;
    this.cdr.detectChanges();
  }

  // ─── Imágenes ────────────────────────────────────────────────────────────────

  /**
   * Miniatura optimizada con la transformación de imágenes de Supabase, igual
   * que en catalog/book-list. Sin esto se descargaba el retrato a resolución
   * completa para pintarlo en una tarjeta de 200px.
   */
  thumb(url: string | null | undefined, width: number = 300): string {
    return portraitThumbnail(url, width);
  }

  /** Comprueba antes de reasignar: si no, una imagen rota reentra en bucle. */
  onImgError(event: Event, original?: string | null): void {
    const img = event.target as HTMLImageElement;
    if (original && img.src.includes('/storage/v1/render/image/public/')) {
      img.src = original;
    } else if (!img.src.endsWith(FALLBACK_AVATAR)) {
      img.src = FALLBACK_AVATAR;
    }
  }

  // ─── trackBy ─────────────────────────────────────────────────────────────────

  trackById(_: number, char: HubAvatar): string {
    return hubIdentity(char);
  }

  /** Sin la versión, una tarjeta repetida entre dos páginas saltaba de lugar sin animarse. */
  trackByResult = (_: number, char: HubAvatar): string => `${this.resultsVersion}:${hubIdentity(char)}`;

  trackByIndex(index: number): number {
    return index;
  }

  trackByTag(_: number, tag: string): string {
    return tag;
  }

  trackBySlug(_: number, genre: GenreOption): string {
    return genre.slug;
  }

  // ─── Navegación ──────────────────────────────────────────────────────────────

  /**
   * El chat se abre al instante en la ventana rápida, sin pasar por el lector (que descargaba
   * el libro entero). Si el libro no está en la biblioteca, la ventana ofrece agregarlo.
   */
  openChat(character: HubAvatar) {
    if (!character) return;
    if ((character.works?.length || 0) > 1) {
      const picker = this.dialog.open(this.bookPicker, {
        data: character, width: '480px', maxWidth: 'calc(100vw - 32px)',
        maxHeight: '80vh', ariaLabel: `Elegir libro de ${character.name}`,
      });
      this.subs.add(picker.afterClosed().subscribe((avatarId?: string) => {
        if (avatarId) this.characterChat.open(avatarId);
      }));
      return;
    }
    this.characterChat.open(character.id);
  }

  bookLabel(character: HubAvatar): string {
    return (character.book_count || 1) > 1
      ? `${character.book_count} libros · Elegir obra`
      : character.book_title || '';
  }

  /** Arriba, cada identidad sale una sola vez: recientes, carrusel y destacados. */
  private updateSections(): void {
    const recent = new Set(this.recentCharacters.map(hubIdentity));
    const hero = this.heroSource
      .filter(character => !!character.avatar_image_url && !recent.has(hubIdentity(character)))
      .slice(0, HERO_SLIDES);
    const shown = new Set([...recent, ...hero.map(hubIdentity)]);
    this.heroCharacters = hero.map(character => this.toSlide(character));
    this.featuredCharacters = this.stripSource.filter(character => !shown.has(hubIdentity(character)));
    this.currentHeroIndex %= this.heroCharacters.length || 1;
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────────

  private toSlide(char: HubAvatar): HeroSlide {
    const portrait = this.thumb(char.avatar_image_url, 800);
    return {
      ...char,
      excerpt: this.excerpt(char.description),
      portrait,
      background: `url(${portrait})`
    };
  }

  private excerpt(text: string | null | undefined, max: number = 120): string {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max)}...` : text;
  }

}
