import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { CommunityService, ReadingClubForBook, ReadingClubLiveState, ReadingClubMemberInfo } from '../../../core/services/community.service';
import { timeAgo } from '../../../community/time-ago.util';
import { ReaderComponent } from '../reader.component';

const TICK_MS = 1000;
const FOLLOW_POLL_MS = 2500;      // siguiendo a alguien se pregunta más seguido
const PUSH_GAP_MS = 1200;         // un cambio de página se avisa al momento, pero no más de una vez por segundo
const CLUBS_RECHECK_MS = 60_000;  // por si te suman a un círculo con el libro abierto

/**
 * Lectura conjunta dentro del lector: con quién lees este libro, dónde va cada uno y quién lo tiene
 * abierto ahora. Sondeo corto (el servidor corre un solo proceso y sin websockets): mientras la
 * pestaña se ve, avisa la posición cada pocos segundos y de vuelta recibe la de los compañeros.
 * "Seguir a X" pasa tu página cuando la suya sale de tu pantalla; cada uno lee a su ritmo si no.
 */
@Component({
  selector: 'app-reader-companions',
  templateUrl: './reader-companions.component.html',
  styleUrl: './reader-companions.component.css',
})
export class ReaderCompanionsComponent implements OnInit, OnDestroy {
  readonly r = inject(ReaderComponent);
  private community = inject(CommunityService);
  private route = inject(ActivatedRoute);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('pill') private pill?: ElementRef<HTMLButtonElement>;

  club: ReadingClubForBook | null = null;
  companions: ReadingClubMemberInfo[] = [];
  open = false;
  followingCode = '';

  private bookId: string | null = null;
  private tick?: ReturnType<typeof setInterval>;
  private positionSub?: Subscription;
  private busy = false;
  private dirty = false;
  private pollMs = 5000;
  private lastPollAt = 0;
  private lastClubsCheck = 0;
  private leaderKey = '';
  private destroyed = false;

  get readingNow(): ReadingClubMemberInfo[] {
    return this.companions.filter(c => c.reading_now);
  }

  get leader(): ReadingClubMemberInfo | null {
    return this.followingCode ? this.companions.find(c => c.friend_code === this.followingCode) ?? null : null;
  }

  /** Con los controles ocultos solo aparece si alguien lee ahora o si sigues a alguien. */
  get pillShown(): boolean {
    return !!this.club && (this.open || !!this.leader || this.readingNow.length > 0 || this.r.chromeVisible());
  }

  get pillText(): string {
    const leader = this.leader;
    if (leader) return `Siguiendo a ${leader.username}`;
    const live = this.readingNow;
    if (live.length === 1) {
      const chapter = live[0].position?.chapter;
      return chapter ? `${live[0].username} · ${this.chapterShort(chapter)}` : `${live[0].username} está leyendo`;
    }
    if (live.length === 2) return `${live[0].username} y ${live[1].username} leen ahora`;
    if (live.length > 2) return `${live.length} leyendo ahora`;
    return 'Lectura conjunta';
  }

  /** Caras de la píldora: quienes leen ahora (o el círculo entero si nadie lee). */
  get faces(): ReadingClubMemberInfo[] {
    const leader = this.leader;
    if (leader) return [leader];
    return (this.readingNow.length ? this.readingNow : this.companions).slice(0, 3);
  }

  ngOnInit(): void {
    this.positionSub = this.r.livePosition$.subscribe(() => { this.dirty = true; });
    this.zone.runOutsideAngular(() => {
      this.tick = setInterval(() => this.onTick(), TICK_MS);
    });
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.tick) clearInterval(this.tick);
    this.positionSub?.unsubscribe();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.leaveClub();
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) setTimeout(() => document.getElementById('rd-co-title')?.focus());
  }

  close(event?: Event): void {
    event?.stopPropagation(); // Esc no debe llegar al lector (cerraría otras cosas)
    this.open = false;
    this.pill?.nativeElement.focus();
  }

  statusOf(c: ReadingClubMemberInfo): string {
    const pos = c.position;
    if (c.reading_now) {
      if (!pos?.chapter) return 'Con el libro abierto';
      const where = pos.chapter === this.r.currentPage ? 'en tu capítulo' : this.chapterShort(pos.chapter);
      return `Leyendo ahora · ${where} · ${Math.round(pos.fraction * 100)} %`;
    }
    if (pos?.chapter) return `Leyó ${timeAgo(pos.updated_at)} · ${this.chapterShort(pos.chapter)}`;
    return `Va en el ${this.chapterShort(c.current_chapter)}`;
  }

  goTo(c: ReadingClubMemberInfo): void {
    const pos = c.position;
    const chapter = pos?.chapter || c.current_chapter;
    if (!chapter) return;
    if (this.followingCode && this.followingCode !== c.friend_code) this.followingCode = '';
    this.open = false;
    this.r.goToCompanion(chapter, pos?.chapter ? pos.word : null, `Con ${c.username} en`);
  }

  toggleFollow(c: ReadingClubMemberInfo): void {
    if (this.followingCode === c.friend_code) {
      this.stopFollowing(`Dejaste de seguir a ${c.username}`);
      return;
    }
    this.followingCode = c.friend_code;
    this.leaderKey = '';
    this.open = false;
    this.r.flashToast('👥', `Siguiendo a ${c.username}: tu página avanza con la suya`, 3200);
    this.followStep();
    this.lastPollAt = 0; // a partir de ahora se pregunta más seguido
  }

  trackMember = (_: number, m: ReadingClubMemberInfo) => m.friend_code;

  private chapterShort(chapter: number): string {
    return `Cap. ${chapter}`;
  }

  private onVisibility = (): void => {
    if (!document.hidden) this.lastPollAt = 0; // al volver a la pestaña se pone al día de inmediato
  };

  private onTick(): void {
    if (document.hidden || this.busy) return;
    const now = Date.now();
    const bookId = this.r.bookId;
    if (bookId !== this.bookId) {
      this.leaveClub();
      this.bookId = bookId;
      this.lastClubsCheck = 0;
      this.update(() => this.reset());
    }
    if (!bookId) return;
    if (!this.club) {
      if (now - this.lastClubsCheck >= CLUBS_RECHECK_MS) this.findClub(bookId, now);
      return;
    }
    const pollEvery = this.followingCode ? FOLLOW_POLL_MS : this.pollMs;
    if (now - this.lastPollAt >= pollEvery || (this.dirty && now - this.lastPollAt >= PUSH_GAP_MS)) this.sync(now);
  }

  private findClub(bookId: string, now: number): void {
    this.busy = true;
    this.lastClubsCheck = now;
    this.community.clubsForBook(bookId).subscribe({
      next: res => {
        this.busy = false;
        if (this.bookId !== bookId) return;
        // Desde la Taberna llega ?lectura=<círculo>; si no, el círculo más activo de este libro.
        const wanted = this.route.snapshot.queryParamMap.get('lectura');
        const club = res.results.find(c => c.id === wanted) ?? res.results[0] ?? null;
        if (!club) return;
        this.update(() => { this.club = club; });
        this.lastPollAt = 0;
        this.dirty = true;
      },
      error: () => { this.busy = false; },
    });
  }

  private sync(now: number): void {
    const club = this.club!;
    const pos = this.r.livePosition;
    this.busy = true;
    this.dirty = false;
    this.lastPollAt = now;
    // Siempre POST: tener el lector abierto es "estar leyendo"; sin posición (tapa cerrada) solo avisa eso.
    this.community.clubLive(club.id, pos ? { chapter: pos.chapter, word: pos.word, fraction: pos.fraction } : {}).subscribe({
      next: state => {
        this.busy = false;
        if (this.club?.id === club.id) this.apply(state);
      },
      error: err => {
        this.busy = false;
        // Saliste del círculo (o lo cerraron) con el libro abierto.
        if (err?.status === 404 && this.club?.id === club.id) this.update(() => this.reset());
      },
    });
  }

  private apply(state: ReadingClubLiveState): void {
    this.pollMs = Math.max(2000, state.poll_ms || 5000);
    this.update(() => {
      this.club = { ...this.club!, name: state.club.name, mode: state.club.mode };
      this.companions = state.members.filter(m => !m.is_me);
    });
    this.followStep();
  }

  /** Si la persona que sigues pasó de página y eso ya no se ve en la tuya, tu página la alcanza. */
  private followStep(): void {
    const leader = this.leader;
    if (!this.followingCode) return;
    if (!leader) {
      this.stopFollowing('Salió del círculo: dejaste de seguir su lectura');
      return;
    }
    if (!leader.reading_now) {
      this.stopFollowing(`${leader.username} cerró el libro: dejaste de seguir su lectura`);
      return;
    }
    const pos = leader.position;
    if (!pos?.chapter) return;
    const key = `${pos.chapter}:${pos.word ?? ''}`;
    if (key === this.leaderKey) return; // no se movió: tú lees a tu ritmo dentro de su página
    this.leaderKey = key;
    if (this.r.isCompanionOnScreen(pos.chapter, pos.word)) return;
    this.zone.run(() => this.r.goToCompanion(pos.chapter!, pos.word, `${leader.username} va en`, true));
  }

  private stopFollowing(message: string): void {
    this.update(() => { this.followingCode = ''; });
    this.leaderKey = '';
    this.zone.run(() => this.r.flashToast('👥', message, 3000));
  }

  private leaveClub(): void {
    if (!this.club) return;
    // Al cerrar el lector deja de verse "leyendo ahora" al instante (si no, caduca sola en 20 s).
    this.community.leaveClubLive(this.club.id).subscribe({ error: () => {} });
  }

  private reset(): void {
    this.club = null;
    this.companions = [];
    this.followingCode = '';
    this.leaderKey = '';
    this.open = false;
  }

  /** El sondeo corre fuera de la zona de Angular: se repinta solo esta franja, no el lector entero. */
  private update(change: () => void): void {
    if (this.destroyed) return; // llegó una respuesta con el lector ya cerrado
    change();
    this.cdr.detectChanges();
  }
}
