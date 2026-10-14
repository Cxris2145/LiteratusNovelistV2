import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { tap, catchError, debounceTime, map, switchMap } from 'rxjs/operators';
import { swapTheme } from '../utils/theme-swap.util';

export interface StoreSettings {
  theme: string;
}

export interface AppTheme {
  id: string;
  label: string;
  desc: string;
  previewBg: string;
  previewAccent: string;
  previewBorder: string;
}

/** Temas que puede elegir el lector (Editar Perfil y el menú del avatar). */
export const APP_THEMES: readonly AppTheme[] = [
  {
    id: 'default',
    label: 'Azul Tinta',
    desc: 'Predeterminado · Azul profundo y detalles dorados',
    previewBg: '#15233B',
    previewAccent: '#5E80B3',
    previewBorder: '#263B61'
  },
  {
    id: 'high-contrast-dark',
    label: 'Alto Contraste Oscuro',
    desc: 'Accesible · Negro puro (#000000) y texto blanco',
    previewBg: '#000000',
    previewAccent: '#FCD34D',
    previewBorder: '#FFFFFF'
  },
  {
    id: 'high-contrast-light',
    label: 'Alto Contraste Diurno',
    desc: 'Accesible · Blanco puro (#FFFFFF) y tinta carbón',
    previewBg: '#FFFFFF',
    previewAccent: '#000000',
    previewBorder: '#9CA3AF'
  },
  {
    id: 'sepia',
    label: 'Modo Lectura Sepia',
    desc: 'Cálido · Pergamino suave y descanso visual',
    previewBg: '#FBF0D9',
    previewAccent: '#92400E',
    previewBorder: '#D7BA89'
  },
  {
    id: 'light-gallery',
    label: 'Galería Minimalista',
    desc: 'Claro · Gris luminoso y acento azul zafiro',
    previewBg: '#F8F9FA',
    previewAccent: '#2563EB',
    previewBorder: '#E5E7EB'
  },
  {
    id: 'neon',
    label: 'Cyber Neon',
    desc: 'Nocturno · Negro espacial y cian vibrante',
    previewBg: '#0D0F18',
    previewAccent: '#00FFCC',
    previewBorder: '#1F293D'
  }
];

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private apiUrl = `${environment.apiUrl}users/profile/`;
  private currentThemeSubject = new BehaviorSubject<string>('default');
  public currentTheme$ = this.currentThemeSubject.asObservable();

  /** Último tema elegido que la API aún no confirma; mientras exista, el del servidor no lo pisa. */
  private pendingTheme: string | null = null;
  private readonly themeSave$ = new Subject<string>();
  /** Emite el tema que no se pudo guardar en la cuenta (sigue aplicado en este navegador). */
  readonly themeSaveFailed$ = new Subject<string>();

  constructor(private http: HttpClient) {
    const savedTheme = localStorage.getItem('literatus-theme');
    if (savedTheme) {
      this.setTheme(savedTheme);
    }
    // Varios clics seguidos solo guardan el último, y la respuesta no vuelve a aplicar el tema:
    // antes una respuesta atrasada devolvía la página al tema anterior.
    this.themeSave$.pipe(
      debounceTime(400),
      switchMap(theme => this.http.patch(this.apiUrl, { theme }).pipe(
        map(() => ({ theme, saved: true })),
        catchError(() => of({ theme, saved: false })),
      )),
    ).subscribe(({ theme, saved }) => {
      if (this.pendingTheme === theme) this.pendingTheme = null;
      if (!saved) this.themeSaveFailed$.next(theme);
    });
  }

  loadSettings(): Observable<StoreSettings> {
    return this.http.get<StoreSettings>(this.apiUrl).pipe(
      tap(settings => {
        if (settings && settings.theme) {
          this.applySavedTheme(settings.theme);
        }
      }),
      catchError(() => of({ theme: localStorage.getItem('literatus-theme') || 'default' } as StoreSettings))
    );
  }

  /** Tema que el usuario elige (menú del avatar, panel): se aplica ya y se guarda en su cuenta. */
  chooseTheme(theme: string): void {
    if (theme === this.currentThemeSubject.value && !this.pendingTheme) return;
    this.pendingTheme = theme;
    this.setThemeDirectly(theme);
    this.themeSave$.next(theme);
  }

  /** Tema guardado en la cuenta (al iniciar, en el perfil): no pisa una elección que se está guardando. */
  applySavedTheme(theme: string): void {
    if (this.pendingTheme) return;
    this.setThemeDirectly(theme);
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

  /** Cambia de tema de una vez, sin cientos de transiciones a la vez (no lo guarda en la cuenta). */
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
