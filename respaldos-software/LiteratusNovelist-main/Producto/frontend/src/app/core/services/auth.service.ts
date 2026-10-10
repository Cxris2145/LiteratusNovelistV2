import { Injectable, signal, inject } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  role?: string;
  is_staff: boolean;
  is_superuser: boolean;
  has_completed_onboarding?: boolean;
  birth_date?: string;
  profile?: any;
}

const USER_KEY = 'user_profile';

export interface PasswordRecoverySession {
  email: string;
  token: string;
  expiresAt: number;
}

/**
 * Clave de localStorage propia de la cuenta activa (o de la visita sin sesión).
 * Lo que una cuenta guarda en el navegador (carrito, borradores, partidas) no lo
 * ve otra cuenta que entre después en el mismo navegador.
 */
export function userStorageKey(base: string): string {
  let owner = 'guest';
  try {
    owner = JSON.parse(localStorage.getItem(USER_KEY) || 'null')?.id || 'guest';
  } catch {
    // perfil ilegible: se trata como visita
  }
  return `${base}:${owner}`;
}

/** Claves que antes se guardaban sin dueño y cualquier cuenta del navegador podía leer. */
const LEGACY_SHARED_KEYS = ['literatus_cart', 'discover_saved', 'book_editor_draft', 'user_avatar_color'];
const LEGACY_SHARED_PREFIXES = ['literatus_daily_enigma_'];

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly TOKEN_KEY = 'access_token';
  private readonly REFRESH_KEY = 'refresh_token';
  private readonly USER_KEY = USER_KEY;
  private readonly FRESH_LOGIN_KEY = 'literatus_fresh_login';
  private readonly THEME_KEY = 'literatus-theme';

  private loggedInSubject = new BehaviorSubject<boolean>(this.hasToken());
  public isLoggedIn$ = this.loggedInSubject.asObservable();

  // Signal para el perfil de usuario (reactivo)
  private _currentUser = signal<UserProfile | null>(this.loadUserFromStorage());
  public readonly currentUser = this._currentUser.asReadonly();

  private api = inject(ApiService);
  // El permiso de recuperación queda solo en memoria, fuera de URLs y localStorage.
  private passwordRecovery: PasswordRecoverySession | null = null;

  constructor() {
    this.dropLegacySharedKeys();
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }

  // --- Recuperación y Verificación de Correo ---

  verifyEmail(uid: string, token: string): Observable<any> {
    return this.api.post(`users/verify-email/`, { uid, token });
  }

  /** `identifier` es el correo o el nombre de usuario de una cuenta sin verificar. */
  resendVerification(identifier: string): Observable<any> {
    const field = identifier.includes('@') ? 'email' : 'username';
    return this.api.post(`users/verify-email/resend/`, { [field]: identifier });
  }

  requestPasswordReset(email: string): Observable<{ message: string; expires_in: number; resend_after: number }> {
    this.clearPasswordRecovery();
    return this.api.post(`users/password-reset/`, { email });
  }

  verifyPasswordResetCode(email: string, code: string): Observable<{ reset_token: string; expires_in: number }> {
    return this.api.post<{ reset_token: string; expires_in: number }>(`users/password-reset-verify/`, { email, code }).pipe(
      tap(res => this.passwordRecovery = { email, token: res.reset_token, expiresAt: Date.now() + res.expires_in * 1000 })
    );
  }

  getPasswordRecovery(): PasswordRecoverySession | null {
    if (this.passwordRecovery && this.passwordRecovery.expiresAt <= Date.now()) this.clearPasswordRecovery();
    return this.passwordRecovery;
  }

  clearPasswordRecovery(): void {
    this.passwordRecovery = null;
  }

  confirmPasswordReset(email: string, reset_token: string, new_password: string, confirm_password: string): Observable<{ message: string }> {
    return this.api.post(`users/password-reset-confirm/`, { email, reset_token, new_password, confirm_password });
  }

  private loadUserFromStorage(): UserProfile | null {
    try {
      const raw = localStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  setTokens(access: string, refresh: string): void {
    localStorage.setItem(this.TOKEN_KEY, access);
    localStorage.setItem(this.REFRESH_KEY, refresh);
    this.loggedInSubject.next(true);
  }

  setUser(user: UserProfile): void {
    const previousBirthDate = this._currentUser()?.profile?.birth_date;
    if (previousBirthDate !== user.profile?.birth_date) this.api.invalidate();
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this._currentUser.set(user);
  }

  updateUserOnboarding(role: string, hasCompleted: boolean = true): void {
    const user = this._currentUser();
    if (user) {
      const updated: UserProfile = {
        ...user,
        role,
        has_completed_onboarding: hasCompleted
      };
      this.setUser(updated);
    }
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  clearTokens(): void {
    this.api.invalidate();
    sessionStorage.removeItem('literatus_static_catalog_p1');
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
    sessionStorage.removeItem(this.FRESH_LOGIN_KEY);
    this.loggedInSubject.next(false);
    this._currentUser.set(null);
  }

  /**
   * Guarda la sesión recién iniciada. Devuelve true si en esta pestaña había otra
   * cuenta cargada: en ese caso hay que recargar la app (ver `logout`).
   */
  startSession(access: string, refresh: string, user: UserProfile | null | undefined): boolean {
    this.api.invalidate();
    sessionStorage.removeItem('literatus_static_catalog_p1');
    const previous = this._currentUser();
    const switchedAccount = !!previous && previous.id !== user?.id;
    void this.clearOfflineApiCache();
    this.setTokens(access, refresh);
    this.markFreshLogin();
    if (user) this.setUser(user);
    return switchedAccount;
  }

  /**
   * Cierra la sesión y recarga la app. Los servicios guardan en memoria datos de la
   * cuenta (tinta, biblioteca, chats, cachés de la API) y solo una carga limpia
   * garantiza que la siguiente cuenta no vea nada de la anterior.
   */
  logout(redirectTo = '/login'): void {
    this.clearTokens();
    localStorage.removeItem(this.THEME_KEY);
    this.clearOfflineApiCache().finally(() => window.location.assign(redirectTo));
  }

  /**
   * Vacía las respuestas de la API que el service worker guarda para leer sin
   * conexión (dataGroups de ngsw-config.json). Se guardan por URL, sin dueño.
   */
  private async clearOfflineApiCache(): Promise<void> {
    if (typeof caches === 'undefined') return;
    try {
      const names = (await caches.keys()).filter(name => name.includes(':data:api-') && name.endsWith(':cache'));
      await Promise.all(names.map(async name => {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        await Promise.all(requests.map(request => cache.delete(request)));
      }));
    } catch {
      // Sin Cache Storage (modo privado, http sin TLS): no hay nada guardado.
    }
  }

  private dropLegacySharedKeys(): void {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key || key.includes(':')) continue;
        if (LEGACY_SHARED_KEYS.includes(key) || LEGACY_SHARED_PREFIXES.some(prefix => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Sin localStorage no hay nada que limpiar.
    }
  }

  /**
   * Marca que el usuario acaba de iniciar sesión activamente (login real, no
   * un refresh silencioso de token). Úsalo solo desde el flujo de login.
   * `consumeFreshLogin()` lo lee una única vez para disparar UI de bienvenida
   * (p. ej. el Asistente abriéndose automáticamente).
   */
  markFreshLogin(): void {
    sessionStorage.setItem(this.FRESH_LOGIN_KEY, '1');
  }

  consumeFreshLogin(): boolean {
    const wasFresh = sessionStorage.getItem(this.FRESH_LOGIN_KEY) === '1';
    if (wasFresh) sessionStorage.removeItem(this.FRESH_LOGIN_KEY);
    return wasFresh;
  }

  isLoggedIn(): boolean {
    return this.loggedInSubject.value;
  }

  isAdmin(): boolean {
    const user = this._currentUser();
    return !!(user && (user.is_staff || user.is_superuser));
  }
}
