import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { AuthService } from '../../core/services/auth.service';
import {
  CommunityMe, CommunityResult, CommunityService, FriendCard, FriendRequestItem, Ranking, RankingScope,
  TavernChatMessage, TavernReactionItem,
} from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { AddFriendDialogComponent, AddFriendDialogData } from '../add-friend-dialog/add-friend-dialog.component';
import { SceneGuest } from '../tavern-scene/tavern-scene.component';

const POLL_MS = 8000;

/** Mesa de ejemplo para quien visita sin sesión, idéntica a la maqueta. */
const DEMO_ME: SceneGuest = {
  code: 'demo-me',
  username: 'Maguito',
  outfit: { head: 'aviator', cape: 'red' },
  level: 12,
};
const DEMO_GUESTS: SceneGuest[] = [
  {
    code: 'demo-amigo',
    username: 'Amigo de Maguito',
    outfit: { head: 'wizard', face: 'beard' },
    status: { kind: 'tavern', label: 'En la taberna', book_title: null },
    level: 9,
  },
  {
    code: 'demo-tercer',
    username: 'Tercer amigo de Maguito',
    outfit: { head: 'witch-flower' },
    status: { kind: 'tavern', label: 'En la taberna', book_title: null },
    level: 6,
  },
  {
    code: 'demo-luna',
    username: 'LunaEscribe',
    outfit: { head: 'beret', neck: 'scarf-red' },
    status: { kind: 'reading', label: 'Leyendo · Capítulo 4', book_title: 'Rayuela' },
    level: 8,
  },
];

/**
 * La Taberna de Tinta (/tavern): tu Maguito a la mesa con tus amigos, tu perfil,
 * la lista de amigos con sus solicitudes, el chat social en tiempo real y el ranking.
 */
@Component({
  selector: 'app-tavern-hall',
  templateUrl: './tavern-hall.component.html',
  styleUrls: ['../community-shared.css', './tavern-hall.component.css'],
})
export class TavernHallComponent implements OnInit, OnDestroy {
  private community = inject(CommunityService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);
  private destroy$ = new Subject<void>();
  private poll: ReturnType<typeof setInterval> | null = null;

  readonly loggedIn = this.auth.isLoggedIn();
  readonly demoMe = DEMO_ME;
  readonly demoGuests = DEMO_GUESTS;

  me: CommunityMe | null = null;
  friends: FriendCard[] = [];
  incoming: FriendRequestItem[] = [];
  outgoing: FriendRequestItem[] = [];
  ranking: Ranking | null = null;
  scope: RankingScope = 'week';
  weeklyLeader = false;
  topRankUsername: string | null = null;
  sceneMe: SceneGuest | null = null;
  sceneGuests: SceneGuest[] = [];

  messages: TavernChatMessage[] = [];
  recentReactions: TavernReactionItem[] = [];
  toasting = false;

  loading = true;
  rankingLoading = false;
  error = '';
  busy: string | null = null;

  ngOnInit(): void {
    const paypal = this.route.snapshot.queryParamMap.get('paypal');
    if (paypal) {
      this.router.navigate(['/tavern/tienda'], { queryParams: { paypal }, replaceUrl: true });
      return;
    }
    if (!this.loggedIn) {
      this.loading = false;
      return;
    }
    this.loadAll();
    this.community.changed$.pipe(takeUntil(this.destroy$)).subscribe(() => this.loadAll());
    this.zone.runOutsideAngular(() => {
      this.poll = setInterval(() => {
        if (!document.hidden) this.zone.run(() => this.refreshLive());
      }, POLL_MS);
    });
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.error = '';
    forkJoin({
      presence: this.community.heartbeat(),
      me: this.community.me(),
      friends: this.community.friends(),
      requests: this.community.requests(),
      ranking: this.community.ranking(this.scope),
      activity: this.community.getActivity(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        this.me = data.me;
        this.setFriends(data.friends.results);
        this.incoming = data.requests.incoming;
        this.outgoing = data.requests.outgoing;
        this.setRanking(data.ranking);
        this.messages = data.activity.messages;
        this.recentReactions = data.activity.reactions;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = 'No pudimos abrir la taberna. Revisa tu conexión e inténtalo de nuevo.';
      },
    });
  }

  changeScope(scope: RankingScope): void {
    this.scope = scope;
    this.rankingLoading = true;
    this.community.ranking(scope).pipe(takeUntil(this.destroy$)).subscribe({
      next: ranking => { this.setRanking(ranking); this.rankingLoading = false; },
      error: () => { this.rankingLoading = false; },
    });
  }

  openAddFriend(): void {
    this.dialog.open<AddFriendDialogComponent, AddFriendDialogData>(AddFriendDialogComponent, {
      data: { myCode: this.me?.friend_code ?? null },
      panelClass: 'th-dialog-panel',
      maxWidth: '100vw',
      autoFocus: '#af-query',
    });
  }

  accept(request: FriendRequestItem): void {
    this.run(request.id, this.community.accept(request.id));
  }

  decline(request: FriendRequestItem): void {
    this.run(request.id, this.community.decline(request.id));
  }

  cancel(request: FriendRequestItem): void {
    this.run(request.id, this.community.cancel(request.id));
  }

  toggleBrindis(friend: FriendCard): void {
    const request = friend.brindis_given
      ? this.community.removeBrindis(friend.friend_code)
      : this.community.giveBrindis(friend.friend_code);
    this.run(friend.friend_code, request);
    if (!friend.brindis_given) {
      this.toasting = true;
      setTimeout(() => this.toasting = false, 2000);
    }
  }

  remove(friend: FriendCard): void {
    this.run(friend.friend_code, this.community.unfriend(friend.friend_code));
  }

  onSendMessage(content: string): void {
    this.community.sendMessage(content).subscribe({
      next: res => {
        if (res.message) {
          this.messages = [res.message, ...this.messages];
        }
      },
      error: err => {
        this.notification.error(err.error?.message || 'No se pudo enviar el mensaje.', 'Taberna');
      },
    });
  }

  onSendReaction(reaction: string): void {
    this.community.sendReaction(reaction).subscribe({
      next: () => {
        if (reaction === '🍺') {
          this.toasting = true;
          setTimeout(() => this.toasting = false, 2000);
        }
      },
      error: () => {},
    });
  }

  private run(key: string, request: Observable<CommunityResult>): void {
    if (this.busy) return;
    this.busy = key;
    request.subscribe({
      next: result => {
        this.busy = null;
        if (result.message) this.notification.success(result.message, 'Taberna');
        this.loadAll();
      },
      error: err => {
        this.busy = null;
        this.notification.error(err.error?.message || 'No se pudo completar la acción. Inténtalo de nuevo.', 'Taberna');
        this.loadAll();
      },
    });
  }

  private refreshLive(): void {
    forkJoin({
      presence: this.community.heartbeat(),
      friends: this.community.friends(),
      requests: this.community.requests(),
      activity: this.community.getActivity(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        this.setFriends(data.friends.results);
        this.incoming = data.requests.incoming;
        this.outgoing = data.requests.outgoing;
        this.messages = data.activity.messages;
        this.recentReactions = data.activity.reactions;
        if (this.me) this.me = { ...this.me, pending_incoming: data.presence.pending_incoming };
      },
      error: () => {},
    });
  }

  private onVisibility = () => {
    if (!document.hidden) this.zone.run(() => this.refreshLive());
  };

  private setFriends(friends: FriendCard[]): void {
    this.friends = friends;
    this.sceneGuests = friends.map(f => ({
      code: f.friend_code, username: f.username, outfit: f.outfit, status: f.status, level: f.level,
    }));
    if (this.me) {
      this.sceneMe = { code: this.me.friend_code, username: this.me.username, outfit: this.me.outfit, level: this.me.level };
    }
  }

  private setRanking(ranking: Ranking): void {
    this.ranking = ranking;
    if (ranking.entries.length) {
      this.topRankUsername = ranking.entries[0].username;
    }
    if (ranking.scope === 'week') {
      const leader = ranking.entries[0];
      this.weeklyLeader = !!leader && leader.is_me && leader.points > 0 && ranking.participants > 1;
    }
  }
}
