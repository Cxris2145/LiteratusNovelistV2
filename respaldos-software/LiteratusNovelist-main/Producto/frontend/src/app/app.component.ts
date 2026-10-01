import { Component, inject, OnInit, HostListener } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ChatService } from './core/services/chat.service';
import { filter } from 'rxjs/operators';
import { routeTransitionAnimations, shakeAnimation } from './core/animations';
import { App as CapacitorApp } from '@capacitor/app';
import { Location } from '@angular/common';

import { SettingsService } from './core/services/settings.service';
import { environment } from '../environments/environment';
import { FavoritesService } from './core/services/favorites.service';
import { GamificationService, GamificationNotification } from './core/services/gamification.service';
import { MatDialog } from '@angular/material/dialog';
import { GuideDialogComponent } from './core/components/guide-dialog/guide-dialog.component';
import { SpeechRecognitionService } from './core/services/speech-recognition.service';
import { QUICK_GENRES } from './core/components/main-nav/nav-genres';
import { firstTimeThisSession } from './core/components/main-nav/main-nav.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  animations: [routeTransitionAnimations, shakeAnimation]
})
export class AppComponent implements OnInit {
  title = 'frontend';
  authService = inject(AuthService);
  chatService = inject(ChatService);
  settingsService = inject(SettingsService);
  favoritesService = inject(FavoritesService);
  gamificationService = inject(GamificationService);
  dialog = inject(MatDialog);
  speechService = inject(SpeechRecognitionService);
  router = inject(Router);

  isListeningSearch = false;

  isDashboard = false;
  isEnigma = false;
  /** Partida de La Senda en modo concentración: sin header ni asistente (tapaba la bandeja). */
  isPlayingLevel = false;
  isNavBubblesHidden = false;
  private lastScrollTop = 0;
  
  // Gamification Toasts
  gamificationToasts: (GamificationNotification & { id: number })[] = [];
  private toastIdCounter = 0;

  // Buscador global del navbar
  globalSearchTerm = '';
  readonly quickGenres = QUICK_GENRES;

  /** Maguito saluda la primera vez por sesión; después solo parpadea y mira. */
  greetMascot = firstTimeThisSession('lit-maguito-greet');
  profileMenuOpen = false;
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Contadores de accesos rápidos
  cartCount = 0;
  favoritesCount = 0;
  unreadMessagesCount = 1;

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
  userAvatarColor: string = localStorage.getItem('user_avatar_color') || '#7c3aed';

  // Animación Tinta
  shakeState = 'default';
  inkBalance$ = this.chatService.inkBalance$;

  // Recompensa Diaria indicador
  dailyRewardClaimable$ = this.gamificationService.dailyRewardClaimable$;

  constructor() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        const url = e.urlAfterRedirects as string;
        this.isDashboard = url.startsWith('/dashboard') || url.startsWith('/reader');
        this.isEnigma = url.includes('enigma');
        this.isPlayingLevel = url.startsWith('/learn/play') || url.startsWith('/learn/skip');
      });
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

    // Escuchar cambios en el estado de login para cargar datos
    this.authService.isLoggedIn$.subscribe(loggedIn => {
      if (loggedIn) {
        this.chatService.loadInitialInk();
        this.loadUserProfile();
        this.gamificationService.loadInitialProfile();
        this.gamificationService.checkDailyRewardStatus();
      }
    });

    // Suscribirse a cambios de tinta para animar
    this.inkBalance$.subscribe(val => {
      this.triggerShake();
    });

    // Suscribirse a actualizaciones de perfil
    this.chatService.profileUpdated$.subscribe(() => {
      this.loadUserProfile();
    });

    // Suscribirse a notificaciones de gamificación
    this.gamificationService.notifications$.subscribe(notification => {
      const id = this.toastIdCounter++;
      this.gamificationToasts.push({ ...notification, id });
      
      // Auto remover después de la animación (3.5s)
      setTimeout(() => {
        this.gamificationToasts = this.gamificationToasts.filter(t => t.id !== id);
      }, 3500);
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
        if (profile && profile.avatar) {
          this.userAvatarUrl = profile.avatar;
        }
        if (profile && profile.avatar_color) {
          this.userAvatarColor = profile.avatar_color;
          localStorage.setItem('user_avatar_color', profile.avatar_color);
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
    this.authService.clearTokens();
    this.router.navigate(['/login']);
  }

  openTavern() {
    this.router.navigate(['/tavern']);
  }

  triggerShake() {
    this.shakeState = 'trigger';
    setTimeout(() => {
      this.shakeState = 'default';
    }, 400); // Duración de la animación
  }

  onGlobalSearch(): void {
    const query = this.globalSearchTerm.trim();
    if (query) {
      this.router.navigate(['/catalog'], { queryParams: { search: query } });
    } else {
      this.router.navigate(['/catalog']);
    }
  }

  toggleVoiceSearch(): void {
    if (this.isListeningSearch) {
      this.speechService.stopListening();
      this.isListeningSearch = false;
      return;
    }

    this.isListeningSearch = true;
    this.speechService.startListening();

    // Suscribirse a la transcripción parcial/final
    const sub = this.speechService.partialTranscript$.subscribe(text => {
      if (text && this.isListeningSearch) {
        this.globalSearchTerm = text;
      }
    });

    const finalSub = this.speechService.transcript$.subscribe(finalText => {
      if (finalText && this.isListeningSearch) {
        this.globalSearchTerm = finalText;
        this.isListeningSearch = false;
        this.speechService.stopListening();
        sub.unsubscribe();
        finalSub.unsubscribe();
        this.onGlobalSearch();
      }
    });

    // Auto-timeout tras 8 segundos de silencio
    setTimeout(() => {
      if (this.isListeningSearch) {
        this.isListeningSearch = false;
        this.speechService.stopListening();
        sub.unsubscribe();
        finalSub.unsubscribe();
        if (this.globalSearchTerm.trim()) {
          this.onGlobalSearch();
        }
      }
    }, 8000);
  }

  clearGlobalSearch(): void {
    this.globalSearchTerm = '';
    if (this.isListeningSearch) {
      this.speechService.stopListening();
      this.isListeningSearch = false;
    }
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
      const raw = localStorage.getItem('literatus_cart');
      const list = raw ? JSON.parse(raw) : [];
      this.cartCount = Array.isArray(list) ? list.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) : 0;
    } catch {
      this.cartCount = 0;
    }
    if (previous > 0 && this.cartCount > previous) this.bumpBadge('cart');
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
}
