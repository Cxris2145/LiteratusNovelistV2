import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { tap, catchError } from 'rxjs/operators';

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
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }
  public setThemeDirectly(theme: string) {
    this.setTheme(theme);
  }
}
