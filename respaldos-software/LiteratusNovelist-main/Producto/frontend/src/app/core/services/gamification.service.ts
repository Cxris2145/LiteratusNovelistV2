import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

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

  private lastProfile: any = null;

  constructor(private http: HttpClient) {}

  notifyInk(amount: number, concept: string = 'Tinta obtenida') {
    this.notificationsSource.next({ type: 'ink', amount, message: concept });
  }

  notifyXP(amount: number, concept: string = 'XP obtenida') {
    this.notificationsSource.next({ type: 'xp', amount, message: concept });
  }

  notifyLevelUp(level: number, name: string) {
    this.notificationsSource.next({ type: 'level_up', amount: level, message: `¡Nivel ${level}: ${name}!` });
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
    return this.http.get<any>(environment.apiUrl + 'library/daily-reward/status/');
  }

  claimDailyReward(): Observable<any> {
    return this.http.post<any>(environment.apiUrl + 'library/daily-reward/claim/', {});
  }
}
