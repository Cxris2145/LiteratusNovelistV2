import { Component, HostListener, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';
import { AuthService } from '../../core/services/auth.service';
import {
  CommunityMe, CommunityResult, CommunityService, FriendCard, FriendRequestItem, Ranking, RankingScope,
  TavernChatMessage, TavernReactionItem, TavernInvitation,
} from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { AddFriendDialogComponent, AddFriendDialogData } from '../add-friend-dialog/add-friend-dialog.component';
import { BazarGesture, BazarTab, isBazarTab } from '../tavern-bazar/tavern-bazar.component';
import { SceneGuest } from '../tavern-scene/tavern-scene.component';
import { TavernTableAction } from '../tavern-table/tavern-table.types';
import { TavernAudioService } from '../../core/services/tavern-audio.service';

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
 * la lista de amigos con sus solicitudes, el chat social en tiempo real, el ranking
 * y El Bazar (?bazar=ropero|racha|perfil), donde tu Maguito se prueba la ropa en la mesa.
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
  private audio = inject(TavernAudioService);
  private zone = inject(NgZone);
  private destroy$ = new Subject<void>();
  private poll: ReturnType<typeof setInterval> | null = null;

  readonly loggedIn = this.auth.isLoggedIn();
  readonly demoMe = DEMO_ME;
  readonly demoGuests = DEMO_GUESTS;

  cinemaMode = false;

  get audioPlaying(): boolean {
    return this.audio.playing;
  }

  /** El ícono y su aria-pressed ya muestran el estado: no hace falta un aviso. */
  toggleAudio(): void {
    this.audio.toggle();
  }

  toggleCinema(): void {
    this.cinemaMode = !this.cinemaMode;
  }

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

  bazarOpen = false;
  bazarTab: BazarTab = 'ropero';
  /** Lo que se prueba en el Bazar; null = la ropa que lleva puesta. */
  private fittingOutfit: MaguitoOutfit | null = null;
  fittingTick = 0;
  fittingGesture: BazarGesture = 'try';

  messages: TavernChatMessage[] = [];
  recentReactions: TavernReactionItem[] = [];
  toasting = false;
  invitations: TavernInvitation[] = [];
  outgoingInvitations: TavernInvitation[] = [];
  invitationBusy = '';
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private tableOpening = false;

  loading = true;
  rankingLoading = false;
  error = '';
  busy: string | null = null;

  ngOnInit(): void {
    const paypal = this.route.snapshot.queryParamMap.get('paypal');
    if (paypal) {
      this.router.navigate(['/planes'], { queryParams: { paypal }, replaceUrl: true });
      return;
    }
    if (!this.loggedIn) {
      this.loading = false;
      return;
    }
    // ?bazar=ropero abre el Bazar (también si llega estando ya en la taberna).
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const bazar = params.get('bazar');
      if (bazar) {
        this.bazarTab = isBazarTab(bazar) ? bazar : 'ropero';
        this.bazarOpen = true;
      } else if (this.bazarOpen) {
        this.bazarOpen = false;
        this.onBazarPreview(null);
      }
    });
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
    this.audio.stop();
    if (this.poll) clearInterval(this.poll);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
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
        this.setInvitations(data.activity.invitations);
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

  async openTableAction(action: TavernTableAction): Promise<void> {
    if (!this.loggedIn) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/tavern' } });
      return;
    }
    if (action === 'cat' || action === 'potions') {
      return;
    }
    if (action === 'hourglass') {
      this.notification.info('El reloj de arena mide el flujo de tus momentos dedicados a la lectura.', 'Tiempo en la Taberna');
      return;
    }
    if (this.tableOpening || this.dialog.openDialogs.length) return;
    this.tableOpening = true;
    try {
      const { TavernTableDialogComponent } = await import('../tavern-table-dialog/tavern-table-dialog.component');
      if (this.destroy$.isStopped) return;
      this.dialog.open(TavernTableDialogComponent, {
        data: { action, friends: this.friends, outgoing: this.outgoingInvitations },
        panelClass: 'th-dialog-panel', width: '580px', maxWidth: 'calc(100vw - 24px)',
        autoFocus: 'first-tabbable', restoreFocus: true,
      }).afterClosed().pipe(takeUntil(this.destroy$)).subscribe(result => {
        if (result?.message) this.messages = [result.message, ...this.messages];
        if (result?.addFriend) this.openAddFriend();
        if (result?.toast) { this.animateToast(); this.onSendReaction('🍺'); this.loadAll(); }
        else this.refreshLive();
      });
    } catch {
      if (!this.destroy$.isStopped) this.notification.error('No pudimos abrir este objeto. Inténtalo de nuevo.', 'Taberna');
    } finally {
      this.tableOpening = false;
    }
  }

  // ── El Bazar ──────────────────────────────────────────────

  openBazar(tab: BazarTab = this.bazarTab): void {
    if (!this.loggedIn) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/tavern?bazar=' + tab } });
      return;
    }
    this.bazarTab = tab;
    this.bazarOpen = true;
    this.syncBazarUrl();
    // En escritorio la mesa es el espejo: si quedó fuera de vista, vuelve a ella.
    const scene = document.querySelector('app-tavern-scene');
    if (scene && matchMedia('(min-width: 1001px)').matches && scene.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  closeBazar(): void {
    if (!this.bazarOpen) return;
    this.bazarOpen = false;
    this.onBazarPreview(null);
    this.syncBazarUrl();
  }

  onBazarPreview(outfit: MaguitoOutfit | null): void {
    this.fittingOutfit = outfit;
    this.updateSceneMe();
  }

  onBazarGesture(gesture: BazarGesture): void {
    this.fittingGesture = gesture;
    this.fittingTick++;
  }

  /** Ropa guardada en el Bazar: el perfil y la mesa la reflejan sin recargar. */
  onOutfitChange(outfit: MaguitoOutfit): void {
    if (this.me) this.me = { ...this.me, outfit };
    this.updateSceneMe();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.cinemaMode) {
      this.cinemaMode = false;
      return;
    }
    if (this.bazarOpen && !this.dialog.openDialogs.length) this.closeBazar();
  }

  private syncBazarUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { bazar: this.bazarOpen ? this.bazarTab : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private updateSceneMe(): void {
    if (!this.me) return;
    this.sceneMe = {
      code: this.me.friend_code, username: this.me.username, level: this.me.level,
      outfit: this.fittingOutfit ?? this.me.outfit,
    };
  }

  respondToInvitation(invitation: TavernInvitation, action: 'accept' | 'decline'): void {
    if (this.invitationBusy) return;
    this.invitationBusy = invitation.id;
    this.community.respondToInvitation(invitation.id, action).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.invitationBusy = '';
        this.invitations = this.invitations.filter(item => item.id !== invitation.id);
        if (action === 'accept') { this.animateToast(); this.onSendReaction('🍺'); }
        this.notification.success(result.message, 'Taberna');
        this.refreshLive();
      },
      error: err => {
        this.invitationBusy = '';
        this.notification.error(err.error?.message || 'No pudimos responder a la invitación.', 'Taberna');
        this.refreshLive();
      },
    });
  }

  openGuest(guest: SceneGuest): void {
    this.router.navigate(guest.code === this.me?.friend_code ? ['/profile'] : ['/tavern/amigo', guest.code]);
  }

  private animateToast(): void {
    this.toasting = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toasting = false, 2200);
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
      this.animateToast();
    }
  }

  remove(friend: FriendCard): void {
    this.run(friend.friend_code, this.community.unfriend(friend.friend_code));
  }

  onSendMessage(content: string): void {
    if (!this.loggedIn) return;
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
    if (!this.loggedIn) return;
    this.community.sendReaction(reaction).subscribe({
      next: () => {
        if (reaction === '🍺') {
          this.animateToast();
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
        this.setInvitations(data.activity.invitations);
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
    this.sceneGuests = friends.filter(f => f.status.kind === 'tavern').sort((a, b) => a.friend_code.localeCompare(b.friend_code)).map(f => ({
      code: f.friend_code, username: f.username, outfit: f.outfit, status: f.status, level: f.level,
    }));
    this.updateSceneMe();
  }

  private setInvitations(invitations?: { incoming: TavernInvitation[]; outgoing: TavernInvitation[] }): void {
    this.invitations = invitations?.incoming ?? [];
    this.outgoingInvitations = invitations?.outgoing ?? [];
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
