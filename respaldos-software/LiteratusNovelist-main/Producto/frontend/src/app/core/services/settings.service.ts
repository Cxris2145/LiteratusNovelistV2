import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { tap, catchError } from 'rxjs/operators';
import { swapTheme } from '../utils/theme-swap.util';

export interface StoreSettings {
  theme: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private apiUrl = `${environment.apiUrl}users/profile/`;
  private currentThemeSubject = new BehaviorSubject<string>('default');
  public currentTheme$ = this.currentThemeSubject.asObservable();

  constructor(private http: HttpClient) {
    const savedTheme = localStorage.getItem('literatus-theme');
    if (savedTheme) {
      this.setTheme(savedTheme);
    }
  }

  loadSettings(): Observable<StoreSettings> {
    return this.http.get<StoreSettings>(this.apiUrl).pipe(
      tap(settings => {
        if (settings && settings.theme) {
          this.setTheme(settings.theme);
        }
      }),
      catchError(() => of({ theme: localStorage.getItem('literatus-theme') || 'default' } as StoreSettings))
    );
  }

  updateSettings(settings: Partial<StoreSettings>): Observable<any> {
    return this.http.patch<any>(this.apiUrl, settings).pipe(
      tap(updatedSettings => {
        if (updatedSettings && updatedSettings.theme) {
          this.setTheme(updatedSettings.theme);
        }
      })
    );
  }

  private setTheme(theme: string) {
    this.currentThemeSubject.next(theme);
    localStorage.setItem('literatus-theme', theme);
    this.applyThemeAttribute(theme);
  }

  private applyThemeAttribute(theme: string) {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    this.syncThemeColor();
  }

  /** La barra del navegador/sistema en el celular toma el color de fondo del tema activo. */
  private syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    const background = getComputedStyle(document.body).backgroundColor;
    if (meta && background) meta.setAttribute('content', background);
  }

  /** Cambio elegido por el usuario (perfil): de una vez, sin cientos de transiciones a la vez. */
  public setThemeDirectly(theme: string) {
    const current = document.documentElement.getAttribute('data-theme') || 'default';
    if (current === theme) {
      this.setTheme(theme);
      return;
    }
    this.currentThemeSubject.next(theme);
    localStorage.setItem('literatus-theme', theme);
    swapTheme(() => this.applyThemeAttribute(theme));
  }
}
