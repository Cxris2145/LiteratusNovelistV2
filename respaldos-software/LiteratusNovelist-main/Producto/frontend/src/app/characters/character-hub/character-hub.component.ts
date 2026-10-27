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
import { EMPTY, Subject, Subscription, timer } from 'rxjs';
import { debounce, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { ApiService } from '../../core/services/api.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { ScrollRevealService } from '../../core/services/scroll-reveal.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatService, HUB_PAGE_SIZE, HubAvatar, HubSearchField, HubSort } from '../../core/services/chat.service';

/** Retrato de respaldo mientras el personaje no tenga imagen generada. */
import { FALLBACK_AVATAR, hubIdentity, portraitThumbnail, segmentClip, uniqueCharacters } from './character-hub.util';

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

/** Lo que pide una búsqueda. `immediate`: un filtro tocado no espera como el texto. */
interface HubQuery {
  q: string;
  field: HubSearchField;
  sort: ListSort;
  withPhoto: boolean;
  immediate?: boolean;
}

/** Diapositivas del carrusel: se piden algunas de más por si el lector ya habló con ellas. */
const HERO_SLIDES = 6;
const HERO_REQUEST = 10;
/** Desplazamiento horizontal mínimo para que un deslizamiento cambie de diapositiva. */
const SWIPE_MIN = 40;

/** El campo solo cuenta si hay texto: sin él, cambiar "Buscar en" no cambia los resultados. */
function queryKey(query: HubQuery | null): string {
  if (!query) return '';
  return [query.q, query.q ? query.field : '', query.sort, query.withPhoto].join('|');
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

  readonly fallbackAvatar = FALLBACK_AVATAR;

  readonly searchFields: { value: HubSearchField; label: string }[] = [
    { value: 'all', label: 'Todo' },
    { value: 'name', label: 'Nombre' },
    { value: 'book', label: 'Libro' },
    { value: 'author', label: 'Autor' },
  ];
  readonly sortOptions: { value: ListSort; label: string }[] = [
    { value: 'featured', label: 'Destacados' },
    { value: 'popularity', label: 'Más populares' },
    { value: 'name', label: 'A–Z' },
  ];
  private readonly placeholders: Record<HubSearchField, string> = {
    all: 'Busca personajes, libros o autores...',
    name: 'Nombre del personaje...',
    book: 'Título del libro...',
    author: 'Nombre del autor...',
  };

  // Datos para las secciones
  allCharacters: HubAvatar[] = [];
  catalogCharacters: HubAvatar[] = [];
  heroCharacters: HeroSlide[] = [];
  featuredCharacters: HubAvatar[] = [];
  recentCharacters: HubAvatar[] = [];
  filteredCharacters: HubAvatar[] = [];
  /** Selección del día con retrato, tal como llega; updateSections descarta los recientes. */
  private heroSource: HubAvatar[] = [];

  isLoading = true;
  isHeroLoading = true;
  isLoadingMore = false;
  /** Hay texto o algún filtro distinto del predeterminado: se muestra la grilla de resultados. */
  isSearching = false;

  // Filtros
  searchQuery = '';
  searchField: HubSearchField = 'all';
  sort: ListSort = 'featured';
  withPhoto = false;

  /** Total de personajes del catálogo, según el `count` del backend. */
  totalCount = 0;

  // Control del Carrusel Hero
  currentHeroIndex = 0;

  // Paginación del grid "Todos los Personajes"
  private page = 1;
  private hasMore = true;

  // Paginación de la búsqueda (antes solo se veía la primera página de resultados)
  private activeQuery: HubQuery | null = null;
  private searchPage = 1;
  private searchHasMore = false;
  searchTotal = 0;
  /** Las tarjetas escalonan su entrada dentro de cada página. */
  readonly pageSize = HUB_PAGE_SIZE;
  /** Cambia con cada búsqueda nueva: las tarjetas se montan de nuevo y entran todas parejas. */
  private resultsVersion = 0;

  /** `null` vuelve a las secciones: corta la petición en curso y reinicia distinctUntilChanged. */
  private readonly search$ = new Subject<HubQuery | null>();
  private readonly subs = new Subscription();

  // Skeleton
  skeletonArray = Array(6).fill(0);

  ngOnInit() {
    this.loadFirstPage();
    this.loadHero();
    this.loadRecent();
    this.initSearch();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.observer?.disconnect();
    this.carouselCleanup?.();
  }

  // ─── Carga de datos ──────────────────────────────────────────────────────────

  private loadFirstPage() {
    this.isLoading = true;
    this.page = 1;

    this.subs.add(this.chatService.getGlobalAvatars('', 'featured', 1).subscribe({
      next: (res) => {
        this.totalCount = res.count;
        this.allCharacters = uniqueCharacters(res.results);
        this.updateSections();
        this.hasMore = !!res.next;
        this.isLoading = false;
        this.cdr.markForCheck();
        this.scrollReveal.debouncedScan();
      },
      error: () => {
        this.isLoading = false;
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

  /**
   * Trae la siguiente página del catálogo y la concatena. Así el hub sigue dando
   * acceso a los ~4.500 personajes completos, pero repartidos en peticiones que
   * el navegador puede digerir.
   */
  loadMore() {
    if (this.isSearching) {
      this.loadMoreResults();
      return;
    }
    if (this.isLoading || this.isLoadingMore || !this.hasMore) return;

    this.isLoadingMore = true;
    this.cdr.markForCheck();

    this.subs.add(this.chatService.getGlobalAvatars('', 'featured', this.page + 1).subscribe({
      next: (res) => {
        this.page += 1;
        this.allCharacters = uniqueCharacters([...this.allCharacters, ...res.results]);
        this.updateSections();
        this.hasMore = !!res.next;
        this.isLoadingMore = false;
        this.cdr.markForCheck();
        this.scrollReveal.debouncedScan();
      },
      error: () => {
        this.isLoadingMore = false;
        this.cdr.markForCheck();
      }
    }));
  }

  /** Siguiente página de la búsqueda, con el mismo scroll infinito del listado general. */
  private loadMoreResults() {
    const query = this.activeQuery;
    if (!query || this.isLoading || this.isLoadingMore || !this.searchHasMore) return;
    this.isLoadingMore = true;
    this.cdr.markForCheck();
    this.subs.add(this.fetchResults(query, this.searchPage + 1).subscribe({
      next: (res) => {
        this.isLoadingMore = false;
        if (this.activeQuery !== query) return; // la búsqueda cambió mientras cargaba
        this.searchPage += 1;
        this.filteredCharacters = uniqueCharacters([...this.filteredCharacters, ...res.results]);
        this.searchHasMore = !!res.next;
        this.cdr.markForCheck();
        this.scrollReveal.debouncedScan();
      },
      error: () => {
        this.isLoadingMore = false;
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

  // ─── Búsqueda y filtros ──────────────────────────────────────────────────────

  get placeholder(): string {
    return this.placeholders[this.searchField];
  }

  get hasActiveFilters(): boolean {
    return this.searchField !== 'all' || this.sort !== 'featured' || this.withPhoto;
  }

  get sortLabel(): string {
    return this.sortOptions.find(option => option.value === this.sort)?.label ?? '';
  }

  /** Recorte de la copia activa de cada control segmentado (receta "tab indicator"). */
  get fieldClip(): string {
    return segmentClip(this.searchFields.findIndex(option => option.value === this.searchField), this.searchFields.length);
  }

  get sortClip(): string {
    return segmentClip(this.sortOptions.findIndex(option => option.value === this.sort), this.sortOptions.length);
  }

  /**
   * `switchMap` cancela la petición anterior en cuanto llega otra pulsación: sin
   * él ganaba la última respuesta en llegar, no la última pedida, y los
   * resultados podían corresponder a un texto ya borrado.
   */
  private initSearch() {
    this.subs.add(
      this.search$.pipe(
        debounce((query) => timer(query && !query.immediate ? 400 : 0)),
        distinctUntilChanged((a, b) => queryKey(a) === queryKey(b)),
        switchMap((query) => {
          this.activeQuery = query;
          if (!query) return EMPTY;
          this.isLoading = true;
          this.cdr.markForCheck();
          return this.fetchResults(query, 1);
        })
      ).subscribe({
        next: (res) => {
          this.resultsVersion += 1;
          this.filteredCharacters = uniqueCharacters(res.results);
          this.searchPage = 1;
          this.searchHasMore = !!res.next;
          this.searchTotal = res.count;
          this.isLoading = false;
          this.cdr.markForCheck();
          this.scrollReveal.debouncedScan();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      })
    );
  }

  private fetchResults(query: HubQuery, page: number) {
    return this.chatService.getGlobalAvatars(query.q, query.sort, page, HUB_PAGE_SIZE,
      { field: query.field, withPhoto: query.withPhoto });
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

  toggleWithPhoto() {
    this.withPhoto = !this.withPhoto;
    this.refreshResults(true);
  }

  clearFilters() {
    this.searchQuery = '';
    this.searchField = 'all';
    this.sort = 'featured';
    this.withPhoto = false;
    this.refreshResults(true);
  }

  private refreshResults(immediate: boolean) {
    const q = this.searchQuery.trim();
    this.isSearching = !!q || this.sort !== 'featured' || this.withPhoto;

    if (!this.isSearching) {
      this.isLoading = false;
      this.filteredCharacters = [];
      this.search$.next(null);
      this.cdr.markForCheck();
      this.scrollReveal.debouncedScan();
      return;
    }

    this.search$.next({ q, field: this.searchField, sort: this.sort, withPhoto: this.withPhoto, immediate });
    this.cdr.markForCheck();
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

  // ─── Scroll infinito ─────────────────────────────────────────────────────────

  private observer?: IntersectionObserver;

  /**
   * El centinela vive dentro de un *ngIf, así que se observa desde el setter del
   * ViewChild en vez de en ngAfterViewInit: aparece y desaparece al alternar
   * entre el grid y los resultados de búsqueda.
   */
  @ViewChild('scrollSentinel')
  set scrollSentinel(el: ElementRef<HTMLElement> | undefined) {
    this.observer?.disconnect();
    if (!el) return;

    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries.some(e => e.isIntersecting)) {
            this.zone.run(() => this.loadMore());
          }
        },
        { rootMargin: '600px' }
      );
      this.observer.observe(el.nativeElement);
    });
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

  /** Sin la versión, una tarjeta repetida entre dos búsquedas saltaba de lugar sin animarse. */
  trackByResult = (_: number, char: HubAvatar): string => `${this.resultsVersion}:${hubIdentity(char)}`;

  trackByIndex(index: number): number {
    return index;
  }

  trackByTag(_: number, tag: string): string {
    return tag;
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

  /** Cada identidad sale una sola vez: recientes, carrusel, destacados y el resto. */
  private updateSections(): void {
    const recent = new Set(this.recentCharacters.map(hubIdentity));
    const hero = this.heroSource
      .filter(character => !!character.avatar_image_url && !recent.has(hubIdentity(character)))
      .slice(0, HERO_SLIDES);
    const shown = new Set([...recent, ...hero.map(hubIdentity)]);
    const available = this.allCharacters.filter(character => !shown.has(hubIdentity(character)));
    this.heroCharacters = hero.map(character => this.toSlide(character));
    this.featuredCharacters = available.slice(0, 12);
    this.catalogCharacters = available.slice(12);
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
