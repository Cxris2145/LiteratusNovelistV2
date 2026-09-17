// src/app/library/achievements/achievements.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { Subject, takeUntil, combineLatest } from 'rxjs';
import {
  AchievementsService,
  UserAchievement,
  Achievement,
} from '../../core/services/achievements.service';
import { GamificationService } from '../../core/services/gamification.service';

type CategoryFilter = 'all' | 'reading' | 'streak' | 'exploration' | 'time' | 'social';

interface CategoryTab {
  key: CategoryFilter;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-achievements',
  templateUrl: './achievements.component.html',
  styleUrls: ['./achievements.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AchievementsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  userAchievements: UserAchievement[] = [];
  catalogAchievements: Achievement[] = [];
  isLoading = true;
  activeFilter: CategoryFilter = 'all';

  profile: any = null;
  inkHistory: any[] = [];
  missions: any[] = [];
  activeTab: 'achievements' | 'history' | 'missions' = 'achievements';

  readonly tabs: CategoryTab[] = [
    { key: 'all',         label: 'Todos',       icon: '🌟' },
    { key: 'reading',     label: 'Lectura',      icon: '📚' },
    { key: 'streak',      label: 'Racha',        icon: '⚡' },
    { key: 'exploration', label: 'Exploración',  icon: '🗺️' },
    { key: 'time',        label: 'Horario',      icon: '🕐' },
  ];

  constructor(
    private achievementsService: AchievementsService,
    private gamificationService: GamificationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(): void {
    this.isLoading = true;

    // Load Gamification profile
    this.gamificationService.profile$
      .pipe(takeUntil(this.destroy$))
      .subscribe(profile => {
        if (profile) {
          this.profile = profile;
          this.cdr.markForCheck();
        }
      });

    // Ensure profile is loaded if it hasn't been yet
    this.gamificationService.loadInitialProfile();

    this.gamificationService.getInkHistory()
      .pipe(takeUntil(this.destroy$))
      .subscribe(history => {
        this.inkHistory = history;
        this.cdr.markForCheck();
      });

    this.gamificationService.getMissions()
      .pipe(takeUntil(this.destroy$))
      .subscribe(missions => {
        this.missions = missions;
        this.cdr.markForCheck();
      });

    // Cargar catálogo completo (incluye logros aún no iniciados por el usuario)
    this.achievementsService.getCatalog()
      .pipe(takeUntil(this.destroy$))
      .subscribe(catalog => {
        this.catalogAchievements = catalog;
        this.cdr.markForCheck();
      });

    // Cargar progreso del usuario
    this.achievementsService.getMyAchievements()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (myAchievements) => {
          this.userAchievements = myAchievements;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  setFilter(filter: CategoryFilter): void {
    this.activeFilter = filter;
  }

  switchTab(tab: 'achievements' | 'history' | 'missions') {
    this.activeTab = tab;
  }

  /**
   * Fusiona el catálogo con el progreso del usuario.
   * Los logros del catálogo que el usuario aún no tiene se muestran
   * como bloqueados (progreso 0).
   */
  get mergedAchievements(): UserAchievement[] {
    const userMap = new Map(
      this.userAchievements.map(ua => [ua.achievement.code, ua])
    );

    // Convertir catálogo en UserAchievements virtuales para los no iniciados
    const merged: UserAchievement[] = this.catalogAchievements.map(cat => {
      if (userMap.has(cat.code)) {
        return userMap.get(cat.code)!;
      }
      // Logro no iniciado: construir un UserAchievement virtual con progreso 0
      return {
        id: 'virtual-' + cat.code,
        achievement: cat,
        current_progress: 0,
        progress_percentage: 0,
        is_unlocked: false,
        unlocked_at: null,
        notified: false,
      } as UserAchievement;
    });

    // Filtrar por categoría activa
    if (this.activeFilter === 'all') return merged;
    return merged.filter(ua => ua.achievement.category === this.activeFilter);
  }

  get unlockedCount(): number {
    return this.userAchievements.filter(ua => ua.is_unlocked).length;
  }

  get totalCount(): number {
    return this.catalogAchievements.length;
  }

  get progressPercent(): number {
    if (this.totalCount === 0) return 0;
    return Math.round((this.unlockedCount / this.totalCount) * 100);
  }

  formatUnlockDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-CL', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  trackByCode(_: number, ua: UserAchievement): string {
    return ua.achievement.code;
  }
}
