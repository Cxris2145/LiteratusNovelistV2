import { ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject, forkJoin } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';

import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';
import { AuthService } from '../../core/services/auth.service';
import {
  ChatUnread, CommunityMe, CommunityResult, CommunityService, FriendCard, FriendRequestItem,
  TavernChatMessage, TavernReactionItem, TavernInvitation,
} from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { AddFriendDialogComponent, AddFriendDialogData } from '../add-friend-dialog/add-friend-dialog.component';
import { BazarGesture, BazarTab, isBazarTab } from '../tavern-bazar/tavern-bazar.component';
import { SceneGuest } from '../tavern-scene/tavern-scene.component';
import { TavernTableAction } from '../tavern-table/tavern-table.types';
import { prefersReducedMotion } from '../../core/utils/motion.util';
import { listContainerMotion, listItemMotion, listItemParams, morphLayout } from '../tavern-motion';

const POLL_MS = 8000;
/** Cuántos mensajes trae el sondeo de actividad y cuántos guarda el historial de la mesa. */
const ACTIVITY_MESSAGES = 15;
const HISTORY_MESSAGES = 50;

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
 * la lista de amigos con sus solicitudes, el chat de la mesa,
 * El Bazar (?bazar=ropero|racha|perfil), donde tu Maguito se prueba la ropa en la mesa,
 * y las charlas privadas con cada amigo (?charla= para la lista, ?charla=CODIGO para una).
 */
@Component({
  selector: 'app-tavern-hall',
  templateUrl: './tavern-hall.component.html',
  styleUrls: ['../community-shared.css', './tavern-hall.component.css'],
  animations: [listItemMotion, listContainerMotion],
})
export class TavernHallComponent implements OnInit, OnDestroy {
  private community = inject(CommunityService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();
  private poll: ReturnType<typeof setInterval> | null = null;

  readonly loggedIn = this.auth.isLoggedIn();
  get isGuest(): boolean { return this.auth.isGuest(); }
  readonly demoMe = DEMO_ME;
  readonly demoGuests = DEMO_GUESTS;

  cinemaMode = false;
  /** Entrada y salida de filas (invitaciones); con "reducir movimiento", solo opacidad. */
  readonly itemMotion = listItemParams();
  /** El contador de Charlas solo salta cuando sube (un mensaje nuevo), no cuando baja. */
  chatUnreadUp = false;
  /** Amigo recién aceptado: su fila de "Mis amigos" lo celebra un momento. */
  celebrateCode: string | null = null;
  private celebrateTimer: ReturnType<typeof setTimeout> | null = null;

  /** La mesa crece desde su lugar (o vuelve) con una View Transition; sin la API, cambia directo. */
  toggleCinema(): void {
    this.setCinema(!this.cinemaMode);
  }

  private setCinema(on: boolean): void {
    if (this.cinemaMode === on) return;
    if (on && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    morphLayout(() => {
      this.cinemaMode = on;
      this.cdr.detectChanges(); // la View Transition captura el DOM ya cambiado
    });
  }

  // ── /tavern#mi-perfil ("Ver mi perfil público" del menú del avatar) ──
  @ViewChild('profileCard', { read: ElementRef }) private profileCardRef?: ElementRef<HTMLElement>;
  private wantsProfileSpotlight = false;
  profileSpotlight = false;
  private spotlightTimer: ReturnType<typeof setTimeout> | null = null;

  me: CommunityMe | null = null;
  friends: FriendCard[] = [];
  incoming: FriendRequestItem[] = [];
  outgoing: FriendRequestItem[] = [];
  sceneMe: SceneGuest | null = null;
  sceneGuests: SceneGuest[] = [];

  bazarOpen = false;
  bazarTab: BazarTab = 'ropero';
  chatOpen = false;
  chatCode = '';
  clubsOpen = false;
  activeClubId = '';
  chatUnread: ChatUnread = { total: 0, by_friend: {} };
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
  savingPrivacy = false;
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
    // ?bazar=ropero abre el Bazar, ?charla=CODIGO una charla y ?lectura=ID una lectura grupal.
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const bazar = params.get('bazar');
      if (bazar) {
        this.bazarTab = isBazarTab(bazar) ? bazar : 'ropero';
        this.bazarOpen = true;
      } else if (this.bazarOpen) {
        this.bazarOpen = false;
        this.onBazarPreview(null);
      }
      this.chatOpen = params.has('charla') && !bazar && !this.isGuest;
      this.chatCode = this.chatOpen ? (params.get('charla') || '').trim().toUpperCase() : '';
      this.clubsOpen = params.has('lectura') && !bazar && !this.chatOpen;
      this.activeClubId = this.clubsOpen ? (params.get('lectura') || '').trim() : '';
    });
    // #mi-perfil: tu tarjeta es tu perfil público; se centra y brilla un momento.
    this.route.fragment.pipe(takeUntil(this.destroy$)).subscribe(fragment => {
      if (fragment !== 'mi-perfil') return;
      this.wantsProfileSpotlight = true;
      this.spotlightProfile();
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
    if (this.poll) clearInterval(this.poll);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    if (this.spotlightTimer) clearTimeout(this.spotlightTimer);
    if (this.celebrateTimer) clearTimeout(this.celebrateTimer);
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
      activity: this.community.getActivity(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        this.me = data.me;
        this.setFriends(data.friends.results);
        this.incoming = data.requests.incoming;
        this.outgoing = data.requests.outgoing;
        this.mergeMessages(data.activity.messages, ACTIVITY_MESSAGES);
        this.recentReactions = data.activity.reactions;
        this.setInvitations(data.activity.invitations);
        this.setChatUnread(data.activity.chat_unread);
        this.loading = false;
        this.spotlightProfile();
      },
      error: () => {
        this.loading = false;
        this.error = 'No pudimos abrir la taberna. Revisa tu conexión e inténtalo de nuevo.';
      },
    });
  }

  /** Espera a tener tu perfil cargado; luego quita el #mi-perfil para que el menú pueda volver a pedirlo. */
  private spotlightProfile(): void {
    if (!this.wantsProfileSpotlight || !this.me) return;
    this.wantsProfileSpotlight = false;
    this.cinemaMode = false;
    this.router.navigate([], { relativeTo: this.route, queryParamsHandling: 'preserve', replaceUrl: true });
    this.profileSpotlight = false;
    if (this.spotlightTimer) clearTimeout(this.spotlightTimer);
    // Un cuadro después: la tarjeta ya se ve (sin modo cine) y la clase vuelve a disparar la animación.
    requestAnimationFrame(() => {
      this.profileCardRef?.nativeElement.scrollIntoView({
        block: 'center',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      this.profileSpotlight = true;
      this.spotlightTimer = setTimeout(() => {
        this.profileSpotlight = false;
        this.spotlightTimer = null;
      }, 1700);
    });
  }

  /** Interruptor de la tarjeta: cambia al instante y vuelve atrás si no se pudo guardar. */
  setPrivacy(isPublic: boolean): void {
    if (!this.me || this.savingPrivacy) return;
    const previous = this.me.is_public;
    this.me = { ...this.me, is_public: isPublic };
    this.savingPrivacy = true;
    this.community.setProfileVisibility(isPublic).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.savingPrivacy = false;
        this.notification.success(isPublic
          ? 'Tu perfil ahora es público: otros lectores pueden verlo y encontrarte.'
          : 'Tu perfil ahora es privado: solo tus amigos ven tu tarjeta.', 'Taberna');
      },
      error: () => {
        this.savingPrivacy = false;
        if (this.me) this.me = { ...this.me, is_public: previous };
        this.notification.error('No pudimos guardar la privacidad de tu perfil.', 'Taberna');
      },
    });
  }

  openAddFriend(): void {
    if (this.isGuest) {
      this.notification.info('Inicia sesión o crea tu cuenta para agregar amigos.', 'Taberna');
      return;
    }
    this.dialog.open<AddFriendDialogComponent, AddFriendDialogData>(AddFriendDialogComponent, {
      data: { myCode: this.me?.friend_code ?? null },
      panelClass: ['th-dialog-panel', 'af-dialog-panel'],
      width: '580px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: 'calc(100dvh - 32px)',
      ariaLabelledBy: 'af-title',
      ariaDescribedBy: 'af-description',
      enterAnimationDuration: prefersReducedMotion() ? 0 : 180,
      exitAnimationDuration: prefersReducedMotion() ? 0 : 120,
      autoFocus: '#af-query',
    });
  }

  async openTableAction(action: TavernTableAction): Promise<void> {
    if (!this.loggedIn) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/tavern' } });
      return;
    }
    if (this.tableOpening || this.dialog.openDialogs.length) return;
    this.tableOpening = true;
    try {
      const { TavernTableDialogComponent } = await import('../tavern-table-dialog/tavern-table-dialog.component');
      if (this.destroy$.isStopped) return;
      this.dialog.open(TavernTableDialogComponent, {
        data: { action, friends: this.friends, outgoing: this.outgoingInvitations, myCode: this.me?.friend_code ?? null },
        panelClass: 'th-dialog-panel', width: '600px', maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'calc(100dvh - 32px)',
        autoFocus: 'dialog', restoreFocus: true,
        enterAnimationDuration: prefersReducedMotion() ? 0 : 200,
        exitAnimationDuration: prefersReducedMotion() ? 0 : 140,
      }).afterClosed().pipe(takeUntil(this.destroy$)).subscribe(result => {
        if (result?.message) this.messages = [result.message, ...this.messages];
        if (result?.addFriend) this.openAddFriend();
        if (result?.openClubs) this.openClubs();
        if (result?.toast) { this.animateToast(); this.onSendReaction('🍺'); this.loadAll(); }
        else this.refreshLive();
      });
    } catch {
      if (!this.destroy$.isStopped) this.notification.error('No pudimos abrir este objeto. Inténtalo de nuevo.', 'Taberna');
    } finally {
      this.tableOpening = false;
    }
  }

  // ── Charlas privadas ──────────────────────────────────────

  /** Abre la lista de charlas o, con código, la conversación con ese amigo. Cierra El Bazar y Lecturas. */
  openChat(code = ''): void {
    if (!this.loggedIn) return;
    if (this.isGuest) {
      this.notification.info('Inicia sesión con tu cuenta para usar las charlas privadas con amigos.', 'Taberna');
      return;
    }
    if (this.bazarOpen) { this.bazarOpen = false; this.onBazarPreview(null); }
    this.clubsOpen = false;
    this.activeClubId = '';
    this.chatOpen = true;
    this.chatCode = code;
    this.syncPanelsUrl();
  }

  closeChat(): void {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    this.chatCode = '';
    this.syncPanelsUrl();
    this.refreshLive(); // los no leídos cambian al leer
  }

  // ── Lecturas conjuntas ────────────────────────────────────

  openClubs(clubId = ''): void {
    if (!this.loggedIn) return;
    if (this.bazarOpen) { this.bazarOpen = false; this.onBazarPreview(null); }
    this.chatOpen = false;
    this.chatCode = '';
    this.clubsOpen = true;
    this.activeClubId = clubId;
    this.syncPanelsUrl();
  }

  closeClubs(): void {
    if (!this.clubsOpen) return;
    this.clubsOpen = false;
    this.activeClubId = '';
    this.syncPanelsUrl();
  }

  // ── El Bazar ──────────────────────────────────────────────

  openBazar(tab: BazarTab = this.bazarTab): void {
    if (!this.loggedIn) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/tavern?bazar=' + tab } });
      return;
    }
    this.chatOpen = false;
    this.chatCode = '';
    this.clubsOpen = false;
    this.activeClubId = '';
    this.bazarTab = tab;
    this.bazarOpen = true;
    this.syncPanelsUrl();
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
    this.syncPanelsUrl();
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
      this.setCinema(false);
      return;
    }
    if (this.dialog.openDialogs.length) return;
    if (this.chatOpen) this.closeChat();
    else if (this.clubsOpen) this.closeClubs();
    else if (this.bazarOpen) this.closeBazar();
  }

  /** El Bazar, las charlas y las lecturas viven en la URL (?bazar= / ?charla= / ?lectura=); nunca dos a la vez. */
  private syncPanelsUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        bazar: this.bazarOpen ? this.bazarTab : null,
        charla: this.chatOpen ? this.chatCode : null,
        lectura: this.clubsOpen ? this.activeClubId : null,
      },
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
    this.run(request.id, this.community.accept(request.id), noticeId => this.celebrateAfter(noticeId, request.user.friend_code));
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

  /** Se abrió la conversación de la mesa: trae los últimos 50 mensajes. */
  onHistoryOpen(): void {
    if (!this.loggedIn) return;
    this.community.getMessages(HISTORY_MESSAGES).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => this.mergeMessages(res.results, HISTORY_MESSAGES),
      error: () => this.notification.error('No pudimos traer la conversación de la mesa.', 'Taberna'),
    });
  }

  onDeleteMessage(id: string): void {
    this.community.deleteMessage(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.messages = this.messages.filter(message => message.id !== id),
      error: err => this.notification.error(err.error?.message || 'No se pudo borrar el mensaje.', 'Taberna'),
    });
  }

  /**
   * Junta lo recién llegado (los `requested` más nuevos) con lo que ya había. Lo que el
   * servidor ya no devuelve dentro de ese tramo se borró; lo más antiguo se conserva.
   */
  private mergeMessages(fresh: TavernChatMessage[], requested: number): void {
    if (fresh.length < requested) {
      this.messages = fresh;
      return;
    }
    const oldest = Math.min(...fresh.map(message => Date.parse(message.created_at)));
    const ids = new Set(fresh.map(message => message.id));
    const older = this.messages.filter(message => !ids.has(message.id) && Date.parse(message.created_at) < oldest);
    this.messages = [...fresh, ...older].slice(0, HISTORY_MESSAGES);
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

  private run(key: string, request: Observable<CommunityResult>, done?: (noticeId?: string) => void): void {
    if (this.busy) return;
    this.busy = key;
    request.subscribe({
      next: result => {
        this.busy = null;
        const noticeId = result.message ? this.notification.success(result.message, 'Taberna') : undefined;
        done?.(noticeId);
        this.loadAll();
      },
      error: err => {
        this.busy = null;
        this.notification.error(err.error?.message || 'No se pudo completar la acción. Inténtalo de nuevo.', 'Taberna');
        this.loadAll();
      },
    });
  }

  private setChatUnread(next: ChatUnread | undefined): void {
    if (!next) return;
    this.chatUnreadUp = next.total > this.chatUnread.total;
    this.chatUnread = next;
  }

  /**
   * El aviso de éxito tapa la pantalla: la celebración espera a que se cierre, así se ve
   * la fila del amigo nuevo brillar en vez de ocurrir detrás del aviso.
   */
  private celebrateAfter(noticeId: string | undefined, code: string): void {
    if (!noticeId) {
      this.celebrate(code);
      return;
    }
    this.notification.notifications$.pipe(
      filter(list => !list.some(notice => notice.id === noticeId)),
      take(1),
      takeUntil(this.destroy$),
    ).subscribe(() => this.celebrate(code));
  }

  /** Momento raro: la fila del amigo nuevo brilla y su Maguito salta (ver friend-list). */
  private celebrate(code: string): void {
    this.celebrateCode = code;
    if (this.celebrateTimer) clearTimeout(this.celebrateTimer);
    this.celebrateTimer = setTimeout(() => this.celebrateCode = null, 2500);
  }

  trackInvitation = (_: number, invitation: TavernInvitation) => invitation.id;

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
        this.mergeMessages(data.activity.messages, ACTIVITY_MESSAGES);
        this.recentReactions = data.activity.reactions;
        this.setInvitations(data.activity.invitations);
        this.setChatUnread(data.activity.chat_unread);
        if (this.me) this.me = { ...this.me, pending_incoming: data.presence.pending_incoming };
      },
      error: () => {},
    });
  }

  /** Al volver a la pestaña: lo de la mesa y tu tarjeta (libros o reseñas nuevas de otra página). */
  private onVisibility = () => {
    if (document.hidden) return;
    this.zone.run(() => {
      this.refreshLive();
      this.community.me().pipe(takeUntil(this.destroy$)).subscribe({
        next: me => { this.me = me; this.updateSceneMe(); },
        error: () => {},
      });
    });
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
}
