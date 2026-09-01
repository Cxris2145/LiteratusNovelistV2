import { Injectable, signal, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  is_staff: boolean;
  is_superuser: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly TOKEN_KEY = 'access_token';
  private readonly REFRESH_KEY = 'refresh_token';
  private readonly USER_KEY = 'user_profile';

  private loggedInSubject = new BehaviorSubject<boolean>(this.hasToken());
  public isLoggedIn$ = this.loggedInSubject.asObservable();

  // Signal para el perfil de usuario (reactivo)
  private _currentUser = signal<UserProfile | null>(this.loadUserFromStorage());
  public readonly currentUser = this._currentUser.asReadonly();

  private api = inject(ApiService);

  constructor() {}

  private hasToken(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }

  // --- Recuperación y Verificación de Correo ---
  
  verifyEmail(uid: string, token: string): Observable<any> {
    return this.api.post(`users/verify-email/`, { uid, token });
  }

  requestPasswordReset(email: string): Observable<any> {
    return this.api.post(`users/password-reset/`, { email });
  }

  confirmPasswordReset(uid: string, token: string, new_password: string): Observable<any> {
    return this.api.post(`users/password-reset-confirm/`, { uid, token, new_password });
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
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this._currentUser.set(user);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  clearTokens(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.loggedInSubject.next(false);
    this._currentUser.set(null);
  }

  isLoggedIn(): boolean {
    return this.loggedInSubject.value;
  }

  isAdmin(): boolean {
    const user = this._currentUser();
    return !!(user && (user.is_staff || user.is_superuser));
  }
}
