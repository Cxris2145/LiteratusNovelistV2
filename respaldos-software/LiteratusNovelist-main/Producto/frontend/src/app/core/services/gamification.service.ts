import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, Observable, BehaviorSubject, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChatService } from './chat.service';
import { NotificationService } from './notification.service';

export interface GamificationNotification {
  type: 'ink' | 'xp' | 'level_up' | 'achievement';
  amount?: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class GamificationService {
  private notificationsSource = new Subject<GamificationNotification>();
  public notifications$ = this.notificationsSource.asObservable();

  private profileSource = new BehaviorSubject<any>(null);
  public profile$ = this.profileSource.asObservable();

  private dailyRewardClaimableSource = new BehaviorSubject<boolean>(false);
  public dailyRewardClaimable$ = this.dailyRewardClaimableSource.asObservable();

  private lastProfile: any = null;

  constructor(
    private http: HttpClient,
    private chatService: ChatService,
    private notificationService: NotificationService
  ) {}

  notifyInk(amount: number, concept: string = 'Tinta obtenida') {
    this.notificationsSource.next({ type: 'ink', amount, message: concept });
    this.notificationService.gamify('ink', amount, concept, 'Gotas de Tinta');
  }

  notifyXP(amount: number, concept: string = 'XP obtenida') {
    this.notificationsSource.next({ type: 'xp', amount, message: concept });
    this.notificationService.gamify('xp', amount, concept, 'Experiencia Ganada');
  }

  notifyLevelUp(level: number, name: string) {
    const msg = `¡Nivel ${level}: ${name}!`;
    this.notificationsSource.next({ type: 'level_up', amount: level, message: msg });
    this.notificationService.gamify('level_up', level, `Has alcanzado el rango ${name}.`, `¡Subida a Nivel ${level}!`);
  }

  loadInitialProfile() {
    this.http.get<any>(environment.apiUrl + 'users/profile/').subscribe(profile => {
      this.lastProfile = profile;
      this.profileSource.next(profile);
    });
  }

  checkRewards() {
    this.http.get<any>(environment.apiUrl + 'users/profile/').subscribe(profile => {
      if (!this.lastProfile) {
        this.lastProfile = profile;
        this.profileSource.next(profile);
        return;
      }
      
      const inkDiff = profile.ink_balance - this.lastProfile.ink_balance;
      const xpDiff = profile.xp - this.lastProfile.xp;
      
      if (inkDiff > 0) {
        this.notifyInk(inkDiff, 'Tinta por actividad');
      }
      if (xpDiff > 0) {
        this.notifyXP(xpDiff, 'Experiencia ganada');
      }
      if (profile.level > this.lastProfile.level) {
        this.notifyLevelUp(profile.level, profile.level_name || 'Lector');
      }
      
      this.lastProfile = profile;
      this.profileSource.next(profile);
    });
  }

  getInkHistory(): Observable<any[]> {
    return this.http.get<any[]>(environment.apiUrl + 'library/ink-history/');
  }

  getMissions(): Observable<any[]> {
    return this.http.get<any[]>(environment.apiUrl + 'library/missions/');
  }

  getDailyRewardStatus(): Observable<any> {
    return this.http.get<any>(environment.apiUrl + 'library/daily-reward/status/').pipe(
      tap((val) => {
        this.dailyRewardClaimableSource.next(!!val?.can_claim);
      })
    );
  }

  claimDailyReward(): Observable<any> {
    return this.http.post<any>(environment.apiUrl + 'library/daily-reward/claim/', {}).pipe(
      tap((val) => {
        this.dailyRewardClaimableSource.next(false);
        if (val?.new_ink_balance !== undefined) {
          this.chatService.updateInkBalance(val.new_ink_balance);
        }
        if (this.lastProfile && val?.new_ink_balance !== undefined) {
          this.lastProfile = {
            ...this.lastProfile,
            ink_balance: val.new_ink_balance,
            xp: val.new_xp !== undefined ? val.new_xp : this.lastProfile.xp,
            level: val.new_level !== undefined ? val.new_level : this.lastProfile.level
          };
          this.profileSource.next(this.lastProfile);
        }
      })
    );
  }

  checkDailyRewardStatus(): void {
    this.getDailyRewardStatus().subscribe({
      next: (val) => this.dailyRewardClaimableSource.next(!!val?.can_claim),
      error: () => this.dailyRewardClaimableSource.next(false)
    });
  }
}

