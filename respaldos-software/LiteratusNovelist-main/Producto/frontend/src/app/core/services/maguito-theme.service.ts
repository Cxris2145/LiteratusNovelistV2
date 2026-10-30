import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  DEFAULT_MAGUITO_COLORS,
  MaguitoCustomColors,
  getMaguitoCssVariables,
} from '../components/maguito/maguito-colors';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root',
})
export class MaguitoThemeService {
  private static readonly STORAGE_KEY = 'tavern_maguito_colors';
  private api = inject(ApiService);

  private readonly colorsSubject = new BehaviorSubject<MaguitoCustomColors>(this.loadInitialColors());
  readonly colors$: Observable<MaguitoCustomColors> = this.colorsSubject.asObservable();

  constructor() {
    // Inyecta las variables en :root al inicio para que todos los Maguitos hereden la personalización
    this.applyToRoot(this.colorsSubject.value);
  }

  /** Devuelve los colores activos en este momento. */
  get currentColors(): MaguitoCustomColors {
    return this.colorsSubject.value;
  }

  /** Carga los colores desde el almacenamiento local o devuelve los predeterminados. */
  private loadInitialColors(): MaguitoCustomColors {
    try {
      const saved = localStorage.getItem(MaguitoThemeService.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_MAGUITO_COLORS, ...parsed };
      }
    } catch (e) {
      console.warn('No se pudieron leer los colores guardados de Maguito:', e);
    }
    return { ...DEFAULT_MAGUITO_COLORS };
  }

  /** Guarda los nuevos colores en almacenamiento local, actualiza el estado y propaga al :root. */
  saveColors(colors: MaguitoCustomColors): void {
    const merged = { ...DEFAULT_MAGUITO_COLORS, ...colors };
    try {
      localStorage.setItem(MaguitoThemeService.STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {
      console.warn('Error al persistir colores en localStorage:', e);
    }

    this.colorsSubject.next(merged);
    this.applyToRoot(merged);

    // Persistencia silenciosa hacia el backend si hay sesión activa
    this.syncWithBackend(merged);
  }

  /** Restablece los colores a los originales de La Taberna. */
  resetColors(): void {
    this.saveColors({ ...DEFAULT_MAGUITO_COLORS });
  }

  /** Aplica las variables CSS a document.documentElement para cobertura global. */
  private applyToRoot(colors: MaguitoCustomColors): void {
    if (typeof document === 'undefined' || !document.documentElement) return;
    const vars = getMaguitoCssVariables(colors);
    const rootStyle = document.documentElement.style;
    for (const [key, value] of Object.entries(vars)) {
      rootStyle.setProperty(key, value);
    }
  }

  /** Intenta enviar la personalización al backend si el endpoint de perfil está disponible. */
  private syncWithBackend(colors: MaguitoCustomColors): void {
    try {
      // Si el usuario tiene sesión, guardamos en avatar_color o en perfil extendido
      this.api.patch('users/profile/', { avatar_color: colors.capeA }).subscribe({
        next: () => {},
        error: () => {
          // No es bloqueante: el almacenamiento local ya aseguró la persistencia en el dispositivo
        },
      });
    } catch {
      // Ignorar si no hay sesión o servicio HTTP
    }
  }
}

