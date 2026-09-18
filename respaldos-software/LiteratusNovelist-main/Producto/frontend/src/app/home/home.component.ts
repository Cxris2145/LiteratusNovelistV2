import { Component, OnInit, OnDestroy, AfterViewInit, PLATFORM_ID, inject, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import type { AnimationItem } from 'lottie-web';

import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';
import { GamificationService } from '../core/services/gamification.service';
import { AchievementsService } from '../core/services/achievements.service';
import { ChatService } from '../core/services/chat.service';
import { FavoritesService } from '../core/services/favorites.service';
import { getBookPages } from '../core/utils/book-pages.util';

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
  page_count?: number | null;
  word_count?: number;
  genres?: { id: string; name: string; slug: string }[];
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

export interface MoodOption {
  id: string;
  label: string;
  icon: string;
  subtitle: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy, AfterViewInit {
  private api = inject(ApiService);
  public auth = inject(AuthService);
  private gamification = inject(GamificationService);
  private achievementsService = inject(AchievementsService);
  private chatService = inject(ChatService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private platformId = inject(PLATFORM_ID);
  private sanitizer = inject(DomSanitizer);
  private destroy$ = new Subject<void>();

  // Utilidades
  getBookPages = getBookPages;

  public favoritesService = inject(FavoritesService, { optional: true });

  // ─── Libros y Catálogo ───────────────────────────────────────────────────
  allBooks: Book[] = [];
  featuredBooks: Book[] = [];          // Curados (is_featured)
  forYouBooks: Book[] = [];            // catalog/books/recommendations/
  featuredWithCharacters: any[] = []; // Libros con IA activa
  heroBook: Book | null = null;
  heroBooks: Book[] = [];
  heroCoverFailed = false;
  heroBookIndex = 0;
  totalBooksCount: number = 1854;

  // ─── Gran Catálogo de Libros y Filtros Reactivos ─────────────────────────
  catalogSearchTerm: string = '';
  activeQuickFilter: 'all' | 'featured' | 'ai' | 'short' | 'popular' = 'all';
  activeGenreSlug: string | null = null;
  catalogViewMode: 'shelves' | 'grid' = 'shelves';
  filteredCatalogBooks: Book[] = [];
  immortalClassics: Book[] = [];
  livingAIBooks: any[] = [];
  quickReads: Book[] = [];
  popularTreasures: Book[] = [];

  // ─── Gran Escenario 3D (El Gran Atril) ──────────────────────────────────
  heroTiltX: number = 0;
  heroTiltY: number = 0;
  isHeroHovered: boolean = false;
  private heroAutoRotateTimer: any = null;

  // ─── Modal Interactivo 3D "Libro Abierto" (Quick View) ───────────────────
  selectedQuickViewBook: Book | null = null;
  quickViewTab: 'synopsis' | 'ai' | 'details' = 'synopsis';

  // ─── Personajes IA y Personaje del Día ───────────────────────────────────
  showcaseAvatars: DemoAvatar[] = [];
  avatarsLoading = false;
  characterOfTheDay: DemoAvatar | null = null;
  characterQuote: string = '';

  private readonly characterQuotesMap: Record<string, string> = {
    'Capitán Nemo': 'El mar no pertenece a los déspotas. En su superficie rigen leyes inicuas, pero a treinta pies de profundidad su poder se desvanece.',
    'Sócrates': 'Una vida sin examen no merece la pena ser vivida.',
    'Alicia': '¡Es inútil volver al ayer, porque entonces era una persona diferente!',
    'Sherlock Holmes': 'Cuando has eliminado lo imposible, lo que queda, por improbable que parezca, debe ser la verdad.',
    'Dante Alighieri': 'En medio del camino de nuestra vida, me encontré en una selva oscura donde la recta vía era perdida.',
    'Don Quijote': 'La libertad, Sancho, es uno de los más preciosos dones que a los hombres dieron los cielos.',
    'El Gato con Botas': 'Un poco de ingenio y unas buenas botas valen más que cien títulos nobiliarios.',
    'Ellen': 'En el vaivén de las olas de la ciudad flotante, el destino siempre guarda una sorpresa inesperada.',
    'El Fiel Devoto': 'La lealtad no se proclama con palabras vanas, sino con la perseverancia del alma en silencio.'
  };

  // ─── Mascota Interactiva ─────────────────────────────────────────────────
  mascotTipIndex = 0;
  mascotTips: string[] = [
    'Tú eliges el libro. Yo te acompaño al otro lado.',
    'Los personajes también tienen algo que contarte. Acércate a conversar con ellos.',
    'Cada mente lee distinto. Prueba los modos de lectura asistida y encuentra el tuyo.',
    'La Taberna es una pausa entre aventuras: descubre sus retos de lectura.'
  ];
  currentMascotTip: string = this.mascotTips[0];

  // ─── Selector Sensorial: "¿Qué quieres leer hoy?" ────────────────────────
  moodOptions: MoodOption[] = [
    { id: 'all', label: 'Todos', icon: 'auto_stories', subtitle: 'Exploración abierta' },
    { id: 'quick', label: 'Lecturas breves', icon: 'bolt', subtitle: '< 20 páginas' },
    { id: 'ai', label: 'Con Personajes IA', icon: 'psychology', subtitle: 'Diálogos vivos' },
    { id: 'adventure', label: 'Aventuras y Viajes', icon: 'explore', subtitle: 'Acción épica' },
    { id: 'philosophy', label: 'Filosofía y Mente', icon: 'menu_book', subtitle: 'Reflexión profunda' },
    { id: 'drama', label: 'Teatro y Pasión', icon: 'theater_comedy', subtitle: 'Clásicos universales' }
  ];
  selectedMood: string = 'all';
  filteredMoodBooks: Book[] = [];

  // ─── Simulador de Lectura Asistida & Neurodivergencia ────────────────────
  assistiveMode: 'normal' | 'focus' | 'bionic' | 'dyslexia' = 'normal';
  isAudioPlaying = false;
  audioProgress = 0;
  private audioInterval: any;

  sampleParagraph1 = 'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor.';
  sampleParagraph2 = 'Una olla de algo más vaca que carnero, salpicón las más noches, duelos y quebrantos los sábados, lantejas los viernes, algún palomino de añadidura los domingos, consumían las tres partes de su hacienda.';

  bionicHtml1: SafeHtml = '';
  bionicHtml2: SafeHtml = '';

  // ─── Gamificación & Perfil Personal (Usuarios logueados) ─────────────────
  userProfile: any = null;
  greetingText: string = 'Bienvenido';
  userLevel = 1;
  userLevelTitle = 'Lector Curioso';
  userXp = 0;
  nextLevelXp = 100;
  xpPercent = 25;
  userStreak = 0;
  userInkBalance = 50;
  activeMission: any = null;
  userAchievements: any[] = [];

  // ─── La Taberna: Cofres y Perks ──────────────────────────────────────────
  tavernChests = [
    { title: 'Cofre de Aprendiz', ink: 500, price: '$2.000', icon: 'redeem', tag: 'Comienzo', color: '#A3C9A7' },
    { title: 'Cofre de Erudito', ink: 1500, price: '$5.000', icon: 'auto_awesome', tag: 'Popular', color: '#FFB353' },
    { title: 'Cofre de Maestro', ink: 5000, price: '$14.990', icon: 'military_tech', tag: 'Coleccionista', color: '#FF6E4A' }
  ];

  // ─── Categorías ──────────────────────────────────────────────────────────
  genres: GenreCount[] = [];
  get categories(): GenreCount[] {
    return this.genres;
  }

  // ─── Continuar leyendo ───────────────────────────────────────────────────
  continueReadingItems: any[] = [];
  continueReadingLoading = false;

  // ─── Estados y Animaciones ───────────────────────────────────────────────
  isLoading = true;
  prefersReducedMotion = false;
  @ViewChild('avatarsCarousel') avatarsCarousel!: ElementRef;

  private _readingContainer?: ElementRef;
  private readingAnimation?: AnimationItem;
  @ViewChild('readingContainer') set readingContainer(el: ElementRef) {
    if (el && !this._readingContainer && isPlatformBrowser(this.platformId)) {
      this._readingContainer = el;
      import('lottie-web').then(({ default: lottie }) => {
        if (this.destroy$.isStopped) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.readingAnimation = lottie.loadAnimation({
          container: el.nativeElement,
          renderer: 'svg',
          loop: false,
          autoplay: !reduced,
          path: 'assets/lottie/magic.json'
        });
        if (reduced) {
          this.readingAnimation.addEventListener('DOMLoaded', () => {
            this.readingAnimation?.goToAndStop(this.readingAnimation.totalFrames / 2, true);
          });
        }
      });
    }
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.calculateGreeting();
      this.initBionicSample();
      this.loadStats();
      this.loadBooks();
      this.loadAIBooks();
      this.loadShowcaseAvatars();
      this.loadGenres();

      if (this.auth.isLoggedIn()) {
        this.loadContinueReading();
        this.loadUserProfileAndGamification();
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
    this.stopHeroAutoRotate();
    if (this.audioInterval) clearInterval(this.audioInterval);
  }

  // ─── Saludo y Tips de la Mascota ─────────────────────────────────────────
  private calculateGreeting(): void {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      this.greetingText = 'Buenos días';
    } else if (hour >= 12 && hour < 20) {
      this.greetingText = 'Buenas tardes';
    } else {
      this.greetingText = 'Buenas noches';
    }
  }

  cycleMascotTip(): void {
    this.mascotTipIndex = (this.mascotTipIndex + 1) % this.mascotTips.length;
    this.currentMascotTip = this.mascotTips[this.mascotTipIndex];
    if (!this.prefersReducedMotion) this.readingAnimation?.goToAndPlay(0, true);
    this.cdr.detectChanges();
  }

  nextHeroBook(): void {
    if (this.heroBooks.length < 2) return;
    this.heroBookIndex = (this.heroBookIndex + 1) % this.heroBooks.length;
    this.heroCoverFailed = false;
    this.heroBook = this.heroBooks[this.heroBookIndex];
    this.cdr.detectChanges();
  }

  prevHeroBook(): void {
    if (this.heroBooks.length < 2) return;
    this.heroBookIndex = (this.heroBookIndex - 1 + this.heroBooks.length) % this.heroBooks.length;
    this.heroCoverFailed = false;
    this.heroBook = this.heroBooks[this.heroBookIndex];
    this.cdr.detectChanges();
  }

  selectHeroBook(index: number): void {
    if (index >= 0 && index < this.heroBooks.length) {
      this.heroBookIndex = index;
      this.heroCoverFailed = false;
      this.heroBook = this.heroBooks[index];
      this.cdr.detectChanges();
    }
  }

  onHeroMouseMove(event: MouseEvent, stageEl: HTMLElement): void {
    if (this.prefersReducedMotion) return;
    const rect = stageEl.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    this.heroTiltX = -((y / (rect.height / 2)) * 14);
    this.heroTiltY = ((x / (rect.width / 2)) * 16);
  }

  onHeroMouseEnter(): void {
    this.isHeroHovered = true;
  }

  onHeroMouseLeave(): void {
    this.isHeroHovered = false;
    this.heroTiltX = 0;
    this.heroTiltY = 0;
  }

  startHeroAutoRotate(): void {
    if (this.prefersReducedMotion || !isPlatformBrowser(this.platformId)) return;
    this.stopHeroAutoRotate();
    this.heroAutoRotateTimer = setInterval(() => {
      if (!this.isHeroHovered && this.heroBooks.length > 1) {
        this.nextHeroBook();
      }
    }, 6500);
  }

  stopHeroAutoRotate(): void {
    if (this.heroAutoRotateTimer) {
      clearInterval(this.heroAutoRotateTimer);
      this.heroAutoRotateTimer = null;
    }
  }

  // ─── Gamificación y Perfil ───────────────────────────────────────────────
  private loadUserProfileAndGamification(): void {
    this.api.get<any>('users/profile/').subscribe({
      next: (profile: any) => {
        if (!profile) return;
        this.userProfile = profile;
        this.userInkBalance = profile.ink_balance ?? 50;
        this.userLevel = profile.level ?? 1;
        this.userXp = profile.xp ?? 0;
        this.userStreak = profile.streak_current ?? 0;
        this.userLevelTitle = this.getLevelTitle(this.userLevel);
        this.nextLevelXp = this.userLevel * 100;
        this.xpPercent = Math.min(100, Math.round((this.userXp % 100)));
        this.chatService.updateInkBalance(this.userInkBalance);
        this.cdr.detectChanges();
      },
      error: () => { /* conserva fallback */ }
    });

    this.api.get<any[]>('library/missions/').subscribe({
      next: (res: any) => {
        const missions = Array.isArray(res) ? res : (res?.results || []);
        this.activeMission = missions.find((m: any) => !m.completed_at) || missions[0] || null;
        this.cdr.detectChanges();
      },
      error: () => { this.activeMission = null; }
    });

    this.api.get<any[]>('library/achievements/me/').subscribe({
      next: (res: any) => {
        const achs = Array.isArray(res) ? res : (res?.results || []);
        this.userAchievements = achs.slice(0, 4);
        this.cdr.detectChanges();
      },
      error: () => { this.userAchievements = []; }
    });
  }

  private getLevelTitle(level: number): string {
    if (level >= 10) return 'Archimago de las Letras';
    if (level >= 7) return 'Maestro Lector';
    if (level >= 5) return 'Erudito Ilustrado';
    if (level >= 3) return 'Viajero Literario';
    if (level >= 2) return 'Explorador de Historias';
    return 'Lector Curioso';
  }

  // ─── Selector Sensorial de Lectura ───────────────────────────────────────
  selectMood(moodId: string): void {
    this.selectedMood = moodId;
    if (moodId === 'all') {
      this.filteredMoodBooks = this.allBooks.slice(0, 10);
    } else if (moodId === 'quick') {
      this.filteredMoodBooks = this.allBooks.filter(b => (b.page_count && b.page_count <= 200) || b.tags?.some(t => t.slug === 'cuentos')).slice(0, 10);
    } else if (moodId === 'ai') {
      this.filteredMoodBooks = this.allBooks.filter(b => (b.ai_character_count || 0) > 0).slice(0, 10);
    } else if (moodId === 'adventure') {
      this.filteredMoodBooks = this.allBooks.filter(b => b.genres?.some(g => g.slug.includes('aventura') || g.slug.includes('accion')) || b.tags?.some(t => t.slug.includes('aventura'))).slice(0, 10);
    } else if (moodId === 'philosophy') {
      this.filteredMoodBooks = this.allBooks.filter(b => b.genres?.some(g => g.slug.includes('filosofia')) || b.tags?.some(t => t.slug.includes('filosofia'))).slice(0, 10);
    } else if (moodId === 'drama') {
      this.filteredMoodBooks = this.allBooks.filter(b => b.genres?.some(g => g.slug.includes('teatro') || g.slug.includes('clasica'))).slice(0, 10);
    }
    if (this.filteredMoodBooks.length === 0) {
      this.filteredMoodBooks = this.allBooks.slice(0, 10);
    }
    this.cdr.detectChanges();
  }

  // ─── Simulador de Lectura Asistida ───────────────────────────────────────
  setAssistiveMode(mode: 'normal' | 'focus' | 'bionic' | 'dyslexia'): void {
    this.assistiveMode = mode;
    this.cdr.detectChanges();
  }

  toggleDemoAudio(): void {
    this.isAudioPlaying = !this.isAudioPlaying;
    if (this.isAudioPlaying) {
      this.audioProgress = 0;
      if (this.audioInterval) clearInterval(this.audioInterval);
      this.audioInterval = setInterval(() => {
        this.audioProgress = (this.audioProgress + 4) % 100;
        this.cdr.detectChanges();
      }, 300);
    } else {
      if (this.audioInterval) clearInterval(this.audioInterval);
      this.audioProgress = 0;
    }
    this.cdr.detectChanges();
  }

  private initBionicSample(): void {
    this.bionicHtml1 = this.sanitizer.bypassSecurityTrustHtml(this.convertToBionic(this.sampleParagraph1));
    this.bionicHtml2 = this.sanitizer.bypassSecurityTrustHtml(this.convertToBionic(this.sampleParagraph2));
  }

  private convertToBionic(text: string): string {
    return text.split(' ').map(word => {
      if (word.length <= 3) {
        return `<strong class="bionic-part">${word}</strong>`;
      }
      const mid = Math.ceil(word.length / 2);
      const first = word.substring(0, mid);
      const second = word.substring(mid);
      return `<strong class="bionic-part">${first}</strong>${second}`;
    }).join(' ');
  }

  // ─── Estadísticas y Contadores ───────────────────────────────────────────
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
      error: () => { /* conserva fallback */ }
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

  // ─── Continuar Leyendo ───────────────────────────────────────────────────
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

  // ─── Personajes y Avatares ───────────────────────────────────────────────
  private loadShowcaseAvatars(): void {
    this.avatarsLoading = true;
    this.api.get<any>('ai/hub/avatars/?sort=popularity').subscribe({
      next: (response: any) => {
        const avatars = Array.isArray(response) ? response : (response.results || []);
        this.showcaseAvatars = avatars.slice(0, 10);
        if (this.showcaseAvatars.length > 0) {
          const chosen = this.showcaseAvatars.find(a => a.name.includes('Nemo') || a.name.includes('Sócrates') || a.name.includes('Alicia')) || this.showcaseAvatars[0];
          this.characterOfTheDay = chosen;
          this.characterQuote = this.characterQuotesMap[chosen.name] || 'Las historias nos transforman; cada respuesta abre un camino desconocido en el libro.';
        }
        this.avatarsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.avatarsLoading = false; }
    });
  }

  goToCharactersHub(): void {
    this.router.navigate(['/characters']);
  }

  goToCharacterChat(avatar: DemoAvatar | null): void {
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

  // ─── Carga de Libros ─────────────────────────────────────────────────────
  private loadBooks(): void {
    this.isLoading = true;
    this.api.getCached<any>('catalog/books/?ordering=-is_featured,-created_at&page_size=50', undefined, 5 * 60 * 1000).subscribe({
      next: (response: any) => {
        if (this.destroy$.isStopped) return;
        this.allBooks = response.results || response;
        this.buildSections();
        this.filteredMoodBooks = this.allBooks.slice(0, 10);
        this.heroBooks = this.featuredBooks.slice(0, 6);
        this.heroBookIndex = 0;
        this.heroCoverFailed = false;
        this.heroBook = this.heroBooks[0] || null;
        this.startHeroAutoRotate();
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
        if (this.forYouBooks.length > 0) {
          this.popularTreasures = this.forYouBooks.slice(0, 16);
        }
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
    this.api.getCached<any>('catalog/books/?has_ai_avatars=true&ordering=-ai_character_count&page_size=12', undefined, 5 * 60 * 1000).subscribe({
      next: (response: any) => {
        if (this.destroy$.isStopped) return;
        const booksWithCharacters = response.results || response;
        this.featuredWithCharacters = booksWithCharacters.map((b: any) => ({
          slug: b.slug,
          title: b.title,
          author: b.author_name || 'Desconocido',
          cover: b.cover_image || 'assets/default_cover.jpg',
          genre: (b.genres && b.genres.length > 0) ? b.genres[0].name : 'Ficción',
          characterCount: b.ai_character_count || 0,
          page_count: b.page_count
        })).sort((a: any, b: any) => b.characterCount - a.characterCount);
        this.cdr.detectChanges();
        setTimeout(() => this.initRevealObserver(), 0);
      },
      error: (error) => { console.error('Error cargando libros con IA', error); }
    });
  }

  private buildSections(): void {
    this.featuredBooks = this.allBooks.filter(b => b.is_featured);
    if (this.featuredBooks.length === 0) {
      this.featuredBooks = this.allBooks.slice(0, 20);
    }

    // Estantería 1: Clásicos Inmortales (obras extensas o destacadas)
    this.immortalClassics = this.allBooks.filter(b => {
      const pages = this.getBookPages(b);
      return pages >= 220 || b.is_featured;
    }).slice(0, 16);

    // Estantería 2: Historias Vivas con IA
    this.livingAIBooks = this.allBooks.filter(b => (b.ai_character_count || 0) > 0).slice(0, 16);

    // Estantería 3: Lecturas Rápidas y Cuentos
    this.quickReads = this.allBooks.filter(b => {
      const pages = this.getBookPages(b);
      return (pages > 0 && pages <= 180) || b.tags?.some(t => t.slug === 'cuentos');
    }).slice(0, 16);

    // Estantería 4: Joyas y Tesoros Populares
    this.popularTreasures = this.forYouBooks.length > 0 
      ? this.forYouBooks.slice(0, 16) 
      : this.allBooks.slice(0, 16);

    this.applyCatalogFilters();
  }

  // ─── Control del Gran Catálogo y Filtros Reactivos ───────────────────────
  applyCatalogFilters(): void {
    const term = this.catalogSearchTerm.trim().toLowerCase();
    let result = [...this.allBooks];

    if (term) {
      result = result.filter(b => 
        (b.title && b.title.toLowerCase().includes(term)) ||
        (b.author_name && b.author_name.toLowerCase().includes(term)) ||
        (b.synopsis && b.synopsis.toLowerCase().includes(term)) ||
        (b.genres && b.genres.some(g => g.name.toLowerCase().includes(term)))
      );
    }

    if (this.activeGenreSlug) {
      result = result.filter(b => 
        b.genres?.some(g => g.slug === this.activeGenreSlug) ||
        b.tags?.some(t => t.slug === this.activeGenreSlug)
      );
    }

    if (this.activeQuickFilter === 'featured') {
      result = result.filter(b => b.is_featured);
    } else if (this.activeQuickFilter === 'ai') {
      result = result.filter(b => (b.ai_character_count || 0) > 0);
    } else if (this.activeQuickFilter === 'short') {
      result = result.filter(b => {
        const pages = this.getBookPages(b);
        return (pages > 0 && pages <= 180) || b.tags?.some(t => t.slug === 'cuentos');
      });
    } else if (this.activeQuickFilter === 'popular') {
      result = result.filter(b => b.is_featured || (b.ai_character_count || 0) > 0);
    }

    this.filteredCatalogBooks = result;
    this.cdr.detectChanges();
    setTimeout(() => this.initRevealObserver(), 50);
  }

  setQuickFilter(filter: 'all' | 'featured' | 'ai' | 'short' | 'popular'): void {
    this.activeQuickFilter = this.activeQuickFilter === filter && filter !== 'all' ? 'all' : filter;
    this.applyCatalogFilters();
  }

  selectCatalogGenre(slug: string | null): void {
    this.activeGenreSlug = this.activeGenreSlug === slug ? null : slug;
    this.applyCatalogFilters();
  }

  selectGenre(slug: string | null): void {
    this.selectCatalogGenre(slug);
  }

  onCatalogSearchChange(_term?: string): void {
    this.applyCatalogFilters();
  }

  onCatalogSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.catalogSearchTerm = target?.value || '';
    this.applyCatalogFilters();
  }

  clearCatalogSearch(): void {
    this.catalogSearchTerm = '';
    this.applyCatalogFilters();
  }

  setViewMode(mode: 'shelves' | 'grid'): void {
    this.catalogViewMode = mode;
    this.cdr.detectChanges();
    setTimeout(() => this.initRevealObserver(), 50);
  }

  setCatalogViewMode(mode: 'shelves' | 'grid'): void {
    this.setViewMode(mode);
  }

  // ─── Modal 3D Libro Abierto (Vista Rápida) ───────────────────────────────
  openQuickView(book: Book, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.selectedQuickViewBook = book;
    this.quickViewTab = 'synopsis';
    this.cdr.detectChanges();
  }

  closeQuickView(): void {
    this.selectedQuickViewBook = null;
    this.cdr.detectChanges();
  }

  setQuickViewTab(tab: 'synopsis' | 'ai' | 'details'): void {
    this.quickViewTab = tab;
    this.cdr.detectChanges();
  }

  toggleFavorite(book: Book, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    const isFav = this.isBookFavorite(book);
    this.favoritesService?.setFavorite(book.id, !isFav).subscribe({
      error: (err: any) => console.warn('Error al actualizar favorito:', err)
    });
  }

  isBookFavorite(book: Book): boolean {
    return this.favoritesService?.isFavorite(book.id, book.slug) ?? false;
  }

  goToBook(slug: string): void {
    this.router.navigate(['/book', slug]);
  }

  // ─── Reveal Observer y Animaciones ───────────────────────────────────────
  private initRevealObserver(): void {
    const revealObserver = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          revealObserver.unobserve(e.target);
        }
      }),
      // rootMargin inferior: la sección empieza a aparecer ANTES de entrar en
      // pantalla. Sin esto, con scroll rápido se ve el hueco en blanco durante
      // los 0.6s de la transición.
      { threshold: 0, rootMargin: '0px 0px 240px 0px' }
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
      const duration = 1600;
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

  // ─── TrackBy ─────────────────────────────────────────────────────────────
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

  trackByMoodId(_: number, mood: MoodOption): string {
    return mood.id;
  }
}
