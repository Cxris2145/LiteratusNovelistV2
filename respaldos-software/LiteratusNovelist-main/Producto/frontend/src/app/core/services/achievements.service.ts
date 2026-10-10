// src/app/core/services/achievements.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject, tap, finalize } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NotificationService } from './notification.service';
import { ChatService } from './chat.service';
import { Router } from '@angular/router';

export type AchievementCategory = 'reading' | 'streak' | 'exploration' | 'time' | 'social' | 'learning' | 'games' | 'reader' | 'collection';
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';
export interface AchievementReward {
  code: string;
  name: string;
  item_type: 'profile_frame' | 'title' | 'maguito_wear';
  value: string;
  icon: string;
  is_exclusive: boolean;
}

export interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  reward: AchievementReward | null;
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
  readonly changed$ = new Subject<void>();
  private checkTimer?: ReturnType<typeof setTimeout>;
  private celebrationTimer?: ReturnType<typeof setTimeout>;
  private lastCheck = 0;
  private checking = false;
  private queue: UserAchievement[] = [];
  private shown = new Set<string>();
  private accountGeneration = 0;

  constructor(private http: HttpClient, private notifications: NotificationService,
              private chat: ChatService, private router: Router) {}

  /** Agrupa las acciones del lector y deja una comprobación al final de cada ráfaga. */
  scheduleCheck(): void {
    if (this.checkTimer) return;
    this.checkTimer = setTimeout(() => {
      this.checkTimer = undefined;
      this.checkUnnotified();
    }, Math.max(400, 4000 - (Date.now() - this.lastCheck)));
  }

  reset(): void {
    this.accountGeneration++;
    clearTimeout(this.checkTimer);
    clearTimeout(this.celebrationTimer);
    this.checkTimer = this.celebrationTimer = undefined;
    this.queue = [];
    this.shown.clear();
    this._unnotified$.next([]);
    this.lastCheck = 0;
  }

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
    if (this.checking) { this.scheduleCheck(); return; }
    this.checking = true;
    this.lastCheck = Date.now();
    const generation = this.accountGeneration;
    this.http
      .get<UserAchievement[]>(
        `${this.apiUrl}library/achievements/me/unnotified/`
      )
      .pipe(finalize(() => this.checking = false))
      .subscribe({
        next: list => {
          if (generation !== this.accountGeneration) return;
          this._unnotified$.next(list);
          for (const ua of list) {
            if (this.shown.has(ua.id)) {
              this.markNotified(ua.id).subscribe({ error: () => {} });
            } else if (!this.queue.some(item => item.id === ua.id)) {
              this.queue.push(ua);
            }
          }
          if (list.length) {
            this.changed$.next();
            this.chat.notifyProfileUpdate();
          }
          this.celebrateNext();
        },
        error: () => {},
      });
  }

  private celebrateNext(): void {
    if (this.celebrationTimer || !this.queue.length) return;
    const ua = this.queue.shift()!;
    this.shown.add(ua.id);
    const reward = ua.achievement.reward;
    this.notifications.show({
      type: 'achievement', title: ua.achievement.title,
      message: `${reward ? 'Ganaste ' + reward.name + '. ' : ''}+${ua.achievement.ink_reward} Tinta y +25 XP.`,
      duration: 6000,
      action: { label: reward ? 'Ver premio' : 'Ver logros', run: () => {
        this.router.navigate(['/achievements'], { queryParams: reward ? { tab: 'collection' } : {} });
      } },
    });
    this.markNotified(ua.id).subscribe({ error: () => {} });
    this.celebrationTimer = setTimeout(() => {
      this.celebrationTimer = undefined;
      this.celebrateNext();
    }, 6500);
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
