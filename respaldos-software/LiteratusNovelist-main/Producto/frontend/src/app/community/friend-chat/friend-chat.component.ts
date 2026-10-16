import {
  Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject,
} from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import {
  ChatThread, ChatUnread, CommunityService, FriendCard, FriendChatMessage,
} from '../../core/services/community.service';
import { clockTime, dayLabel, timeAgo } from '../time-ago.util';

const POLL_MS = 4000;
export const CHAT_MAX_LENGTH = 500;

type ChatRow = { kind: 'day'; key: string; label: string } | { kind: 'message'; key: string; message: FriendChatMessage };

/**
 * Charlas privadas con los amigos, en un panel lateral de La Taberna (una hoja que sube en el
 * celular). Sin código muestra la lista de charlas; con código, la conversación con ese amigo,
 * que se actualiza cada pocos segundos mientras está abierta. Los mensajes se guardan.
 */
@Component({
  selector: 'app-friend-chat',
  templateUrl: './friend-chat.component.html',
  styleUrls: ['../community-shared.css', './friend-chat.component.css'],
})
export class FriendChatComponent implements OnChanges, OnDestroy {
  private community = inject(CommunityService);
  private zone = inject(NgZone);
  private destroy$ = new Subject<void>();

  @Input() open = false;
  /** Código del amigo con quien se conversa; vacío = la lista de charlas. */
  @Input() code = '';
  @Input() friends: FriendCard[] = [];
  @Input() unread: ChatUnread | null = null;
  @Output() closed = new EventEmitter<void>();
  /** Elegir una charla (código) o volver a la lista (''). No se llama `select`: chocaría con el evento nativo. */
  @Output() threadChange = new EventEmitter<string>();

  @ViewChild('heading') private heading?: ElementRef<HTMLElement>;
  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;
  @ViewChild('composer') private composer?: ElementRef<HTMLTextAreaElement>;

  readonly maxLength = CHAT_MAX_LENGTH;
  readonly timeAgo = timeAgo;
  readonly clockTime = clockTime;

  threads: ChatThread[] = [];
  threadsLoading = false;
  messages: FriendChatMessage[] = [];
  rows: ChatRow[] = [];
  loading = false;
  error = '';
  draft = '';
  sending = false;

  private poll: ReturnType<typeof setInterval> | null = null;
  private request?: Subscription;
  private returnFocus: HTMLElement | null = null;

  get friend(): FriendCard | null {
    return this.friends.find(friend => friend.friend_code === this.code) ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setTimeout(() => this.focusStart(), 60);
      } else if (!changes['open'].firstChange) {
        this.stopPolling();
        this.restoreFocus();
      }
    }
    if ((changes['open'] || changes['code']) && this.open) {
      this.error = '';
      this.draft = '';
      if (this.code) this.openThread();
      else { this.stopPolling(); this.loadThreads(); }
      if (changes['code'] && !changes['code'].firstChange) setTimeout(() => this.focusStart(), 60);
    }
    // Llegó algo nuevo a la lista mientras está a la vista.
    if (changes['unread'] && !changes['unread'].firstChange && this.open && !this.code
        && changes['unread'].previousValue?.total !== this.unread?.total) {
      this.loadThreads(true);
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

  back(): void {
    this.threadChange.emit('');
  }

  openFriend(code: string): void {
    this.threadChange.emit(code);
  }

  trackThread = (_: number, thread: ChatThread) => thread.friend_code;
  trackRow = (_: number, row: ChatRow) => row.key;

  onComposerKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const content = this.draft.trim();
    if (!content || this.sending || !this.code) return;
    this.sending = true;
    this.error = '';
    const code = this.code;
    this.community.sendChatMessage(code, content).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.sending = false;
        if (code !== this.code) return;
        this.draft = '';
        this.append([res.item], true);
        setTimeout(() => this.composer?.nativeElement.focus());
      },
      error: err => {
        this.sending = false;
        this.error = err.error?.message || 'No se pudo enviar el mensaje. Inténtalo de nuevo.';
      },
    });
  }

  private loadThreads(quiet = false): void {
    if (!quiet) this.threadsLoading = true;
    this.request?.unsubscribe();
    this.request = this.community.chatThreads().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => { this.threads = data.threads; this.threadsLoading = false; },
      error: () => {
        this.threadsLoading = false;
        if (!quiet) this.error = 'No pudimos traer tus charlas.';
      },
    });
  }

  private openThread(): void {
    this.stopPolling();
    this.messages = [];
    this.rows = [];
    this.loading = true;
    const code = this.code;
    this.request?.unsubscribe();
    this.request = this.community.chatMessages(code).pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        if (code !== this.code) return;
        this.loading = false;
        this.messages = [];
        this.append(data.messages, true);
        this.startPolling();
      },
      error: err => {
        if (code !== this.code) return;
        this.loading = false;
        this.error = err.status === 403
          ? 'Solo puedes conversar con tus amigos.'
          : 'No pudimos abrir esta charla. Revisa tu conexión.';
      },
    });
  }

  private refreshThread(): void {
    const code = this.code;
    const last = this.messages[this.messages.length - 1]?.id;
    this.community.chatMessages(code, last).pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        if (code !== this.code || !this.open) return;
        if (data.incremental) this.append(data.messages, false);
        else { this.messages = []; this.append(data.messages, false); } // el último ya no existe: se recarga
      },
      error: () => {},
    });
  }

  private append(incoming: FriendChatMessage[], forceScroll: boolean): void {
    const known = new Set(this.messages.map(message => message.id));
    const fresh = incoming.filter(message => !known.has(message.id));
    if (!fresh.length && this.rows.length) return;
    const list = this.scroller?.nativeElement;
    const nearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    this.messages = [...this.messages, ...fresh];
    this.rows = this.buildRows(this.messages);
    if (forceScroll || nearBottom) setTimeout(() => this.scrollToEnd());
  }

  private buildRows(messages: FriendChatMessage[]): ChatRow[] {
    const rows: ChatRow[] = [];
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
        if (!document.hidden && this.open && this.code) this.zone.run(() => this.refreshThread());
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

  private focusStart(): void {
    if (!this.open) return;
    if (this.code && this.composer) this.composer.nativeElement.focus({ preventScroll: true });
    else this.heading?.nativeElement.focus({ preventScroll: true });
  }

  private restoreFocus(): void {
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) setTimeout(() => target.focus({ preventScroll: true }));
  }
}
