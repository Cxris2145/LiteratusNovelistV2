import {
  Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import {
  ClubBookOption, CommunityService, FriendCard, ReadingClubChapterInfo,
  ReadingClubMessageItem, ReadingClubMode, ReadingClubSummary,
} from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { clockTime, dayLabel, timeAgo } from '../time-ago.util';

const POLL_MS = 4000;
export const CLUB_MSG_MAX_LENGTH = 500;

type ClubViewMode = 'list' | 'create' | 'club' | 'chapter' | 'settings' | 'invite';
type ClubChatRow = { kind: 'day'; key: string; label: string } | { kind: 'message'; key: string; message: ReadingClubMessageItem };

@Component({
  selector: 'app-tavern-reading-clubs',
  templateUrl: './tavern-reading-clubs.component.html',
  styleUrls: ['../community-shared.css', './tavern-reading-clubs.component.css'],
})
export class TavernReadingClubsComponent implements OnChanges, OnDestroy {
  private community = inject(CommunityService);
  private notification = inject(NotificationService);
  private router = inject(Router);
  private zone = inject(NgZone);
  private destroy$ = new Subject<void>();

  @Input() open = false;
  @Input() clubId = '';
  @Input() friends: FriendCard[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() clubChange = new EventEmitter<string>();

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;
  @ViewChild('composer') private composer?: ElementRef<HTMLTextAreaElement>;

  readonly maxLength = CLUB_MSG_MAX_LENGTH;
  readonly timeAgo = timeAgo;
  readonly clockTime = clockTime;

  view: ClubViewMode = 'list';
  enter: 'forward' | 'back' | null = null;

  clubs: ReadingClubSummary[] = [];
  clubsLoading = false;

  activeClub: ReadingClubSummary | null = null;
  activeChapter: ReadingClubChapterInfo | null = null;
  detailLoading = false;

  // Creación de grupo
  books: ClubBookOption[] = [];
  booksLoading = false;
  createName = '';
  createBookId = '';
  createMode: ReadingClubMode = 'spoiler_safe';
  createUnlockedUntil = 1;
  createAllowInvites = true;
  selectedFriends = new Set<string>();
  creating = false;

  // Configuración del anfitrión
  editName = '';
  editMode: ReadingClubMode = 'spoiler_safe';
  editUnlockedUntil = 1;
  editAllowInvites = true;
  savingSettings = false;

  // Invitar más amigos a un grupo existente
  inviteSelected = new Set<string>();
  inviting = false;

  // Mensajes del capítulo
  messages: ReadingClubMessageItem[] = [];
  rows: ClubChatRow[] = [];
  messagesLoading = false;
  draft = '';
  draftSpoiler = false;
  sending = false;
  revealedSpoilers = new Set<string>();
  arrived = new Set<string>();

  updatingProgress = false;
  error = '';

  private poll: ReturnType<typeof setInterval> | null = null;
  private request?: Subscription;

  readonly modes: ReadingClubMode[] = ['spoiler_safe', 'host_paced', 'free'];

  readonly modeLabels: Record<ReadingClubMode, { title: string; desc: string; icon: string }> = {
    spoiler_safe: {
      title: 'Protección anti-spoilers',
      desc: 'Cada lector desbloquea los capítulos a medida que avanza en su lectura.',
      icon: 'shield_lock',
    },
    host_paced: {
      title: 'Guiado por el anfitrión',
      desc: 'El líder del grupo define hasta qué capítulo está abierto para conversar.',
      icon: 'flag',
    },
    free: {
      title: 'Acceso libre',
      desc: 'Todos los capítulos están abiertos desde el inicio sin restricciones.',
      icon: 'lock_open',
    },
  };

  get selectedCreateBook(): ClubBookOption | undefined {
    return this.books.find(b => b.id === this.createBookId);
  }

  get availableFriendsToInvite(): FriendCard[] {
    if (!this.activeClub) return this.friends;
    const currentCodes = new Set(this.activeClub.members.map(m => m.friend_code));
    return this.friends.filter(f => !currentCodes.has(f.friend_code));
  }

  chapterRange(count?: number): number[] {
    const n = Math.max(1, count || 1);
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      this.enter = null;
      if (!this.open) {
        this.stopPolling();
        return;
      }
    }
    if ((changes['open'] || changes['clubId']) && this.open) {
      this.error = '';
      if (this.clubId) {
        this.openClubDetail(this.clubId);
      } else {
        this.stopPolling();
        this.view = 'list';
        this.activeClub = null;
        this.activeChapter = null;
        this.loadClubs();
      }
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.request?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  close(): void {
    if (this.open) this.closed.emit();
  }

  backToList(): void {
    this.stopPolling();
    this.enter = 'back';
    this.activeClub = null;
    this.activeChapter = null;
    this.view = 'list';
    this.clubChange.emit('');
    this.loadClubs(true);
  }

  backToClub(): void {
    this.stopPolling();
    this.enter = 'back';
    this.activeChapter = null;
    this.view = 'club';
    if (this.activeClub) {
      this.openClubDetail(this.activeClub.id, true);
    }
  }

  startCreate(): void {
    this.enter = 'forward';
    this.view = 'create';
    this.error = '';
    this.createName = '';
    this.createMode = 'spoiler_safe';
    this.createUnlockedUntil = 1;
    this.createAllowInvites = true;
    this.selectedFriends.clear();
    if (!this.books.length) {
      this.booksLoading = true;
      this.community.clubBooks().pipe(takeUntil(this.destroy$)).subscribe({
        next: res => {
          this.books = res.results;
          this.createBookId = this.books[0]?.id || '';
          this.booksLoading = false;
        },
        error: () => {
          this.booksLoading = false;
          this.error = 'No pudimos cargar el catálogo de libros.';
        },
      });
    } else if (!this.createBookId && this.books.length) {
      this.createBookId = this.books[0].id;
    }
  }

  toggleFriendSelection(code: string, set: Set<string>): void {
    if (set.has(code)) set.delete(code);
    else set.add(code);
  }

  submitCreate(): void {
    if (!this.createBookId || this.creating) return;
    this.creating = true;
    this.error = '';
    this.community.createReadingClub({
      name: this.createName.trim(),
      book_id: this.createBookId,
      mode: this.createMode,
      unlocked_until_chapter: this.createUnlockedUntil,
      allow_member_invites: this.createAllowInvites,
      friend_codes: Array.from(this.selectedFriends),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.creating = false;
        this.notification.success(res.message || 'Círculo de lectura creado.', 'Lecturas grupales');
        this.clubChange.emit(res.club.id);
        this.openClubDetail(res.club.id);
      },
      error: err => {
        this.creating = false;
        this.error = err.error?.message || 'No se pudo crear el círculo de lectura.';
      },
    });
  }

  selectClub(club: ReadingClubSummary): void {
    this.enter = 'forward';
    this.clubChange.emit(club.id);
    this.openClubDetail(club.id);
  }

  openClubDetail(id: string, quiet = false): void {
    this.stopPolling();
    if (!quiet) {
      this.detailLoading = true;
      this.view = 'club';
    }
    this.error = '';
    this.request?.unsubscribe();
    this.request = this.community.readingClubDetail(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.detailLoading = false;
        this.activeClub = res.club;
        if (this.view !== 'chapter' && this.view !== 'settings' && this.view !== 'invite') {
          this.view = 'club';
        }
      },
      error: err => {
        this.detailLoading = false;
        this.error = err.error?.message || 'No pudimos abrir este círculo de lectura.';
      },
    });
  }

  onMyChapterChange(newChap: number | string): void {
    if (!this.activeClub || this.updatingProgress) return;
    const chap = Number(newChap);
    if (!Number.isFinite(chap) || chap === this.activeClub.my_chapter) return;
    this.updatingProgress = true;
    this.community.updateReadingClubProgress(this.activeClub.id, chap).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.updatingProgress = false;
        this.activeClub = res.club;
        this.notification.success(`Avance actualizado al Capítulo ${chap}.`, 'Lectura grupal');
      },
      error: err => {
        this.updatingProgress = false;
        this.error = err.error?.message || 'No se pudo actualizar tu capítulo.';
      },
    });
  }

  openReader(club: ReadingClubSummary): void {
    this.close();
    if (club.inventory_id) {
      this.router.navigate(['/reader', club.inventory_id]);
    } else {
      this.router.navigate(['/books', club.book.slug]);
    }
  }

  openSettings(): void {
    if (!this.activeClub || !this.activeClub.is_host) return;
    this.enter = 'forward';
    this.error = '';
    this.editName = this.activeClub.name;
    this.editMode = this.activeClub.mode;
    this.editUnlockedUntil = this.activeClub.unlocked_until_chapter;
    this.editAllowInvites = this.activeClub.allow_member_invites;
    this.view = 'settings';
  }

  saveSettings(): void {
    if (!this.activeClub || this.savingSettings) return;
    this.savingSettings = true;
    this.error = '';
    this.community.updateReadingClubSettings(this.activeClub.id, {
      name: this.editName.trim(),
      mode: this.editMode,
      unlocked_until_chapter: this.editUnlockedUntil,
      allow_member_invites: this.editAllowInvites,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.savingSettings = false;
        this.activeClub = res.club;
        this.enter = 'back';
        this.view = 'club';
        this.notification.success('Reglas del grupo actualizadas.', 'Lectura grupal');
      },
      error: err => {
        this.savingSettings = false;
        this.error = err.error?.message || 'No se pudieron guardar los ajustes.';
      },
    });
  }

  openInviteView(): void {
    if (!this.activeClub) return;
    this.enter = 'forward';
    this.error = '';
    this.inviteSelected.clear();
    this.view = 'invite';
  }

  submitInvites(): void {
    if (!this.activeClub || !this.inviteSelected.size || this.inviting) return;
    this.inviting = true;
    this.error = '';
    this.community.inviteToReadingClub(this.activeClub.id, Array.from(this.inviteSelected))
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: res => {
          this.inviting = false;
          this.activeClub = res.club;
          this.enter = 'back';
          this.view = 'club';
          this.notification.success(res.message || 'Amigos añadidos al grupo.', 'Lectura grupal');
        },
        error: err => {
          this.inviting = false;
          this.error = err.error?.message || 'No se pudo invitar a tus amigos.';
        },
      });
  }

  leaveOrCloseClub(): void {
    if (!this.activeClub) return;
    const id = this.activeClub.id;
    this.community.leaveReadingClub(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.notification.success(res.message || 'Has salido del grupo.', 'Lectura grupal');
        this.backToList();
      },
      error: err => {
        this.error = err.error?.message || 'No se pudo completar la acción.';
      },
    });
  }

  openChapter(chapter: ReadingClubChapterInfo): void {
    if (!this.activeClub) return;
    if (chapter.locked) {
      this.notification.info(chapter.lock_reason || 'Este capítulo aún está bloqueado.', 'Capítulo bloqueado');
      return;
    }
    this.enter = 'forward';
    this.activeChapter = chapter;
    this.view = 'chapter';
    this.error = '';
    this.draft = '';
    this.draftSpoiler = false;
    this.messages = [];
    this.rows = [];
    this.arrived.clear();
    this.messagesLoading = true;

    const clubId = this.activeClub.id;
    const order = chapter.order;
    this.request?.unsubscribe();
    this.request = this.community.chapterMessages(clubId, order).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        if (this.activeChapter?.order !== order) return;
        this.messagesLoading = false;
        this.appendMessages(res.messages, true, false);
        this.startPolling();
        setTimeout(() => this.composer?.nativeElement.focus({ preventScroll: true }), 60);
      },
      error: err => {
        this.messagesLoading = false;
        this.error = err.error?.message || 'No pudimos cargar los comentarios del capítulo.';
      },
    });
  }

  onComposerKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage(): void {
    const content = this.draft.trim();
    if (!content || this.sending || !this.activeClub || !this.activeChapter) return;
    this.sending = true;
    this.error = '';
    const clubId = this.activeClub.id;
    const order = this.activeChapter.order;
    this.community.sendChapterMessage(clubId, order, content, this.draftSpoiler)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: res => {
          this.sending = false;
          if (this.activeChapter?.order !== order) return;
          this.draft = '';
          this.draftSpoiler = false;
          this.appendMessages([res.item], true, true);
          if (this.activeChapter) {
            this.activeChapter.message_count = (this.activeChapter.message_count || 0) + 1;
          }
          setTimeout(() => this.composer?.nativeElement.focus());
        },
        error: err => {
          this.sending = false;
          this.error = err.error?.message || 'No se pudo enviar el comentario.';
        },
      });
  }

  toggleRevealSpoiler(msgId: string): void {
    if (this.revealedSpoilers.has(msgId)) this.revealedSpoilers.delete(msgId);
    else this.revealedSpoilers.add(msgId);
  }

  trackClub = (_: number, club: ReadingClubSummary) => club.id;
  trackChapter = (_: number, ch: ReadingClubChapterInfo) => ch.order;
  trackRow = (_: number, row: ClubChatRow) => row.key;

  private loadClubs(quiet = false): void {
    if (!quiet) this.clubsLoading = true;
    this.request?.unsubscribe();
    this.request = this.community.readingClubs().pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.clubs = res.results;
        this.clubsLoading = false;
      },
      error: () => {
        this.clubsLoading = false;
        if (!quiet) this.error = 'No pudimos cargar tus lecturas grupales.';
      },
    });
  }

  private refreshChapterMessages(): void {
    if (!this.activeClub || !this.activeChapter || this.view !== 'chapter') return;
    const clubId = this.activeClub.id;
    const order = this.activeChapter.order;
    const lastId = this.messages[this.messages.length - 1]?.id;
    this.community.chapterMessages(clubId, order, lastId).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        if (this.activeChapter?.order !== order || !this.open) return;
        if (res.incremental) this.appendMessages(res.messages, false, true);
        else {
          this.messages = [];
          this.appendMessages(res.messages, false, false);
        }
      },
      error: () => {},
    });
  }

  private appendMessages(incoming: ReadingClubMessageItem[], forceScroll: boolean, animate: boolean): void {
    const known = new Set(this.messages.map(m => m.id));
    const fresh = incoming.filter(m => !known.has(m.id));
    if (!fresh.length && this.rows.length) return;
    if (animate) fresh.forEach(m => this.arrived.add(m.id));
    const list = this.scroller?.nativeElement;
    const nearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    this.messages = [...this.messages, ...fresh];
    this.rows = this.buildRows(this.messages);
    if (forceScroll || nearBottom) setTimeout(() => this.scrollToEnd());
  }

  private buildRows(messages: ReadingClubMessageItem[]): ClubChatRow[] {
    const rows: ClubChatRow[] = [];
    let currentDay = '';
    for (const message of messages) {
      const day = dayLabel(message.created_at);
      if (day !== currentDay) {
        currentDay = day;
        rows.push({ kind: 'day', key: 'day-' + message.id, label: day });
      }
      rows.push({ kind: 'message', key: message.id, message });
    }
    return rows;
  }

  private startPolling(): void {
    this.stopPolling();
    this.zone.runOutsideAngular(() => {
      this.poll = setInterval(() => {
        if (!document.hidden && this.open && this.view === 'chapter') {
          this.zone.run(() => this.refreshChapterMessages());
        }
      }, POLL_MS);
    });
  }

  private stopPolling(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  private scrollToEnd(): void {
    const list = this.scroller?.nativeElement;
    if (list) list.scrollTop = list.scrollHeight;
  }
}
