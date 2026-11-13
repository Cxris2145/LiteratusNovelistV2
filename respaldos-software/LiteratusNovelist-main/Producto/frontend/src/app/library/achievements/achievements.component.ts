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

  /** Metas en presente/imperativo para mostrar mientras el logro está bloqueado */
  private readonly lockedGoalDescriptions: Record<string, string> = {
    first_chapter: 'Abre tu primer libro y comienza a leer.',
    first_book: 'Termina tu primer libro de principio a fin.',
    books_5: 'Completa 5 libros para hacer crecer tu biblioteca personal.',
    books_10: 'Completa 10 libros de principio a fin.',
    books_25: 'Termina 25 obras completas.',
    streak_3: 'Lee durante 3 días seguidos para formar un hábito.',
    streak_7: 'Mantén una racha de lectura de 7 días seguidos.',
    streak_14: 'Lee durante 14 días seguidos.',
    streak_30: 'Mantén una racha de 30 días seguidos leyendo.',
    streak_100: 'Alcanza una racha de 100 días seguidos leyendo.',
    night_owl: 'Lee entre la medianoche y las 5 AM.',
    night_owl_10: 'Completa 10 sesiones de lectura nocturna (entre medianoche y 5 AM).',
    night_owl_25: 'Completa 25 sesiones de lectura entre la medianoche y las 5 AM.',
    early_bird: 'Lee entre las 5 y las 8 de la mañana.',
    early_bird_10: 'Completa 10 sesiones de lectura entre las 5 y las 8 de la mañana.',
    highlight_first: 'Subraya tu primer pasaje en un libro.',
    highlights_50: 'Subraya 50 pasajes en tus lecturas.',
    postits_10: 'Pega 10 post-its en tus lecturas.',
    bookmarks_10: 'Guarda 10 marcadores en tus libros.',
    review_first: 'Escribe tu primera reseña de una obra.',
    reviews_10: 'Escribe 10 reseñas en el catálogo.',
    favorites_10: 'Guarda 10 obras en tus favoritos.',
    social_first_chat: 'Inicia tu primera conversación con un personaje.',
    social_fluent: 'Mantén 1 conversación fluida y sustancial con un personaje.',
    social_fluent_5: 'Mantén conversaciones fluidas y sustanciales con 5 personajes distintos.',
    social_5_chars: 'Conversa con más de 5 personajes literarios distintos.',
    social_10_books: 'Conversa con personajes en 10 libros distintos.',
    tavern_first_friend: 'Sienta a tu primer amigo a tu mesa en La Taberna.',
    tavern_full_table: 'Reúne a 5 amigos en La Taberna.',
    tavern_toasted: 'Recibe 10 brindis de tus amigos en La Taberna.',
    senda_first: 'Aprueba tu primer nivel de La Senda del Lector.',
    senda_10: 'Aprueba 10 niveles de La Senda.',
    senda_stars_10: 'Consigue 3 estrellas en 10 niveles de La Senda.',
    senda_50: 'Aprueba 50 niveles de La Senda.',
    senda_summit: 'Completa la última unidad de La Senda del Lector.',
    classic_explorer_3: 'Completa 3 libros del mismo género.',
    classic_explorer_10: 'Completa 10 libros de un mismo género.',
    genres_5: 'Termina obras de 5 géneros distintos.',
    level_5: 'Alcanza el nivel 5 de lector.',
    bazar_5: 'Reúne 5 marcos, títulos o accesorios.',
    maguito_full: 'Viste a Maguito en sus 5 espacios a la vez.',
    enigma_first: 'Descifra tu primer enigma literario.',
    enigma_10: 'Descifra 10 enigmas literarios.',
    interrogation_first: 'Gana tu primer Interrogatorio a ciegas.',
    interrogation_10: 'Gana 10 Interrogatorios a ciegas.',
  };

  /** Textos en pasado al desbloquear para logros cuya descripción base era nominal */
  private readonly unlockedPastDescriptions: Record<string, string> = {
    books_10: 'Has completado 10 libros. La literatura corre por tus venas.',
    streak_3: 'Has leído 3 días seguidos. ¡Estás formando un hábito!',
    streak_7: 'Has leído 7 días seguidos. Una semana completa dedicada a los libros.',
    streak_14: 'Has leído 14 días seguidos. La constancia ya es parte de ti.',
    streak_30: 'Has leído 30 días sin parar. Eres un lector extraordinario.',
    streak_100: 'Has leído 100 días seguidos. Pocos llegan hasta aquí.',
    night_owl_25: 'Completaste 25 sesiones de lectura entre la medianoche y las 5 AM.',
    early_bird_10: 'Completaste 10 sesiones de lectura entre las 5 y las 8 de la mañana.',
    social_first_chat: 'Iniciaste tu primera conversación con un personaje.',
    tavern_full_table: 'Reuniste a 5 amigos en La Taberna.',
    classic_explorer_10: 'Has completado 10 libros en un mismo género. ¡Eres un experto!',
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

  achievementDescription(ua: UserAchievement): string {
    const code = ua.achievement.code;
    const rawDesc = ua.achievement.description || '';

    if (ua.is_unlocked) {
      return this.unlockedPastDescriptions[code] || rawDesc;
    }

    if (this.lockedGoalDescriptions[code]) {
      return this.lockedGoalDescriptions[code];
    }

    // Fallback para logros personalizados creados desde administración
    return rawDesc
      .replace(/^Has completado\b/i, 'Completa')
      .replace(/^Has mantenido\b/i, 'Mantén')
      .replace(/^Has conversado\b/i, 'Conversa')
      .replace(/^Terminaste\b/i, 'Termina')
      .replace(/^Abriste\b/i, 'Abre')
      .replace(/^Leíste\b/i, 'Lee')
      .replace(/^Subrayaste\b/i, 'Subraya')
      .replace(/^Pegaste\b/i, 'Pega')
      .replace(/^Guardaste\b/i, 'Guarda')
      .replace(/^Escribiste\b/i, 'Escribe')
      .replace(/^Mantuviste\b/i, 'Mantén')
      .replace(/^Conversaste\b/i, 'Conversa')
      .replace(/^Sentaste\b/i, 'Sienta')
      .replace(/^Aprobaste\b/i, 'Aprueba')
      .replace(/^Conseguiste\b/i, 'Consigue')
      .replace(/^Completaste\b/i, 'Completa')
      .replace(/^Llegaste al\b/i, 'Alcanza el')
      .replace(/^Reuniste\b/i, 'Reúne')
      .replace(/^Vestiste\b/i, 'Viste')
      .replace(/^Descifraste\b/i, 'Descifra')
      .replace(/^Ganaste\b/i, 'Gana');
  }

  trackByCode(_: number, ua: UserAchievement): string {
    return ua.achievement.code;
  }
}
