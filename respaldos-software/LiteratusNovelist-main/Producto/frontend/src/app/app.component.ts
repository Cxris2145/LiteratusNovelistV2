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
  router = inject(Router);

  isDashboard = false;
  isNavBubblesHidden = false;
  private lastScrollTop = 0;
  
  // Gamification Toasts
  gamificationToasts: (GamificationNotification & { id: number })[] = [];
  private toastIdCounter = 0;

  // Buscador global del navbar
  globalSearchTerm = '';

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

  constructor() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        const url = e.urlAfterRedirects as string;
        this.isDashboard = url.startsWith('/dashboard') || url.startsWith('/reader');
      });
  }

  ngOnInit() {
    // Cargar la configuración global (Tema) apenas inicie
    this.settingsService.loadSettings().subscribe();

    // El contador refleja la colección persistida del usuario autenticado.
    this.favoritesService.count$.subscribe(count => this.favoritesCount = count);

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

  clearGlobalSearch(): void {
    this.globalSearchTerm = '';
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
    try {
      const raw = localStorage.getItem('literatus_cart');
      const list = raw ? JSON.parse(raw) : [];
      this.cartCount = Array.isArray(list) ? list.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) : 0;
    } catch {
      this.cartCount = 0;
    }
  }

  prepareRoute(outlet: RouterOutlet) {
    return outlet && outlet.activatedRouteData && outlet.activatedRouteData['animation'];
  }
}
