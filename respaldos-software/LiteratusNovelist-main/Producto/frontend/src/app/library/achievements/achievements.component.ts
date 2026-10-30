// src/app/library/achievements/achievements.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
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
  NormalizedRarity,
  normalizeAchievementRarity,
} from '../../core/services/achievements.service';
import { GamificationService } from '../../core/services/gamification.service';
import { ChatService } from '../../core/services/chat.service';

export type PillarCategoryFilter = 'all' | 'reading' | 'social' | 'games' | 'learning';
export type SortOption = 'default' | 'rarest' | 'recent' | 'missing';
type MainTab = 'achievements' | 'collection' | 'history' | 'missions' | 'levels';

interface CategoryTab {
  key: PillarCategoryFilter;
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

  /** Fase 1: Únicamente los 5 pilares fundamentales en la barra de filtrado rápido */
  activeFilter: PillarCategoryFilter = 'all';

  /** Fase 3: Ordenamiento independiente de los filtros de categoría */
  sortBy: SortOption = 'default';
  sortMenuOpen = false;

  /** Fase 2: Logro inspeccionado mediante clic para ver porcentaje global en dispositivos táctiles o escritorio */
  inspectedCode: string | null = null;

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

  readonly rarityLabels: Record<NormalizedRarity, string> = {
    bronze: 'Bronce',
    silver: 'Plata',
    gold: 'Oro',
    diamond: 'Diamante',
  };

  readonly sortOptions: { key: SortOption; label: string; icon: string }[] = [
    { key: 'default', label: 'Por defecto', icon: 'apps' },
    { key: 'rarest',  label: 'Más raros primero', icon: 'diamond' },
    { key: 'recent',  label: 'Recientes', icon: 'schedule' },
    { key: 'missing', label: 'Faltantes', icon: 'pending_actions' },
  ];

  // Recompensa Diaria
  dailyReward: any = null;
  isClaimingReward = false;
  rewardClaimedSuccess = false;

  /** Fase 1: Pilares fundamentales acotados (Racha, Horario y Lector activo consolidados en Lectura; Exploración y Colección en La Senda + Perfil) */
  readonly tabs: CategoryTab[] = [
    { key: 'all',      label: 'Todos',    icon: '🌟' },
    { key: 'reading',  label: 'Lectura',  icon: '📚' },
    { key: 'social',   label: 'Social',   icon: '🥂' },
    { key: 'games',    label: 'Juegos',   icon: '🧩' },
    { key: 'learning', label: 'La Senda', icon: '🥾' },
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

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.sortMenuOpen) {
      this.sortMenuOpen = false;
      this.cdr.markForCheck();
    }
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

          if (this.profile && res.new_ink_balance !== undefined) {
            this.profile = {
              ...this.profile,
              ink_balance: res.new_ink_balance,
              xp: res.new_xp !== undefined ? res.new_xp : this.profile.xp,
              level: res.new_level !== undefined ? res.new_level : this.profile.level
            };
          }

          if (res.new_ink_balance !== undefined) {
            this.chatService.updateInkBalance(res.new_ink_balance);
          }

          this.gamificationService.notifyInk(res.ink_reward, 'Recompensa Diaria');
          this.gamificationService.notifyXP(res.xp_reward, 'Recompensa Diaria');

          const toastMessage = res.message || `¡Has recibido +${res.ink_reward} Gotas de Tinta y +${res.xp_reward} XP!`;
          this.notificationService.success(toastMessage, 'Recompensa Reclamada');

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

  /** Normaliza cualquier categoría heredada hacia uno de los 4 pilares temáticos */
  mapToPillar(category: AchievementCategory | string): PillarCategoryFilter {
    switch (category) {
      case 'reading':
      case 'streak':
      case 'time':
      case 'reader':
        return 'reading';
      case 'social':
        return 'social';
      case 'games':
        return 'games';
      case 'learning':
      case 'exploration':
      case 'collection':
        return 'learning';
      default:
        return 'reading';
    }
  }

  setFilter(filter: PillarCategoryFilter | AchievementCategory): void {
    if (filter === 'all') {
      this.activeFilter = 'all';
    } else {
      this.activeFilter = this.mapToPillar(filter);
    }
  }

  setSort(option: SortOption, event?: Event): void {
    event?.stopPropagation();
    this.sortBy = option;
    this.sortMenuOpen = false;
    this.cdr.markForCheck();
  }

  toggleSortMenu(event: Event): void {
    event.stopPropagation();
    this.sortMenuOpen = !this.sortMenuOpen;
  }

  get currentSortLabel(): string {
    return this.sortOptions.find(o => o.key === this.sortBy)?.label || 'Por defecto';
  }

  toggleInspect(code: string, event?: Event): void {
    event?.stopPropagation();
    this.inspectedCode = this.inspectedCode === code ? null : code;
  }

  rarityTier(ua: UserAchievement): NormalizedRarity {
    return normalizeAchievementRarity(ua.achievement.rarity);
  }

  rarityWeight(ua: UserAchievement): number {
    const tier = this.rarityTier(ua);
    return tier === 'diamond' ? 4 : tier === 'gold' ? 3 : tier === 'silver' ? 2 : 1;
  }

  globalPercentage(ua: UserAchievement): number {
    if (ua.achievement.global_unlock_percentage !== undefined && ua.achievement.global_unlock_percentage !== null) {
      return ua.achievement.global_unlock_percentage;
    }
    const tier = this.rarityTier(ua);
    return tier === 'diamond' ? 1.8 : tier === 'gold' ? 8.5 : tier === 'silver' ? 22.0 : 52.0;
  }

  switchTab(tab: MainTab) {
    this.activeTab = tab;
  }

  /**
   * Fusiona el catálogo con el progreso del usuario.
   */
  get allAchievements(): UserAchievement[] {
    const userMap = new Map(
      this.userAchievements.map(ua => [ua.achievement.code, ua])
    );

    return this.catalogAchievements.map(cat => {
      if (userMap.has(cat.code)) {
        return userMap.get(cat.code)!;
      }
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
  }

  /** Sub-hitos de Exploración y Colección integrados en el resumen del perfil y en La Senda */
  get explorationSubMilestones(): { unlocked: number; total: number } {
    const codes = new Set(['classic_explorer_3', 'classic_explorer_10', 'genres_5']);
    const list = this.allAchievements.filter(
      ua => ua.achievement.sub_group === 'exploration' || ua.achievement.category === 'exploration' || codes.has(ua.achievement.code)
    );
    return {
      unlocked: list.filter(ua => ua.is_unlocked).length,
      total: list.length || 3,
    };
  }

  get collectionSubMilestones(): { unlocked: number; total: number } {
    const codes = new Set(['level_5', 'bazar_5', 'maguito_full']);
    const list = this.allAchievements.filter(
      ua => ua.achievement.sub_group === 'collection' || ua.achievement.category === 'collection' || codes.has(ua.achievement.code)
    );
    return {
      unlocked: list.filter(ua => ua.is_unlocked).length,
      total: list.length || 3,
    };
  }

  get mergedAchievements(): UserAchievement[] {
    const filtered = this.allAchievements.filter(
      ua => this.activeFilter === 'all' || this.mapToPillar(ua.achievement.category) === this.activeFilter
    );

    const list = [...filtered];
    switch (this.sortBy) {
      case 'rarest':
        return list.sort((a, b) => {
          const pctDiff = this.globalPercentage(a) - this.globalPercentage(b);
          if (Math.abs(pctDiff) > 0.05) return pctDiff;
          return this.rarityWeight(b) - this.rarityWeight(a);
        });
      case 'recent':
        return list.sort((a, b) => {
          if (a.is_unlocked && b.is_unlocked) {
            const timeA = a.unlocked_at ? Date.parse(a.unlocked_at) : 0;
            const timeB = b.unlocked_at ? Date.parse(b.unlocked_at) : 0;
            return timeB - timeA;
          }
          if (a.is_unlocked !== b.is_unlocked) return a.is_unlocked ? -1 : 1;
          return b.progress_percentage - a.progress_percentage;
        });
      case 'missing':
        return list.sort((a, b) => {
          if (a.is_unlocked !== b.is_unlocked) return a.is_unlocked ? 1 : -1;
          if (!a.is_unlocked && !b.is_unlocked) {
            return b.progress_percentage - a.progress_percentage || (a.achievement.sort_order - b.achievement.sort_order);
          }
          return a.achievement.sort_order - b.achievement.sort_order;
        });
      default:
        return list.sort((a, b) => a.achievement.sort_order - b.achievement.sort_order);
    }
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
    this.activeFilter = achievement ? this.mapToPillar(achievement.category) : 'all';
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
