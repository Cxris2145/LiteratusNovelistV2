import { Component, ComponentRef, ElementRef, inject, NgZone, OnInit, HostListener, ViewChild, ViewContainerRef } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { ApiService } from './core/services/api.service';
import { AuthService, userStorageKey } from './core/services/auth.service';
import { ChatService } from './core/services/chat.service';
import { filter } from 'rxjs/operators';
import { routeTransitionAnimations, shakeAnimation } from './core/animations';
import { App as CapacitorApp } from '@capacitor/app';
import { Location } from '@angular/common';

import { APP_THEMES, SettingsService } from './core/services/settings.service';
import { copyText } from './community/clipboard.util';
import { environment } from '../environments/environment';
import { FavoritesService } from './core/services/favorites.service';
import { GamificationService, GamificationNotification } from './core/services/gamification.service';
import { AchievementsService } from './core/services/achievements.service';
import { NotificationService, AppNotification } from './core/services/notification.service';
import { MatDialog } from '@angular/material/dialog';
import { GuideDialogComponent } from './core/components/guide-dialog/guide-dialog.component';
import { QUICK_GENRES } from './core/components/main-nav/nav-genres';
import { firstTimeThisSession } from './core/components/main-nav/main-nav.component';
import { watchKeyboard } from './core/utils/keyboard-inset.util';
import { CharacterChatService } from './core/services/character-chat.service';
import { ScrollRevealService } from './core/services/scroll-reveal.service';
import { NotebookService } from './notebook/notebook.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  animations: [routeTransitionAnimations, shakeAnimation]
})
export class AppComponent implements OnInit {
  title = 'frontend';
  apiService = inject(ApiService);
  authService = inject(AuthService);
  chatService = inject(ChatService);
  settingsService = inject(SettingsService);
  favoritesService = inject(FavoritesService);
  gamificationService = inject(GamificationService);
  achievementsService = inject(AchievementsService);
  notificationService = inject(NotificationService);
  dialog = inject(MatDialog);
  router = inject(Router);

  isDashboard = false;
  isEnigma = false;
  isTavernHall = /^\/tavern\/?(?:[?#]|$)/.test(this.router.url);
  /** Partida de La Senda en modo concentración: sin header ni asistente (tapaba la bandeja). */
  isPlayingLevel = false;
  isNavBubblesHidden = false;

  // ── Encabezado que se esconde al bajar (celular) ──
  private readonly zone = inject(NgZone);
  private readonly hostEl: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private headerEl: HTMLElement | null = null;
  private headerObserver: ResizeObserver | null = null;
  private headerMeasureFrame: number | null = null;
  private headerHidden = false;
  private lastScrollY = 0;

  @ViewChild('mainHeader') set mainHeaderRef(ref: ElementRef<HTMLElement> | undefined) {
    this.observeHeader(ref?.nativeElement || null);
  }

  /** Revela al hacer scroll las secciones .reveal-section/.stagger-group de cualquier página
   *  (re-escanea tras cada navegación). Se crea aquí para que exista desde el primer momento. */
  private readonly scrollReveal = inject(ScrollRevealService);

  // ── Ventana rápida de chat con personajes ──
  private readonly characterChat = inject(CharacterChatService);
  @ViewChild('chatSheetHost', { read: ViewContainerRef, static: true }) private chatSheetHost!: ViewContainerRef;
  private chatSheet: Promise<ComponentRef<unknown>> | null = null;

  /** El código de la ventana se descarga solo cuando alguien abre un chat. */
  private ensureChatSheet() {
    this.chatSheet ??= import('./characters/chat-sheet/chat-sheet.component')
      .then(m => this.chatSheetHost.createComponent(m.ChatSheetComponent));
  }

  // ── Cuaderno flotante (editor, dibujo y PDF se descargan al abrirlo por primera vez) ──
  private readonly notebook = inject(NotebookService);
  @ViewChild('notebookHost', { read: ViewContainerRef, static: true }) private notebookHost!: ViewContainerRef;
  private notebookWindow: Promise<ComponentRef<unknown>> | null = null;

  private ensureNotebookWindow() {
    this.notebookWindow ??= import('./notebook/notebook-window/notebook-window.component')
      .then(m => this.notebookHost.createComponent(m.NotebookWindowComponent));
  }
  
  // Unified Notifications & Toasts
  notifications: AppNotification[] = [];
  private toastTimers = new Map<string, { timeoutId: any; remaining: number; startedAt: number }>();

  // Deprecated backwards-compatibility alias
  gamificationToasts: (GamificationNotification & { id: number })[] = [];

  readonly quickGenres = QUICK_GENRES;

  /** Maguito saluda la primera vez por sesión; después solo parpadea y mira. */
  greetMascot = firstTimeThisSession('lit-maguito-greet');
  profileMenuOpen = false;
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Contadores de accesos rápidos
  cartCount = 0;
  favoritesCount = 0;
  unreadMessagesCount = 0;

  // DEBUGGING: Global Error Catcher
  globalError: string | null = null;
  
  private lastBackPressTime = 0;
  private location = inject(Location);
  
  // Profile data
  get userName(): string {
    const user = this.authService.currentUser();
    return user?.username || user?.email?.split('@')[0] || 'Viajero';
  }
  
  get userInitials(): string {
    const name = this.userName;
    return name ? name.charAt(0).toUpperCase() : 'V';
  }
  
  userAvatarUrl: string | null = null;
  userEquippedFrame = '';
  userEquippedTitle = '';
  userAvatarColor: string = localStorage.getItem(userStorageKey('user_avatar_color')) || '#7c3aed';

  // Animación Tinta
  shakeState = 'default';
  inkBalance$ = this.chatService.inkBalance$;

  // Recompensa Diaria indicador
  dailyRewardClaimable$ = this.gamificationService.dailyRewardClaimable$;

  // ── Menú del avatar: nivel, racha, código de amigo y tema rápido ──
  /** Perfil de users/profile/ que ya carga la gamificación al iniciar sesión. */
  readerProfile$ = this.gamificationService.profile$;
  readonly themes = APP_THEMES;
  currentTheme$ = this.settingsService.currentTheme$;
  friendCodeCopied = false;
  private friendCodeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        const url = e.urlAfterRedirects as string;
        this.isDashboard = url.startsWith('/dashboard') || url.startsWith('/reader');
        this.isEnigma = url.includes('enigma');
        this.isTavernHall = /^\/tavern\/?(?:[?#]|$)/.test(url);
        this.isPlayingLevel = url.startsWith('/learn/play') || url.startsWith('/learn/skip');
        // La barra inferior (celular) se muestra donde se ve el encabezado de la tienda.
        document.body.classList.toggle('has-bottom-nav', !this.isDashboard && !this.isPlayingLevel);
        this.setHeaderHidden(false);
      });
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onWindowScroll, { passive: true });
      watchKeyboard();
    });
    this.characterChat.request$.subscribe(request => {
      if (request) this.ensureChatSheet();
    });
    this.notebook.visibility$.subscribe(visibility => {
      if (visibility !== 'closed' && this.authService.isLoggedIn()) this.ensureNotebookWindow();
    });
    this.settingsService.themeSaveFailed$.subscribe(() =>
      this.notificationService.warning('El tema se aplicó, pero no se pudo guardar en tu cuenta.', 'Tema'));
  }

  /**
   * En el celular el encabezado ocupaba un cuarto de la pantalla: se esconde al bajar y vuelve
   * al subir. Corre fuera de Angular (sin detección de cambios en cada scroll) y no se esconde
   * con el buscador enfocado, un menú abierto o cerca del inicio de la página.
   */
  private onWindowScroll = () => {
    const y = window.scrollY;
    const delta = y - this.lastScrollY;
    this.lastScrollY = y;
    if (!this.headerEl || window.innerWidth > 768 || y < 120) {
      this.setHeaderHidden(false);
      return;
    }
    if (Math.abs(delta) < 6) return;
    const busy = this.headerEl.contains(document.activeElement) || this.profileMenuOpen;
    this.setHeaderHidden(delta > 0 && !busy);
  };

  private setHeaderHidden(hidden: boolean) {
    if (hidden === this.headerHidden) return;
    this.headerHidden = hidden;
    this.headerEl?.classList.toggle('header-hidden', hidden);
    // Lo que se pega bajo el encabezado (top: var(--header-offset, var(--navbar-h))) sube con él.
    if (hidden) this.hostEl.style.setProperty('--header-offset', '0px');
    else this.hostEl.style.removeProperty('--header-offset');
  }

  /** El fondo sigue el alto real; la taberna conserva el alto abierto para anclar su mesa. */
  private observeHeader(el: HTMLElement | null) {
    if (el === this.headerEl) return;
    this.headerObserver?.disconnect();
    this.headerObserver = null;
    if (this.headerMeasureFrame !== null) cancelAnimationFrame(this.headerMeasureFrame);
    this.headerMeasureFrame = null;
    this.headerEl = el;
    this.headerHidden = false;
    this.hostEl.style.removeProperty('--header-offset');
    this.hostEl.style.removeProperty('--navbar-h');
    this.hostEl.style.removeProperty('--navbar-expanded-h');
    this.hostEl.style.removeProperty('--tavern-nav-fill');
    if (!el || typeof ResizeObserver === 'undefined') return;
    this.headerObserver = new ResizeObserver(() => {
      // Publicar medidas fuera del callback evita el ciclo ResizeObserver → layout → ResizeObserver.
      if (this.headerMeasureFrame !== null) return;
      this.headerMeasureFrame = requestAnimationFrame(() => {
        this.headerMeasureFrame = null;
        const nav = el.querySelector<HTMLElement>('.nav-bubbles-bar');
        const navContent = nav?.querySelector<HTMLElement>('app-main-nav');
        const actualHeight = el.offsetHeight;
        // El contenido conserva su alto al plegar max-height; en móvil display:none mide cero.
        const openNavHeight = Math.min(navContent?.offsetHeight || 0, 120);
        const expandedHeight = actualHeight - (nav?.offsetHeight || 0) + openNavHeight;
        this.hostEl.style.setProperty('--navbar-h', `${actualHeight}px`);
        this.hostEl.style.setProperty('--navbar-expanded-h', `${expandedHeight}px`);
        this.hostEl.style.setProperty('--tavern-nav-fill', `${Math.max(0, expandedHeight - actualHeight)}px`);
      });
    });
    this.headerObserver.observe(el);
  }

  ngOnInit() {

    this.isEnigma = this.router.url.includes('enigma');
    // Cargar la configuración global (Tema) apenas inicie
    // Sin sesión el perfil responde 401 y el interceptor enviaría al visitante a /login.
    if (this.authService.isLoggedIn()) {
      this.settingsService.loadSettings().subscribe();
    }

    // Si el header se vuelve a montar (al salir del lector) Maguito no repite el saludo.
    setTimeout(() => this.greetMascot = false, 6000);

    // El contador refleja la colección persistida del usuario autenticado.
    this.favoritesService.count$.subscribe(count => {
      if (this.favoritesCount > 0 && count > this.favoritesCount) this.bumpBadge('favorites');
      this.favoritesCount = count;
    });

    // Sincronizar contador de carrito
    this.updateCartCount();
    window.addEventListener('literatus-cart-updated', () => {
      this.updateCartCount();
    });

    // Sincronizar contador de mensajes y correspondencia
    this.updateUnreadMessagesCount();
    window.addEventListener('literatus-messages-updated', () => {
      this.updateUnreadMessagesCount();
    });

    // Escuchar cambios en el estado de login para cargar datos
    this.authService.isLoggedIn$.subscribe(loggedIn => {
      if (loggedIn) {
        this.chatService.loadInitialInk();
        this.loadUserProfile();
        this.updateUnreadMessagesCount();
        this.gamificationService.loadInitialProfile();
        this.gamificationService.checkDailyRewardStatus();
        this.achievementsService.scheduleCheck();
      } else {
        this.achievementsService.reset();
        this.userEquippedFrame = this.userEquippedTitle = '';
        this.unreadMessagesCount = 0;
      }
    });

    // Suscribirse a cambios de tinta para animar
    this.inkBalance$.subscribe(val => {
      this.triggerShake();
    });

    // Suscribirse a actualizaciones de perfil
    this.chatService.profileUpdated$.subscribe(() => {
      this.loadUserProfile();
      this.gamificationService.loadInitialProfile();
    });

    // Suscribirse al flujo unificado de notificaciones
    this.notificationService.notifications$.subscribe(list => {
      this.notifications = list;
      this.syncToastTimers(list);
    });

    // Añadir listener global de errores
    window.addEventListener('error', (event) => {
      // Los fallos de carga de un recurso (<img>, <link>, <script>) también burbujean
      // hasta aquí, pero con target = el elemento en vez de window. No son errores de
      // la aplicación: una portada o un avatar rotos no deben pintar el banner global
      // ni disparar un ciclo de detección de cambios por cada imagen.
      if (event.target instanceof Element) return;
      if (environment.production) { console.error(event.message, event.filename, event.lineno); return; }
      this.globalError = `Error: ${event.message} en ${event.filename}:${event.lineno}`;
    });
    window.addEventListener('unhandledrejection', (event) => {
      if (environment.production) { console.error(event.reason); return; }
      this.globalError = `Promesa rechazada: ${event.reason}`;
    });

    // Control del botón 'Atrás' en hardware (Android)
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const isRootPage = this.router.url === '/dashboard' || this.router.url === '/login' || this.router.url === '/library';
      
      if (!canGoBack || isRootPage) {
        // Doble toque para salir
        const now = Date.now();
        if (now - this.lastBackPressTime < 2000) {
          CapacitorApp.exitApp();
        } else {
          this.lastBackPressTime = now;
          // Opcionalmente, mostrar un toast nativo aquí si tienes el plugin de Toast
          console.log('Presiona de nuevo para salir');
        }
      } else {
        // Navegar hacia atrás en la historia de Angular
        this.location.back();
      }
    });

    // Verificar si el usuario debe ver la Guía de Bienvenida por primera vez
    this.checkFirstTimeGuide();
  }

  checkFirstTimeGuide() {
    const isDismissed = localStorage.getItem('literatus_guide_dismissed') === 'true';
    const isSeen = localStorage.getItem('literatus_guide_seen') === 'true';
    if (!isDismissed && !isSeen) {
      // Mostrar tras una breve pausa para que la vista cargue suavemente
      setTimeout(() => {
        if (!this.isDashboard) {
          this.openGuideDialog();
        }
      }, 1200);
    }
  }

  openGuideDialog() {
    this.dialog.open(GuideDialogComponent, {
      panelClass: 'guide-custom-dialog-panel',
      autoFocus: false,
      maxWidth: '92vw',
      width: '580px'
    });
  }

  toggleNavBubbles() {

    this.isNavBubblesHidden = !this.isNavBubblesHidden;
    if (this.isNavBubblesHidden) {
      document.body.classList.add('hide-nav-bubbles');
    } else {
      document.body.classList.remove('hide-nav-bubbles');
    }
  }

  loadUserProfile() {
    this.chatService.getUserProfile().subscribe({
      next: (profile) => {
        this.userEquippedFrame = profile?.equipped_frame || '';
        this.userEquippedTitle = profile?.equipped_title || '';
        if (profile && profile.avatar) {
          this.userAvatarUrl = profile.avatar;
        }
        if (profile && profile.avatar_color) {
          this.userAvatarColor = profile.avatar_color;
          localStorage.setItem(userStorageKey('user_avatar_color'), profile.avatar_color);
        }
      }
    });
  }

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  logout() {
    this.authService.logout();
  }

  openInkTopUp() {
    this.router.navigate(['/planes'], { fragment: 'tinta' });
  }

  /** Mismo cálculo que la página de Logros, para que ambas barras coincidan. */
  xpPercent(profile: { xp?: number; xp_to_next_level?: number } | null): number {
    return profile?.xp_to_next_level ? Math.min(100, (profile.xp || 0) / profile.xp_to_next_level * 100) : 100;
  }

  themeLabel(themeId: string | null): string {
    return this.themes.find(theme => theme.id === themeId)?.label || this.themes[0].label;
  }

  /** Cambia el tema en vivo sin cerrar el menú; SettingsService lo guarda en la cuenta. */
  pickTheme(themeId: string, event: Event) {
    event.stopPropagation();
    this.settingsService.chooseTheme(themeId);
  }

  async copyFriendCode(code: string, event: Event) {
    event.stopPropagation();
    if (await copyText('#' + code)) {
      this.friendCodeCopied = true;
      if (this.friendCodeTimer) clearTimeout(this.friendCodeTimer);
      this.friendCodeTimer = setTimeout(() => {
        this.friendCodeCopied = false;
        this.friendCodeTimer = null;
      }, 1600);
    } else {
      this.notificationService.info(`Tu código es #${code}.`, 'La Taberna');
    }
  }

  triggerShake() {
    this.shakeState = 'trigger';
    setTimeout(() => {
      this.shakeState = 'default';
    }, 400); // Duración de la animación
  }

  goToFavorites(): void {
    this.router.navigate(['/favorites']);
  }

  goToMessages(): void {
    this.router.navigate(['/messages']);
  }

  goToCart(): void {
    this.router.navigate(['/cart']);
  }

  updateFavoritesCount(): void {
    this.favoritesService.load().subscribe({
      error: () => this.favoritesCount = 0,
    });
  }

  updateCartCount(): void {
    const previous = this.cartCount;
    try {
      const raw = localStorage.getItem(userStorageKey('literatus_cart'));
      const list = raw ? JSON.parse(raw) : [];
      this.cartCount = Array.isArray(list) ? list.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) : 0;
    } catch {
      this.cartCount = 0;
    }
    if (previous > 0 && this.cartCount > previous) this.bumpBadge('cart');
  }

  updateUnreadMessagesCount(): void {
    if (!this.authService.isLoggedIn()) {
      this.unreadMessagesCount = 0;
      return;
    }
    try {
      const stored = localStorage.getItem(userStorageKey('literatus_unread_messages_count'));
      this.unreadMessagesCount = stored !== null ? Math.max(0, parseInt(stored, 10) || 0) : 0;
    } catch {
      this.unreadMessagesCount = 0;
    }
  }

  /**
   * Confirma que el contador subió: la insignia crece un instante y vuelve (WAAPI, sin
   * librería). La primera aparición la anima el CSS; esto es solo para los aumentos.
   */
  private bumpBadge(name: 'favorites' | 'cart'): void {
    if (this.reducedMotion) return;
    // Espera a que Angular pinte el número nuevo antes de animarlo.
    setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-badge="${name}"]`)?.animate(
        [{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
        { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      );
    });
  }

  prepareRoute(outlet: RouterOutlet) {
    return outlet && outlet.activatedRouteData && outlet.activatedRouteData['animation'];
  }

  /* ── Control de Notificaciones Unificadas (Pop-up Central) ── */
  get currentNotification(): AppNotification | null {
    return this.notifications.length > 0 ? this.notifications[0] : null;
  }

  @HostListener('document:keydown', ['$event'])
  handlePopupKeyboard(event: KeyboardEvent): void {
    if (this.currentNotification && (event.key === 'Escape' || event.key === 'Enter')) {
      this.dismissNotification(this.currentNotification.id);
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.currentNotification) {
      this.dismissNotification(this.currentNotification.id);
    }
  }

  trackNotification(index: number, item: AppNotification): string {
    return item.id;
  }

  private syncToastTimers(list: AppNotification[]): void {
    const currentIds = new Set(list.map(t => t.id));

    // Limpiar temporizadores de elementos ya retirados
    for (const [id, timer] of this.toastTimers.entries()) {
      if (!currentIds.has(id)) {
        clearTimeout(timer.timeoutId);
        this.toastTimers.delete(id);
      }
    }

    // Programar temporizadores para elementos nuevos
    for (const toast of list) {
      if (!this.toastTimers.has(toast.id) && toast.duration && toast.duration > 0) {
        const duration = toast.duration;
        const timeoutId = setTimeout(() => {
          this.dismissNotification(toast.id);
        }, duration);

        this.toastTimers.set(toast.id, {
          timeoutId,
          remaining: duration,
          startedAt: Date.now()
        });
      }
    }
  }

  pauseToastTimer(id: string): void {
    const timer = this.toastTimers.get(id);
    if (!timer) return;
    clearTimeout(timer.timeoutId);
    const elapsed = Date.now() - timer.startedAt;
    timer.remaining = Math.max(0, timer.remaining - elapsed);
  }

  resumeToastTimer(id: string): void {
    const timer = this.toastTimers.get(id);
    if (!timer || timer.remaining <= 0) return;
    timer.startedAt = Date.now();
    timer.timeoutId = setTimeout(() => {
      this.dismissNotification(id);
    }, timer.remaining);
  }

  dismissNotification(id: string): void {
    const timer = this.toastTimers.get(id);
    if (timer) {
      clearTimeout(timer.timeoutId);
      this.toastTimers.delete(id);
    }
    this.notificationService.dismiss(id);
  }

  executeToastAction(toast: AppNotification): void {
    if (toast.action?.run) {
      try {
        toast.action.run();
      } catch (err) {
        console.error('Error executing toast action:', err);
      }
    }
    this.dismissNotification(toast.id);
  }
}
