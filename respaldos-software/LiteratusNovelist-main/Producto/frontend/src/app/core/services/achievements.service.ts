// src/app/core/services/achievements.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string;
  category: 'reading' | 'streak' | 'exploration' | 'time' | 'social';
  icon: string;
  badge_image: string | null;
  threshold: number;
  ink_reward: number;
  sort_order: number;
}

export interface UserAchievement {
  id: string;
  achievement: Achievement;
  current_progress: number;
  progress_percentage: number;
  is_unlocked: boolean;
  unlocked_at: string | null;
  notified: boolean;
}

@Injectable({ providedIn: 'root' })
export class AchievementsService {
  private readonly apiUrl = environment.apiUrl;
  private _unnotified$ = new BehaviorSubject<UserAchievement[]>([]);
  unnotified$ = this._unnotified$.asObservable();

  constructor(private http: HttpClient) {}

  /** Catálogo público de todos los logros disponibles */
  getCatalog(): Observable<Achievement[]> {
    return this.http.get<Achievement[]>(
      `${this.apiUrl}library/achievements/catalog/`
    );
  }

  /** Logros del usuario autenticado con su progreso */
  getMyAchievements(): Observable<UserAchievement[]> {
    return this.http.get<UserAchievement[]>(
      `${this.apiUrl}library/achievements/me/`
    );
  }

  /**
   * Logros desbloqueados aún no notificados.
   * Se emiten en unnotified$ para que el toast de celebración los muestre.
   */
  checkUnnotified(): void {
    this.http
      .get<UserAchievement[]>(
        `${this.apiUrl}library/achievements/me/unnotified/`
      )
      .subscribe((list) => this._unnotified$.next(list));
  }

  /** Marca un logro como notificado (el toast ya se mostró) */
  markNotified(userAchievementId: string): Observable<UserAchievement> {
    return this.http
      .patch<UserAchievement>(
        `${this.apiUrl}library/achievements/me/${userAchievementId}/`,
        { notified: true }
      )
      .pipe(
        tap(() => {
          // Quitar de la lista de no-notificados
          const current = this._unnotified$.value.filter(
            (ua) => ua.id !== userAchievementId
          );
          this._unnotified$.next(current);
        })
      );
  }
}
