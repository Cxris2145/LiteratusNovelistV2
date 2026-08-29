import { Component, OnInit, OnDestroy, AfterViewInit, PLATFORM_ID, Inject, inject, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';
import { Router } from '@angular/router';
import lottie from 'lottie-web';

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

export interface DemoChatMessage {
  role: 'user' | 'assistant';
  content: string;
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

  // State
  allBooks: Book[] = [];
  trendingBooks: Book[] = [];
  recommendedBooks: Book[] = [];
  discoveryBooks: Book[] = [];
  randomDiscoveryBooks: Book[] = [];
  totalBooksCount: number = 1854;

  // Avatars showcase (from API)
  showcaseAvatars: DemoAvatar[] = [];
  avatarsLoading = false;

  // Demo Chat state
  demoMessages: DemoChatMessage[] = [
    { role: 'user', content: '¿Por qué luchas contra molinos?' },
    { role: 'assistant', content: 'Porque donde otros ven molinos, yo veo gigantes. El valor no reside en la victoria, sino en no bajar la espada.' }
  ];
  demoInput = '';
  demoSending = false;
  demoRemainingMessages = 3;
  demoChatLimitReached = false;
  demoAvatarName = 'Don Quijote';
  demoAvatarImage: string | null = null;

  // Libros con personajes IA activos (se carga dinámicamente)
  featuredWithCharacters: any[] = [];

  activeCharacterIndex = 0;
  private charCarouselInterval: any;

  @ViewChild('avatarsCarousel') avatarsCarousel!: ElementRef;

  private _readingContainer?: ElementRef;
  @ViewChild('readingContainer') set readingContainer(el: ElementRef) {
    if (el && !this._readingContainer) {
      this._readingContainer = el;
      lottie.loadAnimation({
        container: el.nativeElement,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'assets/lottie/magic.json'
      });
    }
  }

  private _saludoContainer?: ElementRef;
  @ViewChild('saludoContainer') set saludoContainer(el: ElementRef) {
    if (el && !this._saludoContainer) {
      this._saludoContainer = el;
      lottie.loadAnimation({
        container: el.nativeElement,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'assets/lottie/saludo.json'
      });
    }
  }

  isLoading = true;
  errorMsg = '';

  private scrollIntervals: any[] = [];

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadBooks();
      this.loadAIBooks();
      this.loadShowcaseAvatars();
    }
  }

  ngAfterViewInit(): void {
    this.initRevealObserver();
  }

  // ─── Avatar Showcase ─────────────────────────────────────────────────────────

  private loadShowcaseAvatars(): void {
    this.avatarsLoading = true;
    this.api.get<any>('ai/hub/avatars/?sort=popularity').subscribe({
      next: (response: any) => {
        const avatars = Array.isArray(response) ? response : (response.results || []);
        this.showcaseAvatars = avatars.slice(0, 8);
        this.avatarsLoading = false;
      },
      error: () => {
        this.avatarsLoading = false;
      }
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

    // Si está logueado, verificar propiedad
    this.api.get<any>(`library/inventory/check/?slug=${avatar.book_slug}`).subscribe({
      next: (res: any) => {
        if (res.owned) {
          // Va al lector con el chat IA abierto
          this.router.navigate(['/reader', res.inventory_id], { 
            queryParams: { chatWith: avatar.id } 
          });
        } else {
          // Va a la página del libro para adquirir it
          this.router.navigate(['/book', avatar.book_slug]);
        }
      },
      error: () => {
        // Fallback
        this.router.navigate(['/book', avatar.book_slug]);
      }
    });
  }

  scrollCarousel(direction: number): void {
    if (this.avatarsCarousel) {
      const el = this.avatarsCarousel.nativeElement;
      const scrollAmount = 320 * direction; // width of card (220px) + gap (24px) approx
      el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  }

  // ─── Demo Chat ───────────────────────────────────────────────────────────────

  sendDemoMessage(): void {
    const msg = this.demoInput.trim();
    if (!msg || this.demoSending || this.demoChatLimitReached) return;

    this.demoMessages.push({ role: 'user', content: msg });
    this.demoInput = '';
    this.demoSending = true;

    this.api.post<any>('ai/demo-chat/', { message: msg }).subscribe({
      next: (res: any) => {
        this.demoMessages.push({ role: 'assistant', content: res.reply });
        this.demoRemainingMessages = res.remaining_messages ?? 0;
        if (res.avatar_name) this.demoAvatarName = res.avatar_name;
        if (res.avatar_image) this.demoAvatarImage = res.avatar_image;
        if (this.demoRemainingMessages <= 0) {
          this.demoChatLimitReached = true;
        }
        this.demoSending = false;
        setTimeout(() => this.scrollDemoToBottom(), 50);
      },
      error: (err: any) => {
        const errData = err?.error;
        if (errData?.error === 'DEMO_LIMIT_REACHED') {
          this.demoChatLimitReached = true;
          this.demoRemainingMessages = 0;
          this.demoMessages.push({
            role: 'assistant',
            content: errData.message || 'Has alcanzado el límite de mensajes de prueba. ¡Regístrate para continuar!'
          });
        } else {
          this.demoMessages.push({
            role: 'assistant',
            content: 'El viento sopla fuerte hoy y mi conexión es débil. Intenta de nuevo en un momento.'
          });
        }
        this.demoSending = false;
        setTimeout(() => this.scrollDemoToBottom(), 50);
      }
    });
  }

  onDemoKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendDemoMessage();
    }
  }

  private scrollDemoToBottom(): void {
    const el = document.querySelector('.demo-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  goToRegister(): void {
    this.router.navigate(['/register']);
  }

  // ─── Existing logic ───────────────────────────────────────────────────────────

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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.scrollIntervals.forEach(interval => clearInterval(interval));
    if (this.charCarouselInterval) clearInterval(this.charCarouselInterval);
  }

  goToCharBook(slug: string): void {
    this.router.navigate(['/book', slug]);
  }

  setCharacterSlide(index: number): void {
    this.activeCharacterIndex = index;
  }

  private loadBooks(): void {
    this.isLoading = true;
    this.api.get<any>('catalog/books/?ordering=-is_featured,-created_at&page_size=50').subscribe({
      next: (response: any) => {
        if (this.destroy$.isStopped) {
          return;
        }
        this.allBooks = response.results || response;
        this.buildSections();
        this.isLoading = false;
        setTimeout(() => {
          if (this.destroy$.isStopped) return;
          this.initAutoScroll();
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
        this.recommendedBooks = response.results || response;
        setTimeout(() => {
          if (!this.destroy$.isStopped) {
            this.initRevealObserver();
            this.initAutoScroll();
          }
        }, 100);
      },
      error: () => {
        // Fallback silently if recommendations fail
        this.recommendedBooks = [];
      }
    });
  }

  private loadAIBooks(): void {
    this.api.get<any>('catalog/books/?has_ai_avatars=true&ordering=-ai_character_count&page_size=10').subscribe({
      next: (response: any) => {
        if (this.destroy$.isStopped) return;
        const booksWithCharacters = response.results || response;
        console.log("AI Books Response:", booksWithCharacters);
        this.featuredWithCharacters = booksWithCharacters.map((b: any) => ({
          slug: b.slug,
          title: b.title,
          author: b.author_name || 'Desconocido',
          cover: b.cover_image || 'assets/default_cover.jpg',
          genre: (b.genres && b.genres.length > 0) ? b.genres[0].name : 'Ficción',
          characterCount: b.ai_character_count || 0
        })).sort((a: any, b: any) => b.characterCount - a.characterCount);
        console.log("Mapped featuredWithCharacters:", this.featuredWithCharacters);
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error cargando libros con IA', error);
      }
    });
  }

  private initAutoScroll(): void {
    const tracks = document.querySelectorAll('.trending-track:not(.scroll-init), .recommended-track:not(.scroll-init)');
    tracks.forEach((track: any) => {
      track.classList.add('scroll-init');
      let isInteracting = false;

      track.addEventListener('mouseenter', () => isInteracting = true);
      track.addEventListener('mouseleave', () => isInteracting = false);
      track.addEventListener('touchstart', () => isInteracting = true, { passive: true });
      track.addEventListener('touchend', () => { setTimeout(() => isInteracting = false, 2000); }, { passive: true });

      const interval = setInterval(() => {
        if (!isInteracting) {
          const cardWidth = track.firstElementChild ? track.firstElementChild.clientWidth + 24 : 250;
          if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 10) {
            track.scrollTo({ left: 0, behavior: 'smooth' });
          } else {
            track.scrollBy({ left: cardWidth, behavior: 'smooth' });
          }
        }
      }, 4000);

      this.scrollIntervals.push(interval);
    });
  }

  private buildSections(): void {
    this.trendingBooks = this.allBooks.filter(b => b.is_featured).slice(0, 20);
    if (this.trendingBooks.length === 0) {
      this.trendingBooks = this.allBooks.slice(0, 20);
    }

    const trendingSlugs = new Set(this.trendingBooks.map(b => b.slug));
    this.discoveryBooks = this.allBooks.filter(b => !trendingSlugs.has(b.slug));
    this.randomDiscoveryBooks = [...this.allBooks].sort(() => 0.5 - Math.random());
  }

  scrollToCatalog(): void {
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
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
}
