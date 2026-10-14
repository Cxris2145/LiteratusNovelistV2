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
import { Subject, Subscription, interval } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { ApiService } from '../../core/services/api.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { ScrollRevealService } from '../../core/services/scroll-reveal.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatService, HubAvatar } from '../../core/services/chat.service';

/** Retrato de respaldo mientras el personaje no tenga imagen generada. */
import { FALLBACK_AVATAR, hubIdentity, portraitThumbnail, uniqueCharacters } from './character-hub.util';

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

  // Datos para las secciones
  allCharacters: HubAvatar[] = [];
  catalogCharacters: HubAvatar[] = [];
  heroCharacters: HeroSlide[] = [];
  featuredCharacters: HubAvatar[] = [];
  recentCharacters: HubAvatar[] = [];
  filteredCharacters: HubAvatar[] = [];

  isLoading = true;
  isLoadingMore = false;
  searchQuery = '';
  isSearching = false;

  /** Total de personajes del catálogo, según el `count` del backend. */
  totalCount = 0;

  // Control del Carrusel Hero
  currentHeroIndex = 0;
  private carouselSub?: Subscription;

  // Paginación del grid "Todos los Personajes"
  private page = 1;
  private hasMore = true;

  // Paginación de la búsqueda (antes solo se veía la primera página de resultados)
  private searchPage = 1;
  private searchHasMore = false;
  searchTotal = 0;

  private readonly search$ = new Subject<string>();
  private readonly subs = new Subscription();

  // Skeleton
  skeletonArray = Array(6).fill(0);

  ngOnInit() {
    this.loadFirstPage();
    this.loadRecent();
    this.initSearch();
    this.startHeroCarousel();
  }

  ngOnDestroy() {
    this.carouselSub?.unsubscribe();
    this.subs.unsubscribe();
    this.observer?.disconnect();
  }

  // ─── Carga de datos ──────────────────────────────────────────────────────────

  private loadFirstPage() {
    this.isLoading = true;
    this.page = 1;

    this.subs.add(this.chatService.getGlobalAvatars('', 'popularity', 1).subscribe({
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

    this.subs.add(this.chatService.getGlobalAvatars('', 'popularity', this.page + 1).subscribe({
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
    const q = this.searchQuery.trim();
    if (!q || this.isLoading || this.isLoadingMore || !this.searchHasMore) return;
    this.isLoadingMore = true;
    this.cdr.markForCheck();
    this.subs.add(this.chatService.getGlobalAvatars(q, 'name', this.searchPage + 1).subscribe({
      next: (res) => {
        this.isLoadingMore = false;
        if (this.searchQuery.trim() !== q) return; // la búsqueda cambió mientras cargaba
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

  // ─── Búsqueda ────────────────────────────────────────────────────────────────

  /**
   * `switchMap` cancela la petición anterior en cuanto llega otra pulsación: sin
   * él ganaba la última respuesta en llegar, no la última pedida, y los
   * resultados podían corresponder a un texto ya borrado.
   */
  private initSearch() {
    this.subs.add(
      this.search$.pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap((q) => {
          this.isLoading = true;
          this.cdr.markForCheck();
          return this.chatService.getGlobalAvatars(q, 'name', 1);
        })
      ).subscribe({
        next: (res) => {
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

  onSearchChange() {
    const q = this.searchQuery.trim();

    if (!q) {
      this.isSearching = false;
      this.isLoading = false;
      this.filteredCharacters = [];
      this.cdr.markForCheck();
      return;
    }

    this.isSearching = true;
    this.search$.next(q);
  }

  // ─── Carrusel ────────────────────────────────────────────────────────────────

  /**
   * El intervalo vive fuera de NgZone: dentro, cada tick disparaba un ciclo de
   * detección de cambios de TODA la aplicación cada 5 segundos. Ahora solo se
   * repinta este componente.
   */
  private startHeroCarousel() {
    this.zone.runOutsideAngular(() => {
      this.carouselSub = interval(5000).subscribe(() => {
        if (this.heroCharacters.length === 0) return;
        this.currentHeroIndex = (this.currentHeroIndex + 1) % this.heroCharacters.length;
        this.cdr.detectChanges();
      });
    });
  }

  setHeroIndex(idx: number) {
    this.currentHeroIndex = idx;
    // Reiniciar intervalo si el usuario interactúa
    this.carouselSub?.unsubscribe();
    this.startHeroCarousel();
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

  private updateSections(): void {
    const recent = new Set(this.recentCharacters.map(hubIdentity));
    const available = this.allCharacters.filter(character => !recent.has(hubIdentity(character)));
    this.featuredCharacters = available.slice(0, 12);
    this.heroCharacters = available.slice(12, 17).map(character => this.toSlide(character));
    this.catalogCharacters = available.slice(17);
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
