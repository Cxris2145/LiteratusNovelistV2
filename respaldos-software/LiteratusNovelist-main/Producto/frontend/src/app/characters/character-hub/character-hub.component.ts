import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  inject
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Subscription, interval } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatService, HubAvatar } from '../../core/services/chat.service';

/** Retrato de respaldo mientras el personaje no tenga imagen generada. */
const FALLBACK_AVATAR = 'assets/images/default-avatar.svg';

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
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  readonly fallbackAvatar = FALLBACK_AVATAR;

  // Datos para las secciones
  allCharacters: HubAvatar[] = [];
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
        this.allCharacters = res.results;
        this.featuredCharacters = res.results.slice(0, 12);
        this.heroCharacters = this.shuffle(res.results).slice(0, 5).map(c => this.toSlide(c));
        this.hasMore = !!res.next;
        this.isLoading = false;
        this.cdr.markForCheck();
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
    if (this.isLoading || this.isLoadingMore || !this.hasMore || this.isSearching) return;

    this.isLoadingMore = true;
    this.cdr.markForCheck();

    this.subs.add(this.chatService.getGlobalAvatars('', 'popularity', this.page + 1).subscribe({
      next: (res) => {
        this.page += 1;
        this.allCharacters = [...this.allCharacters, ...res.results];
        this.hasMore = !!res.next;
        this.isLoadingMore = false;
        this.cdr.markForCheck();
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
        this.recentCharacters = data;
        this.cdr.markForCheck();
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
          this.filteredCharacters = res.results;
          this.isLoading = false;
          this.cdr.markForCheck();
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
    if (!url) return FALLBACK_AVATAR;
    if (url.includes('/storage/v1/object/public/')) {
      return url.replace('/object/public/', '/render/image/public/')
        + (url.includes('?') ? '&' : '?') + `width=${width}&quality=60&resize=cover`;
    }
    return url;
  }

  /** Comprueba antes de reasignar: si no, una imagen rota reentra en bucle. */
  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith(FALLBACK_AVATAR)) {
      img.src = FALLBACK_AVATAR;
    }
  }

  // ─── trackBy ─────────────────────────────────────────────────────────────────

  trackById(_: number, char: HubAvatar): string {
    return char.id;
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByTag(_: number, tag: string): string {
    return tag;
  }

  // ─── Navegación ──────────────────────────────────────────────────────────────

  openChat(character: HubAvatar) {
    if (!character) return;

    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/demo-chat', character.id]);
      return;
    }

    if (!character.book_slug) {
      this.router.navigate(['/demo-chat', character.id]);
      return;
    }

    // Verificar si el usuario ya posee el libro
    this.api.get<any>(`library/inventory/check/?slug=${character.book_slug}`).subscribe({
      next: (res: any) => {
        if (res.owned) {
          // Si lo tiene, ir al lector con el personaje pre-seleccionado
          this.router.navigate(['/reader', res.inventory_id], {
            queryParams: { chatWith: character.id }
          });
        } else {
          // Si no lo tiene, ir a la vista del libro (sinopsis)
          this.router.navigate(['/book', character.book_slug]);
        }
      },
      error: (err: any) => {
        console.error('Error verificando propiedad', err);
        // Fallback: ir a la sinopsis
        this.router.navigate(['/book', character.book_slug]);
      }
    });
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

  /** Fisher-Yates. El `sort(() => 0.5 - Math.random())` anterior estaba sesgado. */
  private shuffle<T>(items: T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
