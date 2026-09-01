import { Component, inject, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ChatService } from './core/services/chat.service';
import { filter } from 'rxjs/operators';
import { routeTransitionAnimations, shakeAnimation } from './core/animations';
import { App as CapacitorApp } from '@capacitor/app';
import { Location } from '@angular/common';

import { SettingsService } from './core/services/settings.service';

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
  router = inject(Router);
  
  menuOpen = false;
  isDashboard = false;
  
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
  userAvatarColor: string = localStorage.getItem('user_avatar_color') || '#7c3aed'; // default purple or cached

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

    // Escuchar cambios en el estado de login para cargar datos
    this.authService.isLoggedIn$.subscribe(loggedIn => {
      if (loggedIn) {
        this.chatService.loadInitialInk();
        this.loadUserProfile();
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

    // Añadir listener global de errores
    window.addEventListener('error', (event) => {
      this.globalError = `Error: ${event.message} en ${event.filename}:${event.lineno}`;
    });
    window.addEventListener('unhandledrejection', (event) => {
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

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  logout() {
    this.authService.clearTokens();
    this.toggleMenu();
    this.router.navigate(['/login']);
  }

  openTavern() {
    this.router.navigate(['/ink-shop']);
  }

  triggerShake() {
    this.shakeState = 'trigger';
    setTimeout(() => {
      this.shakeState = 'default';
    }, 400); // Duración de la animación
  }

  prepareRoute(outlet: RouterOutlet) {
    return outlet && outlet.activatedRouteData && outlet.activatedRouteData['animation'];
  }
}
