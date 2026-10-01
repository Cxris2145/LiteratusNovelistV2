// src/app/core/services/learning.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UserStatus {
  hearts: number;
  max_hearts: number;
  streak_current: number;
  streak_max: number;
  streak_shields: number;
  is_secured_today: boolean;
  is_in_danger: boolean;
  ink_balance: number;
  xp: number;
  level: number;
  equipped_frame?: string;
  equipped_title?: string;
}

export interface LearningLevel {
  id: string;
  level_number: number;
  order: number;
  title: string;
  description: string;
  difficulty: 'facil' | 'intermedio' | 'dificil';
  required_score: number;
  xp_reward: number;
  ink_reward: number;
  is_exam: boolean;
  is_chest: boolean;
  icon: string;
  stars: number;
  best_score: number;
  is_completed: boolean;
  is_unlocked: boolean;
  /** Qué trae el nivel: Lectura, Une las parejas, Anagrama... */
  activities?: { kind: string; label: string }[];
}

export interface LearningUnit {
  id: string;
  unit_number: number;
  slug: string;
  title: string;
  description: string;
  order: number;
  icon: string;
  banner_color: string;
  min_user_level: number;
  progress_percentage: number;
  /** La unidad abre al aprobar la prueba de la anterior. */
  is_locked?: boolean;
  levels: LearningLevel[];
}

export interface ExerciseSession {
  level_id: string;
  level_title: string;
  unit_title: string;
  unit_number: number;
  difficulty: string;
  required_score: number;
  book_title: string;
  author_name: string;
  source_type: string;
  pages: string[];
  questions: any[];
  /** Solo en la prueba de salto: unidades que se saltan. */
  skipped_units?: number[];
}

/** Corrección inmediata de una actividad (la primera respuesta queda fijada). */
export interface CheckResult {
  question_id: string;
  is_correct: boolean;
  /** 0 a 1: los juegos con varias piezas dan crédito parcial. */
  fraction: number;
  explanation: string;
  solution: any;
  recorded_answer: any;
}

export interface ExerciseSubmitResult {
  passed: boolean;
  score: number;
  correct_count: number;
  total_questions: number;
  stars: number;
  xp_earned: number;
  ink_earned: number;
  hearts_remaining: number;
  ink_balance: number;
  streak_current: number;
  feedback: any[];
  error?: string;
  message?: string;
  /** Prueba de salto aprobada: unidades completadas y unidad que se abrió. */
  skipped_units?: number[];
  unlocked_unit?: number | null;
}

export interface ShopItem {
  id: string;
  code: string;
  name: string;
  description: string;
  item_type: 'streak_shield' | 'streak_repair' | 'hearts_refill' | 'profile_frame' | 'theme' | 'title';
  cost_ink: number;
  icon: string;
  asset_url: string;
  value: string;
  sort_order: number;
  is_owned: boolean;
  is_equipped: boolean;
  quantity: number;
}

@Injectable({
  providedIn: 'root'
})
export class LearningService {
  private readonly baseUrl = `${environment.apiUrl}learning/`;

  private userStatusSubject = new BehaviorSubject<UserStatus | null>(null);
  public userStatus$ = this.userStatusSubject.asObservable();

  constructor(private http: HttpClient) {}

  getPath(): Observable<{ user_status: UserStatus; units: LearningUnit[] }> {
    return this.http.get<{ user_status: UserStatus; units: LearningUnit[] }>(`${this.baseUrl}path/`).pipe(
      tap(res => {
        if (res.user_status) {
          this.userStatusSubject.next(res.user_status);
        }
      })
    );
  }

  getLevelSession(levelId: string): Observable<ExerciseSession> {
    return this.http.get<ExerciseSession>(`${this.baseUrl}levels/${levelId}/session/`);
  }

  checkAnswer(levelId: string, questionId: string, answer: any): Observable<CheckResult> {
    return this.http.post<CheckResult>(`${this.baseUrl}levels/${levelId}/check/`, {
      question_id: questionId,
      answer,
    });
  }

  submitLevel(levelId: string, payload: { answers: any; duration_seconds: number }): Observable<ExerciseSubmitResult> {
    return this.http.post<ExerciseSubmitResult>(`${this.baseUrl}levels/${levelId}/submit/`, payload).pipe(
      tap(res => {
        const current = this.userStatusSubject.value;
        if (current && res.passed) {
          this.userStatusSubject.next({
            ...current,
            hearts: res.hearts_remaining,
            ink_balance: res.ink_balance,
            streak_current: res.streak_current,
            is_secured_today: true,
            is_in_danger: false,
          });
        } else if (current && !res.passed) {
          this.userStatusSubject.next({
            ...current,
            hearts: res.hearts_remaining
          });
        }
      })
    );
  }

  // ── Prueba de salto ──

  getSkipSession(unitId: string): Observable<ExerciseSession> {
    return this.http.get<ExerciseSession>(`${this.baseUrl}units/${unitId}/skip/session/`);
  }

  checkSkipAnswer(unitId: string, questionId: string, answer: any): Observable<CheckResult> {
    return this.http.post<CheckResult>(`${this.baseUrl}units/${unitId}/skip/check/`, {
      question_id: questionId,
      answer,
    });
  }

  submitSkip(unitId: string, payload: { answers: any; duration_seconds: number }): Observable<ExerciseSubmitResult> {
    return this.http.post<ExerciseSubmitResult>(`${this.baseUrl}units/${unitId}/skip/submit/`, payload).pipe(
      tap(res => {
        const current = this.userStatusSubject.value;
        if (current) {
          this.userStatusSubject.next({
            ...current,
            hearts: res.hearts_remaining,
            ink_balance: res.ink_balance ?? current.ink_balance,
            streak_current: res.streak_current ?? current.streak_current,
          });
        }
      })
    );
  }

  getStreakStatus(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}streak/`);
  }

  repairStreak(): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}streak/repair/`, {});
  }

  getHeartsStatus(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}hearts/`);
  }

  refillHearts(): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}hearts/refill/`, {}).pipe(
      tap(res => {
        if (res.success) {
          const current = this.userStatusSubject.value;
          if (current) {
            this.userStatusSubject.next({
              ...current,
              hearts: 5,
              ink_balance: res.ink_balance
            });
          }
        }
      })
    );
  }

  getShopItems(): Observable<ShopItem[]> {
    return this.http.get<ShopItem[]>(`${this.baseUrl}shop/`);
  }

  buyShopItem(itemCode: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}shop/buy/`, { item_code: itemCode }).pipe(
      tap(res => {
        if (res.success) {
          const current = this.userStatusSubject.value;
          if (current) {
            this.userStatusSubject.next({
              ...current,
              ink_balance: res.ink_balance,
              streak_shields: res.streak_shields ?? current.streak_shields,
              hearts: res.hearts ?? current.hearts,
            });
          }
        }
      })
    );
  }

  equipShopItem(itemCode: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}shop/equip/`, { item_code: itemCode }).pipe(
      tap(res => {
        if (res.success) {
          const current = this.userStatusSubject.value;
          if (current) {
            this.userStatusSubject.next({
              ...current,
              equipped_frame: res.equipped_frame ?? current.equipped_frame,
              equipped_title: res.equipped_title ?? current.equipped_title,
            });
          }
        }
      })
    );
  }

  getStats(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}stats/`);
  }
}
