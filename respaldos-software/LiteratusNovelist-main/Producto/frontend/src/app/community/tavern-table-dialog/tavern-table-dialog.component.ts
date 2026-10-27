import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { CommunityService, FriendCard, TavernChatMessage, TavernInvitation } from '../../core/services/community.service';
import { GamificationService } from '../../core/services/gamification.service';
import { SharedModule } from '../../shared/shared.module';
import { copyText } from '../clipboard.util';
import { ReaderPhotos } from '../reader-photo.util';
import { TavernTableAction } from '../tavern-table/tavern-table.types';
import { TableObjectArtComponent } from './table-object-art.component';

interface Reading {
  id: string; book_title?: string; author_name?: string; book_cover?: string | null; book_slug?: string;
  edition?: { book?: { title?: string } };
  progress?: { completion_percentage: number | string; updated_at?: string };
}
interface Highlight { id: string; text: string; }
interface WeeklyMission {
  id: string; current_count: number; is_completed: boolean; progress_percentage: number;
  mission: { title: string; description: string; target_count: number; ink_reward: number; xp_reward: number; reset_type: string };
}
interface ReaderProfile {
  ink_balance: number; xp: number; level: number; level_name: string; xp_to_next_level: number;
  streak_current: number; streak_max: number;
}
interface DailyStatus { can_claim: boolean; ink_reward: number; xp_reward: number; }
interface StreakDay { date: string; day: number; active: boolean; is_today: boolean; }
interface StreakStatus {
  streak_current: number; streak_max: number; streak_shields: number;
  is_secured_today: boolean; is_in_danger: boolean; calendar: StreakDay[];
}
/** Libro del catálogo, venga de la portada (starter_books/books) o de /catalog/books. */
interface ShelfBook { slug: string; title: string; author: string; cover: string | null; synopsis: string; }
interface Potion { slug: string; name: string; genre: string; color: string; note: string; }

type ShareKind = 'reading' | 'recommend' | 'quote' | 'finished';

export interface TavernTableDialogData {
  action: TavernTableAction;
  friends: FriendCard[];
  outgoing: TavernInvitation[];
  myCode?: string | null;
}
export interface TavernTableDialogResult { message?: TavernChatMessage; toast?: boolean; addFriend?: boolean; openClubs?: boolean; }

/** Iniciales de semana en el orden de `Date.getDay()`. */
const WEEKDAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

/** Lo que el gato cuenta mientras te trae un libro. */
const CAT_TALES = [
  'Cervantes escribió parte del Quijote en la cárcel de Sevilla.',
  'Julio Verne imaginó viajes a la Luna un siglo antes de que se hicieran.',
  'Edgar Allan Poe tenía una gata atigrada, Catterina, que lo acompañaba mientras escribía.',
  'Mary Shelley empezó Frankenstein con 18 años, en una noche de tormenta y cuentos de fantasmas.',
  'La Odisea se recitó de memoria durante siglos antes de escribirse.',
  'Lewis Carroll inventó el Gato de Cheshire para una niña llamada Alice Liddell.',
  'Emilia Pardo Bazán publicó más de seiscientos cuentos.',
  'Rubén Darío firmó su primer poema publicado con solo trece años.',
  'Charles Dickens publicaba sus novelas por entregas, capítulo a capítulo.',
  'Los gatos de Hemingway en Cayo Hueso tenían seis dedos; sus descendientes siguen allí.',
];

@Component({
  selector: 'app-tavern-table-dialog', standalone: true,
  imports: [SharedModule, TableObjectArtComponent],
  templateUrl: './tavern-table-dialog.component.html',
  styleUrls: ['../community-shared.css', './tavern-table-dialog.component.css'],
})
export class TavernTableDialogComponent implements OnInit, OnDestroy {
  readonly data = inject<TavernTableDialogData>(MAT_DIALOG_DATA);
  readonly dialog = inject<MatDialogRef<TavernTableDialogComponent, TavernTableDialogResult>>(MatDialogRef);
  private api = inject(ApiService);
  private community = inject(CommunityService);
  private gamification = inject(GamificationService);
  private destroy$ = new Subject<void>();

  /** Mismos nombres que el menú "+" de la mesa y los objetos 3D. */
  readonly title: Record<TavernTableAction, string> = {
    book: 'Compartir lectura',
    invite: 'Invitar y brindar',
    rewards: 'Mi cofre',
    cat: 'El gato de la taberna',
    potions: 'Pociones de lectura',
    hourglass: 'Tiempo de lectura',
  };
  /** Para qué sirve cada objeto, en una línea bajo el título. */
  readonly tagline: Record<TavernTableAction, string> = {
    book: 'Cuéntale a tu mesa qué estás leyendo o comparte una cita que te haya gustado.',
    invite: 'Llama a tus amigos a la mesa y brinda con los que ya están aquí.',
    rewards: 'Tu tesoro de lector: Tinta, nivel, el cofre del día y las misiones de la semana.',
    cat: 'Conoce cada estante de la biblioteca: te trae un clásico y una curiosidad.',
    potions: 'Elige un sabor y la poción te sirve libros de ese género.',
    hourglass: 'Tu racha de los últimos días y el atajo para seguir donde lo dejaste.',
  };
  readonly shareKinds: { value: ShareKind; label: string; icon: string }[] = [
    { value: 'reading', label: 'Lo estoy leyendo', icon: 'menu_book' },
    { value: 'recommend', label: 'Lo recomiendo', icon: 'thumb_up' },
    { value: 'quote', label: 'Una cita', icon: 'format_quote' },
    { value: 'finished', label: '¡Lo terminé!', icon: 'celebration' },
  ];
  readonly potions: Potion[] = [
    { slug: 'accion-y-aventura', name: 'Brebaje del explorador', genre: 'Aventura', color: '#f4a261', note: 'Para viajar lejos sin dejar la silla.' },
    { slug: 'terror', name: 'Elixir de medianoche', genre: 'Terror', color: '#43aa8b', note: 'Mejor con la luz encendida.' },
    { slug: 'poesia', name: 'Esencia de verso', genre: 'Poesía', color: '#f28482', note: 'Pocas gotas, mucho sentimiento.' },
    { slug: 'cuentos', name: 'Gotas de cuento', genre: 'Cuentos', color: '#4cc9f0', note: 'Historias que caben en una tarde.' },
    { slug: 'ficcion-historica', name: 'Tónico del cronista', genre: 'Ficción histórica', color: '#e9c46a', note: 'Sabe a otras épocas.' },
    { slug: 'teatro', name: 'Filtro del escenario', genre: 'Teatro', color: '#b388eb', note: 'Para leer en voz alta.' },
  ];
  readonly photos = new ReaderPhotos();

  loading = false;
  busy = '';
  error = '';

  // Libro
  readings: Reading[] = [];
  selectedId = '';
  shareKind: ShareKind = 'reading';
  quote = '';
  /** Subrayado que se usó como cita; se suelta en cuanto el lector la edita a mano. */
  quoteFrom = '';
  highlights: Highlight[] = [];
  highlightsFor = '';

  // Jarras
  sent = new Set<string>();
  toasted = new Set<string>();
  codeCopied = false;

  // Cofre
  profile: ReaderProfile | null = null;
  daily: DailyStatus | null = null;
  missions: WeeklyMission[] = [];
  chestOpen = false;
  claimed: { ink: number; xp: number } | null = null;

  // Gato
  private shelf: ShelfBook[] = [];
  catBook: ShelfBook | null = null;
  catTale = '';
  catTurn = 0;

  // Pociones
  potion: Potion | null = null;
  brewed: ShelfBook[] = [];
  brewing = false;
  private genreCounts = new Map<string, number>();

  // Reloj de arena
  streak: StreakStatus | null = null;
  week: { label: string; active: boolean; today: boolean; future: boolean }[] = [];

  get selected(): Reading | undefined { return this.readings.find(item => item.id === this.selectedId); }
  get here(): FriendCard[] { return this.data.friends.filter(friend => friend.status.kind === 'tavern'); }
  get away(): FriendCard[] { return this.data.friends.filter(friend => friend.status.kind !== 'tavern'); }
  /** La lectura empezada más reciente: la que el reloj de arena ofrece seguir. */
  get current(): Reading | undefined { return this.readings.find(item => this.progress(item) < 100) || this.readings[0]; }
  get xpPercent(): number {
    const profile = this.profile;
    return profile && profile.xp_to_next_level ? Math.min(100, Math.round(profile.xp / profile.xp_to_next_level * 100)) : 100;
  }

  bookTitle(item: Reading): string { return item.book_title || item.edition?.book?.title || 'Mi lectura'; }
  progress(item: Reading): number { return Math.max(0, Math.min(100, Number(item.progress?.completion_percentage) || 0)); }

  /** El mensaje tal como se publicará en el chat de la mesa (se ve en la vista previa). */
  get shareText(): string {
    const item = this.selected;
    if (!item) return '';
    const title = this.bookTitle(item).slice(0, 120);
    const author = item.author_name ? ` de ${item.author_name}` : '';
    switch (this.shareKind) {
      case 'quote': return this.quote.trim() ? `De «${title}»: “${this.quote.trim()}”` : '';
      case 'recommend': return `Les recomiendo «${title}»${author}. ¡Vale cada página! ✨`;
      case 'finished': return `¡Terminé «${title}»! 🎉 ¿Alguien más lo leyó?`;
      default: return `Estoy leyendo «${title}» (${Math.round(this.progress(item))} %). ¿Quién se suma a conversar? 📖`;
    }
  }

  ngOnInit(): void {
    this.data.outgoing.forEach(item => this.sent.add(item.user.friend_code));
    this.data.friends.filter(friend => friend.brindis_given).forEach(friend => this.toasted.add(friend.friend_code));
    this.load();
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  load(): void {
    this.error = '';
    switch (this.data.action) {
      case 'book': return this.loadReadings();
      case 'rewards': return this.loadChest();
      case 'cat': return this.loadShelf();
      case 'hourglass': return this.loadHourglass();
      case 'potions': return this.loadGenres();
      default: return;
    }
  }

  // ── Libro ────────────────────────────────────────────────

  private readings$(): Observable<Reading[] | { results: Reading[] }> {
    return this.api.get<Reading[] | { results: Reading[] }>('library/inventory/');
  }

  private sortReadings(response: Reading[] | { results: Reading[] }): Reading[] {
    const readings = Array.isArray(response) ? response : response.results;
    return [...readings].sort((a, b) => {
      const active = (item: Reading) => this.progress(item) > 0 && this.progress(item) < 100 ? 1 : 0;
      return active(b) - active(a) || (b.progress?.updated_at || '').localeCompare(a.progress?.updated_at || '');
    });
  }

  private loadReadings(): void {
    this.loading = true;
    this.readings$().pipe(takeUntil(this.destroy$)).subscribe({
      next: response => {
        this.readings = this.sortReadings(response);
        this.loading = false;
        if (this.readings[0]) this.selectReading(this.readings[0].id);
      },
      error: () => { this.loading = false; this.error = 'No pudimos abrir tu biblioteca. Inténtalo de nuevo.'; },
    });
  }

  selectReading(id: string): void {
    if (this.busy) return;
    this.selectedId = id;
    if (this.shareKind === 'finished' && this.selected && this.progress(this.selected) < 100) this.shareKind = 'reading';
    if (this.shareKind === 'quote') this.loadHighlights();
  }

  setShareKind(kind: ShareKind): void {
    this.shareKind = kind;
    if (kind === 'quote') this.loadHighlights();
  }

  /** Tus subrayados de ese libro, para compartir uno como cita sin copiarlo a mano. */
  private loadHighlights(): void {
    const id = this.selectedId;
    if (!id || this.highlightsFor === id) return;
    this.highlightsFor = id;
    this.highlights = [];
    this.api.get<Highlight[]>(`library/highlights/?inventory=${id}`).pipe(takeUntil(this.destroy$)).subscribe({
      next: list => {
        if (this.selectedId !== id) return;
        this.highlights = list.filter(item => item.text?.trim()).slice(-6).reverse();
      },
      error: () => { this.highlights = []; },
    });
  }

  useHighlight(item: Highlight): void {
    const text = item.text.trim().replace(/\s+/g, ' ');
    this.quote = text.length > 140 ? `${text.slice(0, 139)}…` : text;
    this.quoteFrom = item.id;
  }

  share(): void {
    const content = this.shareText;
    if (!content || this.busy) return;
    this.publish(content, 'share', 'No se pudo compartir. Tu mensaje sigue aquí para volver a intentarlo.');
  }

  private publish(content: string, busy: string, failure: string): void {
    this.busy = busy; this.error = '';
    this.community.sendMessage(content).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => this.dialog.close({ message: result.message }),
      error: err => { this.busy = ''; this.error = err.error?.message || failure; },
    });
  }

  // ── Jarras ───────────────────────────────────────────────

  invite(friend: FriendCard): void {
    if (this.busy || this.sent.has(friend.friend_code)) return;
    this.busy = friend.friend_code; this.error = '';
    this.community.inviteToTavern(friend.friend_code).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.sent.add(friend.friend_code); this.busy = ''; },
      error: err => { this.busy = ''; this.error = err.error?.message || 'No pudimos enviar la invitación. Inténtalo de nuevo.'; },
    });
  }

  toast(friend: FriendCard): void {
    if (this.busy || this.toasted.has(friend.friend_code)) return;
    this.busy = friend.friend_code; this.error = '';
    this.community.giveBrindis(friend.friend_code).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.dialog.close({ toast: true }),
      error: err => { this.busy = ''; this.error = err.error?.message || 'No pudimos completar el brindis. Inténtalo de nuevo.'; },
    });
  }

  async copyCode(): Promise<void> {
    if (!this.data.myCode) return;
    this.codeCopied = await copyText(`#${this.data.myCode}`);
    if (this.codeCopied) setTimeout(() => this.codeCopied = false, 1800);
  }

  // ── Cofre ────────────────────────────────────────────────

  private loadChest(): void {
    this.loading = true;
    forkJoin({
      profile: this.api.get<ReaderProfile>('users/profile/').pipe(catchError(() => of(null))),
      daily: this.gamification.getDailyRewardStatus().pipe(catchError(() => of(null))),
      missions: this.gamification.getMissions().pipe(catchError(() => of(null))),
    }).pipe(takeUntil(this.destroy$)).subscribe(({ profile, daily, missions }) => {
      this.loading = false;
      this.profile = profile;
      this.daily = daily;
      this.missions = ((missions || []) as WeeklyMission[]).filter(item => item.mission?.reset_type === 'weekly');
      if (!profile && !daily && !missions) this.error = 'No pudimos abrir tu cofre. Inténtalo de nuevo.';
    });
  }

  claimDaily(): void {
    if (this.busy || !this.daily?.can_claim) return;
    this.busy = 'claim'; this.error = '';
    this.gamification.claimDailyReward().pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.busy = '';
        this.chestOpen = true;
        this.claimed = { ink: result.ink_reward ?? this.daily?.ink_reward ?? 0, xp: result.xp_reward ?? this.daily?.xp_reward ?? 0 };
        this.daily = { ...(this.daily as DailyStatus), can_claim: false };
        if (this.profile && result.new_ink_balance !== undefined) {
          this.profile = { ...this.profile, ink_balance: result.new_ink_balance, xp: result.new_xp ?? this.profile.xp, level: result.new_level ?? this.profile.level };
        }
      },
      error: err => {
        this.busy = '';
        if (err.error?.error === 'ALREADY_CLAIMED') this.daily = { ...(this.daily as DailyStatus), can_claim: false };
        this.error = err.error?.message || 'No pudimos abrir el cofre del día. Inténtalo de nuevo.';
      },
    });
  }

  // ── Gato ─────────────────────────────────────────────────

  /** Los libros de la portada del catálogo: una selección cuidada, sin obras para adultos. */
  private loadShelf(): void {
    this.loading = true;
    this.api.get<{ books?: any[]; starter_books?: any[] }>('catalog/home/').pipe(takeUntil(this.destroy$)).subscribe({
      next: home => {
        const books = [...(home.starter_books || []), ...(home.books || [])].map(book => this.toShelfBook(book));
        this.shelf = [...new Map(books.filter(book => book.slug).map(book => [book.slug, book])).values()];
        this.loading = false;
        this.nextCatPick();
      },
      error: () => { this.loading = false; this.error = 'El gato no encontró la biblioteca. Inténtalo de nuevo.'; },
    });
  }

  nextCatPick(): void {
    if (!this.shelf.length) return;
    const others = this.shelf.filter(book => book.slug !== this.catBook?.slug);
    this.catBook = pick(others.length ? others : this.shelf);
    const tales = CAT_TALES.filter(tale => tale !== this.catTale);
    this.catTale = pick(tales);
    this.catTurn++;
  }

  shareCatPick(): void {
    const book = this.catBook;
    if (!book || this.busy) return;
    const author = book.author ? ` de ${book.author}` : '';
    this.publish(`El gato de la taberna me recomendó «${book.title.slice(0, 120)}»${author} 🐾`, 'cat',
      'No se pudo compartir la recomendación. Inténtalo de nuevo.');
  }

  // ── Pociones ─────────────────────────────────────────────

  private loadGenres(): void {
    this.api.get<any[] | { results: any[] }>('catalog/genres/').pipe(takeUntil(this.destroy$)).subscribe({
      next: response => {
        const genres = Array.isArray(response) ? response : response.results;
        genres.forEach(genre => this.genreCounts.set(genre.slug, Number(genre.book_count) || 0));
      },
      error: () => undefined,
    });
  }

  brew(potion: Potion): void {
    if (this.brewing && this.potion?.slug === potion.slug) return;
    this.potion = potion;
    this.brewing = true;
    this.error = '';
    const pages = Math.max(1, Math.floor((this.genreCounts.get(potion.slug) || 3) / 3));
    const page = 1 + Math.floor(Math.random() * pages);
    const request = (p: number) => this.api.get<{ results: any[] }>(
      `catalog/books/?genres__slug=${potion.slug}&audience=general&page_size=3&page=${p}`);
    request(page).pipe(
      // Las obras para adultos no cuentan: si la página elegida ya no existe, sirve la primera.
      catchError(() => page > 1 ? request(1) : of({ results: [] })),
      takeUntil(this.destroy$),
    ).subscribe({
      next: response => {
        if (this.potion?.slug !== potion.slug) return;
        this.brewed = response.results.map(book => this.toShelfBook(book));
        this.brewing = false;
      },
      error: () => { this.brewing = false; this.error = 'La poción no burbujeó. Inténtalo de nuevo.'; },
    });
  }

  // ── Reloj de arena ───────────────────────────────────────

  private loadHourglass(): void {
    this.loading = true;
    forkJoin({
      streak: this.api.get<StreakStatus>('learning/streak/').pipe(catchError(() => of(null))),
      readings: this.readings$().pipe(catchError(() => of(null))),
    }).pipe(takeUntil(this.destroy$)).subscribe(({ streak, readings }) => {
      this.loading = false;
      this.streak = streak;
      this.readings = readings ? this.sortReadings(readings) : [];
      this.week = this.buildWeek(streak?.calendar || []);
      if (!streak && !readings) this.error = 'No pudimos leer tu reloj de arena. Inténtalo de nuevo.';
    });
  }

  /** Lunes a domingo de esta semana, marcando los días con lectura o nivel completado. */
  private buildWeek(calendar: StreakDay[]): { label: string; active: boolean; today: boolean; future: boolean }[] {
    const byDate = new Map(calendar.map(day => [day.date, day]));
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      const key = isoDate(day);
      const isToday = key === isoDate(today);
      return { label: WEEKDAYS[day.getDay()], active: !!byDate.get(key)?.active, today: isToday, future: day > today && !isToday };
    });
  }

  // ── Utilidades ───────────────────────────────────────────

  private toShelfBook(book: any): ShelfBook {
    return {
      slug: book.slug,
      title: book.title || 'Un libro misterioso',
      author: book.author_name || book.author || '',
      cover: book.cover_image || book.cover || null,
      synopsis: (book.synopsis || '').trim(),
    };
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
  trackBySlug(_: number, item: { slug: string }): string { return item.slug; }
  trackByCode(_: number, friend: FriendCard): string { return friend.friend_code; }
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function isoDate(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}
