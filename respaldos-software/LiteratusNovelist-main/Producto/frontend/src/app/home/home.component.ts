import { Component, OnInit, OnDestroy, AfterViewInit, PLATFORM_ID, Inject, inject, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';
import { Router } from '@angular/router';
import type { AnimationItem } from 'lottie-web';

export interface Book {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  is_featured: boolean;
  cover_image: string | null;
  tags?: { name: string; slug: string }[];
  price?: number;
  author_name?: string;
  ai_character_count?: number;
}

export interface DemoAvatar {
  id: number;
  name: string;
  description: string;
  avatar_image_url: string | null;
  chat_count: number;
  book_title?: string;
  book_slug?: string;
}

export interface GenreCount {
  id: string;
  name: string;
  slug: string;
  book_count: number;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy, AfterViewInit {
  private api = inject(ApiService);
  public auth = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private platformId = inject(PLATFORM_ID);
  private destroy$ = new Subject<void>();

  // ─── Libros ──────────────────────────────────────────────────────────────
  allBooks: Book[] = [];
  featuredBooks: Book[] = [];      // Curados (is_featured) — "Libros destacados"
  forYouBooks: Book[] = [];        // catalog/books/recommendations/ — "Para ti"
  featuredWithCharacters: any[] = []; // Libros con IA activa

  // Valor de reserva; se sobrescribe con el conteo real desde catalog/stats/
  totalBooksCount: number = 1854;

  // ─── Personajes IA ───────────────────────────────────────────────────────
  showcaseAvatars: DemoAvatar[] = [];
  avatarsLoading = false;

  // ─── Categorías ──────────────────────────────────────────────────────────
  genres: GenreCount[] = [];

  // ─── Continuar leyendo (solo usuarios logueados) ────────────────────────
  continueReadingItems: any[] = [];
  continueReadingLoading = false;

  @ViewChild('avatarsCarousel') avatarsCarousel!: ElementRef;

  private _readingContainer?: ElementRef;
  private readingAnimation?: AnimationItem;
  @ViewChild('readingContainer') set readingContainer(el: ElementRef) {
    if (el && !this._readingContainer && isPlatformBrowser(this.platformId)) {
      this._readingContainer = el;
      // Carga diferida: lottie-web no debe pesar en el bundle inicial.
      import('lottie-web').then(({ default: lottie }) => {
        if (this.destroy$.isStopped) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.readingAnimation = lottie.loadAnimation({
          container: el.nativeElement,
          renderer: 'svg',
          loop: false,
          autoplay: !reducedMotion,
          path: 'assets/lottie/magic.json'
        });
        if (reducedMotion) {
          this.readingAnimation.addEventListener('DOMLoaded', () => {
            this.readingAnimation?.goToAndStop(this.readingAnimation.totalFrames / 2, true);
          });
        }
      });
    }
  }

  isLoading = true;
  errorMsg = '';
  prefersReducedMotion = false;


  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.loadStats();
      this.loadBooks();
      this.loadAIBooks();
      this.loadShowcaseAvatars();
      this.loadGenres();
      if (this.auth.isLoggedIn()) {
        this.loadContinueReading();
      }
    }
  }

  ngAfterViewInit(): void {
    this.initRevealObserver();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.readingAnimation?.destroy();
  }

  /** Conteo real de libros del catálogo (se conecta a la base de datos). */
  private loadStats(): void {
    this.api.getCached<any>('catalog/stats/', undefined, 10 * 60 * 1000).subscribe({
      next: (res: any) => {
        if (res && typeof res.total_books === 'number') {
          this.totalBooksCount = res.total_books;
          const el = document.getElementById('stat-books');
          if (el) el.textContent = this.totalBooksCount.toLocaleString('es-CL');
          this.cdr.detectChanges();
        }
      },
      error: () => { /* se mantiene el valor de reserva */ }
    });
  }

  // ─── Categorías ──────────────────────────────────────────────────────────

  private loadGenres(): void {
    this.api.getCached<any>('catalog/genres/?page_size=100', undefined, 15 * 60 * 1000).subscribe({
      next: (res: any) => {
        const list: GenreCount[] = (res?.results ?? res ?? [])
          .map((g: any) => ({ id: g.id, name: g.name, slug: g.slug, book_count: g.book_count ?? 0 }))
          .filter((g: GenreCount) => g.book_count > 0)
          .sort((a: GenreCount, b: GenreCount) => b.book_count - a.book_count);
        this.genres = list.slice(0, 12);
        setTimeout(() => this.initRevealObserver(), 0);
      },
      error: () => { this.genres = []; }
    });
  }

  goToCategory(slug: string): void {
    this.router.navigate(['/categories', slug]);
  }

  // ─── Continuar leyendo ───────────────────────────────────────────────────

  private loadContinueReading(): void {
    this.continueReadingLoading = true;
    this.api.get<any[]>('library/inventory/').subscribe({
      next: (res: any) => {
        const items = Array.isArray(res) ? res : (res.results || []);
        this.continueReadingItems = items
          .map((item: any) => ({ ...item, coverThumb: this.thumbUrl(item.book_cover || item.edition?.book?.cover_image) }))
          .filter((item: any) => (item.progress?.completion_percentage || 0) > 0 && (item.progress?.completion_percentage || 0) < 100)
          .sort((a: any, b: any) => (b.progress?.completion_percentage || 0) - (a.progress?.completion_percentage || 0))
          .slice(0, 8);
        this.continueReadingLoading = false;
        setTimeout(() => this.initRevealObserver(), 0);
      },
      error: () => { this.continueReadingLoading = false; }
    });
  }

  private thumbUrl(url: string | null | undefined): string {
    if (!url) return 'assets/default_cover.jpg';
    if (url.includes('/storage/v1/object/public/')) {
      return url.replace('/object/public/', '/render/image/public/')
        + (url.includes('?') ? '&' : '?') + 'width=360&height=360&quality=62&resize=cover';
    }
    return url;
  }

  goToReader(inventoryId: string): void {
    this.router.navigate(['/reader', inventoryId]);
  }

  // ─── Avatar Showcase ─────────────────────────────────────────────────────

  private loadShowcaseAvatars(): void {
    this.avatarsLoading = true;
    this.api.get<any>('ai/hub/avatars/?sort=popularity').subscribe({
      next: (response: any) => {
        const avatars = Array.isArray(response) ? response : (response.results || []);
        this.showcaseAvatars = avatars.slice(0, 8);
        this.avatarsLoading = false;
      },
      error: () => { this.avatarsLoading = false; }
    });
  }

  goToCharactersHub(): void {
    this.router.navigate(['/characters']);
  }

  goToCharacterChat(avatar: DemoAvatar): void {
    if (!avatar) return;

    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/demo-chat', avatar.id]);
      return;
    }

    if (!avatar.book_slug) {
      this.router.navigate(['/demo-chat', avatar.id]);
      return;
    }

    this.api.get<any>(`library/inventory/check/?slug=${avatar.book_slug}`).subscribe({
      next: (res: any) => {
        if (res.owned) {
          this.router.navigate(['/reader', res.inventory_id], { queryParams: { chatWith: avatar.id } });
        } else {
          this.router.navigate(['/book', avatar.book_slug]);
        }
      },
      error: () => { this.router.navigate(['/book', avatar.book_slug]); }
    });
  }

  scrollCarousel(direction: number): void {
    if (this.avatarsCarousel) {
      const el = this.avatarsCarousel.nativeElement;
      el.scrollBy({ left: 320 * direction, behavior: 'smooth' });
    }
  }

  goToRegister(): void {
    this.router.navigate(['/register']);
  }

  goToTavern(): void {
    this.router.navigate(['/tavern']);
  }

  // ─── Reveal on scroll ────────────────────────────────────────────────────

  private initRevealObserver(): void {
    const revealObserver = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          revealObserver.unobserve(e.target);
        }
      }),
      { threshold: 0.05 }
    );
    document.querySelectorAll('.reveal-section:not(.visible)').forEach(el => revealObserver.observe(el));

    const statsEl = document.querySelector('.stats-section');
    if (statsEl) {
      const statsObserver = new IntersectionObserver(
        (entries) => entries.forEach(e => {
          if (e.isIntersecting) {
            this.animateCounters();
            statsObserver.unobserve(e.target);
          }
        }),
        { threshold: 0.3 }
      );
      statsObserver.observe(statsEl);
    }
  }

  private animateCounters(): void {
    const counters = [
      { id: 'stat-books', target: this.totalBooksCount },
      { id: 'stat-chars', target: 25 },
      { id: 'stat-convs', target: 150 },
      { id: 'stat-authors', target: 10 }
    ];
    if (this.prefersReducedMotion) {
      counters.forEach(({ id, target }) => {
        const el = document.getElementById(id);
        if (el) el.textContent = target.toLocaleString('es-CL');
      });
      return;
    }
    counters.forEach(({ id, target }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const duration = 1800;
      const start = performance.now();
      const update = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(ease * target).toLocaleString('es-CL');
        if (progress < 1) requestAnimationFrame(update);
      };
      requestAnimationFrame(update);
    });
  }

  goToCharBook(slug: string): void {
    this.router.navigate(['/book', slug]);
  }

  // ─── Carga de libros ─────────────────────────────────────────────────────

  private loadBooks(): void {
    this.isLoading = true;
    this.api.getCached<any>('catalog/books/?ordering=-is_featured,-created_at&page_size=50', undefined, 5 * 60 * 1000).subscribe({
      next: (response: any) => {
        if (this.destroy$.isStopped) return;
        this.allBooks = response.results || response;
        this.buildSections();
        this.isLoading = false;
        setTimeout(() => {
          if (this.destroy$.isStopped) return;
          this.initRevealObserver();
        }, 100);
      },
      error: (error) => {
        if (this.destroy$.isStopped) return;
        console.error('Error cargando libros', error);
        this.isLoading = false;
      }
    });

    this.api.get<any>('catalog/books/recommendations/').subscribe({
      next: (response) => {
        this.forYouBooks = response.results || response;
        setTimeout(() => {
          if (!this.destroy$.isStopped) {
            this.initRevealObserver();
          }
        }, 100);
      },
      error: () => { this.forYouBooks = []; }
    });
  }

  private loadAIBooks(): void {
    this.api.getCached<any>('catalog/books/?has_ai_avatars=true&ordering=-ai_character_count&page_size=10', undefined, 5 * 60 * 1000).subscribe({
      next: (response: any) => {
        if (this.destroy$.isStopped) return;
        const booksWithCharacters = response.results || response;
        this.featuredWithCharacters = booksWithCharacters.map((b: any) => ({
          slug: b.slug,
          title: b.title,
          author: b.author_name || 'Desconocido',
          cover: b.cover_image || 'assets/default_cover.jpg',
          genre: (b.genres && b.genres.length > 0) ? b.genres[0].name : 'Ficción',
          characterCount: b.ai_character_count || 0
        })).sort((a: any, b: any) => b.characterCount - a.characterCount);
        this.cdr.detectChanges();
        setTimeout(() => this.initRevealObserver(), 0);
      },
      error: (error) => { console.error('Error cargando libros con IA', error); }
    });
  }

  private buildSections(): void {
    this.featuredBooks = this.allBooks.filter(b => b.is_featured).slice(0, 20);
    if (this.featuredBooks.length === 0) {
      this.featuredBooks = this.allBooks.slice(0, 20);
    }
  }

  goToBook(slug: string): void {
    this.router.navigate(['/book', slug]);
  }

  trackBySlug(_: number, book: Book): string {
    return book.slug;
  }

  trackById(_: number, avatar: DemoAvatar): number {
    return avatar.id;
  }

  trackByGenreSlug(_: number, genre: GenreCount): string {
    return genre.slug;
  }

  trackByItemId(_: number, item: any): string {
    return item.id;
  }
}
