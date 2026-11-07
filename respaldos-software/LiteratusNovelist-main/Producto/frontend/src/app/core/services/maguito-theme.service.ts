import { Injectable, Injector, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { MaguitoCustomColors, storedMaguitoColors } from '../components/maguito/maguito-colors';
import { MaguitoOutfit } from '../components/maguito/maguito-outfit';
import { ApiService } from './api.service';
import { userStorageKey } from './auth.service';

/**
 * El color del Maguito del lector con sesión. La fuente de verdad es Profile.outfit.colors, en el
 * servidor; la copia local (una por cuenta) solo evita que al cargar se vea un instante el clásico.
 */
@Injectable({
  providedIn: 'root',
})
export class MaguitoThemeService {
  private static readonly STORAGE_BASE = 'maguito_colors';
  // ApiService se pide al guardar: pintar un Maguito no debe depender de HttpClient.
  private readonly injector = inject(Injector);

  private readonly colorsSubject = new BehaviorSubject<Partial<MaguitoCustomColors> | null>(this.readStored());
  /** null = Maguito clásico. */
  readonly colors$: Observable<Partial<MaguitoCustomColors> | null> = this.colorsSubject.asObservable();

  get currentColors(): Partial<MaguitoCustomColors> | null {
    return this.colorsSubject.value;
  }

  /** Toma el color del atuendo que acaba de llegar del servidor. */
  hydrate(outfit: MaguitoOutfit | null | undefined): void {
    this.remember(outfit?.colors || null);
  }

  /** Guarda el color en la cuenta y devuelve el atuendo completo que quedó. */
  save(colors: Partial<MaguitoCustomColors> | null): Observable<MaguitoOutfit> {
    return this.injector.get(ApiService)
      .patch<{ outfit?: MaguitoOutfit }>('users/profile/', { maguito_colors: storedMaguitoColors(colors) })
      .pipe(
        map(profile => profile?.outfit || {}),
        tap(outfit => this.hydrate(outfit)),
      );
  }

  private remember(colors: Partial<MaguitoCustomColors> | null): void {
    try {
      const key = userStorageKey(MaguitoThemeService.STORAGE_BASE);
      if (colors) localStorage.setItem(key, JSON.stringify(colors));
      else localStorage.removeItem(key);
    } catch {
      // Sin almacenamiento el color sigue valiendo en esta visita.
    }
    this.colorsSubject.next(colors);
  }

  private readStored(): Partial<MaguitoCustomColors> | null {
    try {
      const saved = localStorage.getItem(userStorageKey(MaguitoThemeService.STORAGE_BASE));
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }
}
