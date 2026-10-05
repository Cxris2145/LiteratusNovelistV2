import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { AuthService } from '../../core/services/auth.service';
import {
  CommunityMe, CommunityResult, CommunityService, FriendCard, FriendRequestItem, Ranking, RankingScope,
} from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { AddFriendDialogComponent, AddFriendDialogData } from '../add-friend-dialog/add-friend-dialog.component';
import { SceneGuest } from '../tavern-scene/tavern-scene.component';

const POLL_MS = 60000;

/** Mesa de ejemplo para quien visita sin sesión. */
const DEMO_ME: SceneGuest = { code: 'demo-me', username: 'Tu Maguito', outfit: {} };
const DEMO_GUESTS: SceneGuest[] = [
  { code: 'demo-luna', username: 'LunaEscribe', outfit: { head: 'beret', neck: 'scarf-red' },
    status: { kind: 'reading', label: 'Leyendo · Rayuela', book_title: 'Rayuela' } },
  { code: 'demo-pluma', username: 'SirPluma', outfit: { head: 'tophat', eyes: 'monocle', face: 'mustache' },
    status: { kind: 'tavern', label: 'En la taberna', book_title: null }, level: 7 },
  { code: 'demo-sabio', username: 'ElSabio', outfit: { face: 'beard', eyes: 'halfmoon', cape: 'royal' },
    status: { kind: 'tavern', label: 'En la taberna', book_title: null } },
];

/**
 * La Taberna de Tinta (/tavern): tu Maguito a la mesa con tus amigos, tu perfil,
 * la lista de amigos con sus solicitudes y el ranking. La tienda vive en /tavern/tienda.
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
  sceneMe: SceneGuest | null = null;
  sceneGuests: SceneGuest[] = [];

  loading = true;
  rankingLoading = false;
  error = '';
  /** Id de solicitud o código de amigo con una acción en curso. */
  busy: string | null = null;

  ngOnInit(): void {
    // Antes la página de planes vivía aquí: PayPal todavía puede volver a /tavern?paypal=…
    const paypal = this.route.snapshot.queryParamMap.get('paypal');
    if (paypal) {
      this.router.navigate(['/tavern/tienda'], { queryParams: { paypal }, replaceUrl: true });
      return;
    }
    // Sin sesión no se llama a la API: un 401 mandaría al visitante a /login.
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
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        this.me = data.me;
        this.setFriends(data.friends.results);
        this.incoming = data.requests.incoming;
        this.outgoing = data.requests.outgoing;
        this.setRanking(data.ranking);
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
  }

  remove(friend: FriendCard): void {
    this.run(friend.friend_code, this.community.unfriend(friend.friend_code));
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

  /** Latido + amigos + solicitudes: lo que cambia mientras la página está abierta. */
  private refreshLive(): void {
    forkJoin({
      presence: this.community.heartbeat(),
      friends: this.community.friends(),
      requests: this.community.requests(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        this.setFriends(data.friends.results);
        this.incoming = data.requests.incoming;
        this.outgoing = data.requests.outgoing;
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
    if (ranking.scope === 'week') {
      const leader = ranking.entries[0];
      this.weeklyLeader = !!leader && leader.is_me && leader.points > 0 && ranking.participants > 1;
    }
  }
}
