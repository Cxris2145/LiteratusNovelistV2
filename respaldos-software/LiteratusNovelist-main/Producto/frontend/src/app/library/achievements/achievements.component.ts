// src/app/library/achievements/achievements.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LearningService, ShopItem } from '../../core/services/learning.service';
import { MaguitoOutfit, parseWear } from '../../core/components/maguito/maguito-outfit';
import { NotificationService } from '../../core/services/notification.service';
import {
  AchievementsService,
  UserAchievement,
  Achievement,
  AchievementCategory,
  AchievementRarity,
} from '../../core/services/achievements.service';
import { GamificationService } from '../../core/services/gamification.service';
import { ChatService } from '../../core/services/chat.service';

type CategoryFilter = 'all' | AchievementCategory;
type MainTab = 'achievements' | 'collection' | 'history' | 'missions' | 'levels';

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
  activeTab: MainTab = 'achievements';
  loadError = '';
  collectionError = '';
  collectionLoading = true;
  collection: ShopItem[] = [];
  collectionFilter: 'profile_frame' | 'title' | 'maguito_wear' = 'profile_frame';
  busyItem = '';
  previewItem: ShopItem | null = null;
  readonly rarityLabels: Record<AchievementRarity, string> = {
    common: 'Común', rare: 'Raro', epic: 'Épico', legendary: 'Legendario',
  };

  // Recompensa Diaria
  dailyReward: any = null;
  isClaimingReward = false;
  rewardClaimedSuccess = false;

  readonly tabs: CategoryTab[] = [
    { key: 'all',         label: 'Todos',       icon: '🌟' },
    { key: 'reading',     label: 'Lectura',      icon: '📚' },
    { key: 'streak',      label: 'Racha',        icon: '⚡' },
    { key: 'exploration', label: 'Exploración',  icon: '🗺️' },
    { key: 'time',        label: 'Horario',      icon: '🕐' },
    { key: 'social',      label: 'Social',       icon: '🥂' },
    { key: 'learning',    label: 'La Senda',     icon: '🥾' },
    { key: 'games',       label: 'Juegos',       icon: '🧩' },
    { key: 'reader',      label: 'Lector activo', icon: '✍️' },
    { key: 'collection',  label: 'Colección',    icon: '🎖️' },
  ];

  constructor(
    private achievementsService: AchievementsService,
    private gamificationService: GamificationService,
    private chatService: ChatService,
    private learningService: LearningService,
    private route: ActivatedRoute,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params.get('tab') === 'collection') {
        this.activeTab = 'collection';
        this.cdr.markForCheck();
      }
    });
    this.gamificationService.profile$.pipe(takeUntil(this.destroy$)).subscribe(profile => {
      this.profile = profile ? { ...profile, username: this.auth.currentUser()?.username || 'Lector' } : null;
      this.cdr.markForCheck();
    });
    this.achievementsService.changed$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadAchievements();
      this.loadCollection();
    });
    this.loadData();
    this.loadDailyReward();
    this.loadCollection();
  }

  loadDailyReward(): void {
    this.gamificationService.getDailyRewardStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          this.dailyReward = status;
          this.cdr.markForCheck();
        },
        error: (err) => console.error('Error cargando estado de recompensa diaria:', err)
      });
  }

  claimDailyReward(): void {
    if (!this.dailyReward?.can_claim || this.isClaimingReward) return;

    this.isClaimingReward = true;
    this.cdr.markForCheck();

    this.gamificationService.claimDailyReward()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isClaimingReward = false;
          this.rewardClaimedSuccess = true;
          if (this.dailyReward) {
            this.dailyReward.can_claim = false;
          }

          // Actualizar inmediatamente el perfil local en pantalla
          if (this.profile && res.new_ink_balance !== undefined) {
            this.profile = {
              ...this.profile,
              ink_balance: res.new_ink_balance,
              xp: res.new_xp !== undefined ? res.new_xp : this.profile.xp,
              level: res.new_level !== undefined ? res.new_level : this.profile.level
            };
          }

          // Actualizar el saldo global de tinta en la barra de navegación
          if (res.new_ink_balance !== undefined) {
            this.chatService.updateInkBalance(res.new_ink_balance);
          }

          // Notificaciones flotantes
          this.gamificationService.notifyInk(res.ink_reward, 'Recompensa Diaria');
          this.gamificationService.notifyXP(res.xp_reward, 'Recompensa Diaria');

          const toastMessage = res.message || `¡Has recibido +${res.ink_reward} Gotas de Tinta y +${res.xp_reward} XP!`;
          this.notificationService.success(toastMessage, 'Recompensa Reclamada');

          // Actualizar historial de tinta
          this.gamificationService.getInkHistory().pipe(takeUntil(this.destroy$)).subscribe(h => {
            this.inkHistory = h;
            this.cdr.markForCheck();
          });

          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isClaimingReward = false;
          const msg = err.error?.message || err.error?.error || 'No se pudo reclamar la recompensa en este momento.';
          this.notificationService.error(msg, 'Recompensa Diaria');
          if (err.status === 400 && (err.error?.error === 'ALREADY_CLAIMED' || err.error?.message?.includes('Ya has reclamado'))) {
            if (this.dailyReward) this.dailyReward.can_claim = false;
          }
          this.cdr.markForCheck();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(): void {
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

    this.loadAchievements();
  }

  loadAchievements(): void {
    this.isLoading = true;
    this.loadError = '';
    forkJoin({ catalog: this.achievementsService.getCatalog(), mine: this.achievementsService.getMyAchievements() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ catalog, mine }) => {
          this.catalogAchievements = catalog;
          this.userAchievements = mine;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadError = 'No pudimos cargar tus logros. Revisa tu conexión y vuelve a intentarlo.';
          this.isLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  setFilter(filter: CategoryFilter): void {
    this.activeFilter = filter;
  }

  switchTab(tab: MainTab) {
    this.activeTab = tab;
  }

  /**
   * Fusiona el catálogo con el progreso del usuario.
   * Los logros del catálogo que el usuario aún no tiene se muestran
   * como bloqueados (progreso 0).
   */
  get allAchievements(): UserAchievement[] {
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

    return merged;
  }

  get mergedAchievements(): UserAchievement[] {
    return this.allAchievements.filter(ua => this.activeFilter === 'all' || ua.achievement.category === this.activeFilter);
  }

  get almostThere(): UserAchievement[] {
    return this.allAchievements.filter(ua => !ua.is_unlocked && ua.current_progress > 0)
      .sort((a, b) => b.progress_percentage - a.progress_percentage).slice(0, 3);
  }

  loadCollection(): void {
    this.collectionError = '';
    this.learningService.getShopItems('collection').pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        this.collection = items.filter(item => ['profile_frame', 'title', 'maguito_wear'].includes(item.item_type));
        this.collectionLoading = false;
        if (this.previewItem) this.previewItem = this.collection.find(item => item.code === this.previewItem?.code) || null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.collectionLoading = false;
        this.collectionError = 'No pudimos abrir tu colección. Vuelve a intentarlo.';
        this.cdr.markForCheck();
      },
    });
  }

  get visibleCollection(): ShopItem[] {
    return this.collection.filter(item => item.item_type === this.collectionFilter);
  }

  get ownedCount(): number { return this.collection.filter(item => item.is_owned).length; }

  get previewFrame(): string {
    return this.previewItem?.item_type === 'profile_frame' ? this.previewItem.value : this.profile?.equipped_frame || '';
  }

  get previewTitle(): string {
    return this.previewItem?.item_type === 'title' ? this.previewItem.value : this.profile?.equipped_title || '';
  }

  outfitFor(value?: string): MaguitoOutfit {
    const wear = parseWear(value);
    return wear ? { ...this.profile?.outfit, [wear.slot]: wear.variant } : this.profile?.outfit || {};
  }

  toggleItem(item: ShopItem): void {
    if (this.busyItem || !item.is_owned) return;
    const slot = item.item_type === 'profile_frame' ? 'frame' : item.item_type === 'title' ? 'title' : parseWear(item.value)?.slot;
    if (!slot) return;
    this.busyItem = item.code;
    const action = item.is_equipped ? this.learningService.unequipShopSlot(slot) : this.learningService.equipShopItem(item.code);
    action.pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.busyItem = '';
        this.profile = { ...this.profile, ...res };
        this.previewItem = null;
        this.loadCollection();
        this.gamificationService.loadInitialProfile();
        this.chatService.notifyProfileUpdate();
        this.notificationService.success(res.message || 'Tu colección está actualizada.');
        this.cdr.markForCheck();
      },
      error: err => {
        this.busyItem = '';
        this.notificationService.error(err.error?.message || 'No pudimos cambiar este objeto. Inténtalo otra vez.');
        this.cdr.markForCheck();
      },
    });
  }

  showEarnedBy(item: ShopItem): void {
    if (!item.earned_by) return;
    this.activeTab = 'achievements';
    const achievement = this.catalogAchievements.find(a => a.code === item.earned_by?.code);
    this.activeFilter = achievement?.category || 'all';
    setTimeout(() => document.getElementById('achievement-' + item.earned_by?.code)?.scrollIntoView({ block: 'center' }));
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

  get xpProgress(): number {
    return this.profile?.xp_to_next_level ? Math.min(100, this.profile.xp / this.profile.xp_to_next_level * 100) : 100;
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
