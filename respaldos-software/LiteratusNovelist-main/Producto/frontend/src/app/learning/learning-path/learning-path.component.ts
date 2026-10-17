// src/app/learning/learning-path/learning-path.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { LearningService, UserStatus, LearningUnit, LearningLevel, PathChest, ChestClaimResult } from '../../core/services/learning.service';
import { ChatService } from '../../core/services/chat.service';
import { MaguitoOutfit, parseWear } from '../../core/components/maguito/maguito-outfit';
import { PATH_REALMS, PathRealm } from './path-realms';

@Component({
  selector: 'app-learning-path',
  templateUrl: './learning-path.component.html',
  styleUrls: ['./learning-path.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LearningPathComponent implements OnInit, OnDestroy {
  private learningService = inject(LearningService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private chatService = inject(ChatService);
  private cdr = inject(ChangeDetectorRef);
  private element = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroy$ = new Subject<void>();

  isLoading = true;
  userStatus: UserStatus | null = null;
  units: LearningUnit[] = [];
  realms: PathRealm[] = [];
  chests: PathChest[] = [];
  loadError = '';
  pageHidden = typeof document !== 'undefined' && document.hidden;
  reducedMotion = false;
  selectedChest: PathChest | null = null;
  chestResult: ChestClaimResult | null = null;
  chestError = '';
  readonly claimingCodes = new Set<string>();
  private motionQuery?: MediaQueryList;
  private returnFocus: HTMLElement | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private queryChest: string | null = null;
  private queryUnit: string | null = null;
  private focusedQuery = '';
  /** El siguiente nivel por jugar: lleva el globo «¡EMPEZAR!» y la vista se centra en él. */
  currentLevelId: string | null = null;
  private scrolledToCurrent = false;

  // Modales
  selectedLevel: LearningLevel | null = null;
  selectedUnit: LearningUnit | null = null;
  showLevelModal = false;

  showStreakModal = false;
  streakDetails: any = null;

  /** Prueba de salto: la unidad bloqueada a la que el lector quiere saltar. */
  showSkipModal = false;
  skipUnit: LearningUnit | null = null;

  showHeartsModal = false;
  heartsDetails: any = null;

  ngOnInit(): void {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionQuery.matches;
      this.motionQuery.addEventListener('change', this.motionChanged);
    }
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.queryChest = params.get('chest');
      this.queryUnit = params.get('unit');
      if (!this.isLoading) this.scrollToCurrent();
    });
    this.loadPath();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.motionQuery?.removeEventListener('change', this.motionChanged);
    this.timers.forEach(timer => clearTimeout(timer));
  }

  private readonly motionChanged = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
    this.cdr.markForCheck();
  };

  @HostListener('document:visibilitychange') onVisibilityChange(): void {
    this.pageHidden = document.hidden;
    this.cdr.markForCheck();
  }

  private later(callback: () => void): void {
    const timer = setTimeout(() => { this.timers.delete(timer); callback(); });
    this.timers.add(timer);
  }

  loadPath(): void {
    this.isLoading = true;
    this.loadError = '';
    this.learningService.getPath()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.userStatus = data.user_status;
          this.units = data.units;
          this.chests = data.chests || [];
          this.realms = PATH_REALMS.map(realm => ({
            ...realm,
            units: data.units.filter(unit => Math.ceil(unit.unit_number / 5) === realm.number),
            chest: this.chests.find(chest => chest.kind === 'realm' && chest.realm_number === realm.number),
          })).filter(realm => realm.units.length > 0);
          this.currentLevelId = this.findCurrentLevel(data.units);
          this.isLoading = false;
          this.cdr.markForCheck();
          this.scrollToCurrent();
        },
        error: (err) => {
          this.loadError = err.status === 401 ? 'Inicia sesión para continuar tu aventura.' : 'No pudimos cargar La Senda. Revisa tu conexión y vuelve a intentarlo.';
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private findCurrentLevel(units: LearningUnit[]): string | null {
    for (const unit of units) {
      const next = unit.levels.find(level => level.is_unlocked && !level.is_completed);
      if (next) return next.id;
    }
    return null;
  }

  /** Un enlace a una recompensa tiene prioridad sobre el retorno al nivel actual. */
  private scrollToCurrent(): void {
    const chest = this.chests.find(item => item.code === this.queryChest);
    const unit = this.units.find(item => String(item.unit_number) === this.queryUnit);
    const query = chest ? `chest-${chest.code}` : unit ? `unit-${unit.unit_number}` : '';
    if (query && query !== this.focusedQuery) {
      this.focusedQuery = query;
      this.later(() => {
        const target = this.element.nativeElement.querySelector<HTMLElement>(`[id="${query}"]`);
        target?.scrollIntoView({ block: chest ? 'center' : 'start', behavior: 'auto' });
        if (chest) target?.focus({ preventScroll: true });
      });
      return;
    }
    if (query || this.scrolledToCurrent || !this.currentLevelId) return;
    this.scrolledToCurrent = true;
    // Al empezar la aventura se conserva la presentación del primer bosque.
    if (this.units[0]?.levels[0]?.id === this.currentLevelId) return;
    this.later(() => {
      this.element.nativeElement.querySelector(`[data-level-id="${this.currentLevelId}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  }

  returnToCurrent(): void {
    const target = this.element.nativeElement.querySelector<HTMLElement>(`[data-level-id="${this.currentLevelId}"]`);
    target?.scrollIntoView({ block: 'center', behavior: this.reducedMotion ? 'auto' : 'smooth' });
    target?.focus({ preventScroll: true });
  }

  goToRealm(realm: PathRealm): void {
    const target = this.element.nativeElement.querySelector<HTMLElement>(`[id="realm-${realm.number}"]`);
    target?.scrollIntoView({ block: 'start', behavior: this.reducedMotion ? 'auto' : 'smooth' });
    target?.focus({ preventScroll: true });
  }

  nodeX(index: number): number { return [50, 65.28, 51.39, 34.03, 50][index % 5]; }
  nodeY(index: number): number { return [10, 28, 46, 64, 84][index % 5]; }
  unitChest(unit: LearningUnit): PathChest | undefined { return this.chests.find(chest => chest.kind === 'unit' && chest.unit_number === unit.unit_number); }
  realmProgress(realm: PathRealm): number { return Math.round(realm.units.reduce((sum, unit) => sum + unit.progress_percentage, 0) / Math.max(realm.units.length, 1)); }
  chestState(chest: PathChest): string { return { locked: 'Por descubrir', available: 'Abrir cofre', claimed: 'Recogido' }[chest.state]; }
  levelLabel(level: LearningLevel): string { return level.is_exam ? 'Castillo de la unidad' : level.is_chest ? 'Sala de minijuegos' : `Lectura ${level.level_number}`; }

  get rewardPreview(): NonNullable<LearningLevel['reward_preview']> | null {
    const level = this.selectedLevel;
    if (!level) return null;
    return level.reward_preview || {
      xp: level.is_completed ? 5 : level.xp_reward,
      ink: level.is_completed ? 0 : Math.min(level.ink_reward, 10),
      perfect_bonus_xp: level.is_completed ? 0 : 10,
      perfect_bonus_ink: level.is_completed ? 0 : 3,
      is_practice: level.is_completed,
    };
  }

  get chestOutfit(): MaguitoOutfit | null {
    const wear = parseWear(this.selectedChest?.item?.value);
    return wear ? { [wear.slot]: wear.variant } : null;
  }

  openChest(chest: PathChest): void {
    this.rememberFocus();
    this.selectedChest = chest;
    this.chestResult = null;
    this.chestError = '';
    this.focusDialog();
    this.cdr.markForCheck();
  }

  closeChest(): void {
    this.selectedChest = null;
    this.restoreFocus();
    this.cdr.markForCheck();
  }

  claimChest(): void {
    const chest = this.selectedChest;
    if (!chest || chest.state !== 'available' || this.claimingCodes.has(chest.code)) return;
    this.claimingCodes.add(chest.code);
    this.chestError = '';
    this.cdr.markForCheck();
    this.learningService.claimChest(chest.code).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.claimingCodes.delete(chest.code);
        if (!result.success) {
          this.chestError = 'El cofre sigue cerrado. Inténtalo de nuevo.';
          this.cdr.markForCheck();
          return;
        }
        this.chests = this.chests.map(item => item.code === chest.code ? result.chest : item);
        this.realms = this.realms.map(realm => realm.chest?.code === chest.code ? { ...realm, chest: result.chest } : realm);
        if (this.selectedChest?.code === chest.code) {
          this.selectedChest = result.chest;
          this.chestResult = result;
        }
        if (this.userStatus) this.userStatus = { ...this.userStatus, ink_balance: result.ink_balance };
        this.chatService.updateInkBalance(result.ink_balance);
        this.chatService.notifyProfileUpdate();
        this.cdr.markForCheck();
        this.focusDialog();
      },
      error: error => {
        this.claimingCodes.delete(chest.code);
        if (this.selectedChest?.code === chest.code) {
          this.chestError = error.status === 403 ? 'Aún te quedan etapas por superar. Completa el requisito del cofre.' : 'No se pudo confirmar la apertura. Inténtalo de nuevo; tu premio se entrega una sola vez.';
        }
        this.cdr.markForCheck();
      },
    });
  }

  seeChestWardrobe(): void {
    this.router.navigate(['/tavern'], { queryParams: { bazar: 'ropero' } });
  }

  private rememberFocus(): void { this.returnFocus = document.activeElement as HTMLElement | null; }
  private restoreFocus(): void { this.later(() => this.returnFocus?.isConnected && this.returnFocus.focus({ preventScroll: true })); }
  private focusDialog(): void {
    this.later(() => this.element.nativeElement.querySelector<HTMLElement>('[role="dialog"] .close-btn')?.focus());
  }

  @HostListener('document:keydown', ['$event']) onDialogKeydown(event: KeyboardEvent): void {
    const dialog = this.element.nativeElement.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.selectedChest) this.closeChest();
      else if (this.showLevelModal) this.closeLevelModal();
      else if (this.showSkipModal) this.closeSkipModal();
      else if (this.showStreakModal) this.closeStreakModal();
      else if (this.showHeartsModal) this.closeHeartsModal();
    } else if (event.key === 'Tab') {
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }

  onNodeClick(unit: LearningUnit, level: LearningLevel): void {
    if (!level.is_unlocked) {
      return;
    }
    this.rememberFocus();
    this.selectedUnit = unit;
    this.selectedLevel = level;
    this.showLevelModal = true;
    this.focusDialog();
    this.cdr.markForCheck();
  }

  startLevel(): void {
    if (!this.selectedLevel) return;
    if (this.userStatus && this.userStatus.hearts <= 0) {
      this.showLevelModal = false;
      this.openHeartsModal();
      return;
    }
    this.router.navigate(['/learn/play', this.selectedLevel.id]);
  }

  closeLevelModal(): void {
    this.showLevelModal = false;
    this.selectedLevel = null;
    this.restoreFocus();
    this.cdr.markForCheck();
  }

  openSkipModal(unit: LearningUnit): void {
    this.rememberFocus();
    this.skipUnit = unit;
    this.showSkipModal = true;
    this.focusDialog();
    this.cdr.markForCheck();
  }

  closeSkipModal(): void {
    this.showSkipModal = false;
    this.skipUnit = null;
    this.restoreFocus();
    this.cdr.markForCheck();
  }

  /** «la unidad 1», «las unidades 1 y 2» o «las unidades 1 a 6»: lo que se salta. */
  skippedLabel(target: LearningUnit): string {
    const numbers = this.units
      .filter(unit => unit.order < target.order && unit.progress_percentage < 100)
      .map(unit => unit.unit_number);
    if (numbers.length <= 1) return `la unidad ${numbers[0] ?? target.unit_number - 1}`;
    if (numbers.length === 2) return `las unidades ${numbers[0]} y ${numbers[1]}`;
    return `las unidades ${numbers[0]} a ${numbers[numbers.length - 1]}`;
  }

  startSkip(): void {
    if (!this.skipUnit) return;
    if (this.userStatus && this.userStatus.hearts <= 0) {
      this.closeSkipModal();
      this.openHeartsModal();
      return;
    }
    this.router.navigate(['/learn/skip', this.skipUnit.id]);
  }

  openStreakModal(): void {
    this.rememberFocus();
    this.learningService.getStreakStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.streakDetails = data;
        this.showStreakModal = true;
        this.focusDialog();
        this.cdr.markForCheck();
      });
  }

  closeStreakModal(): void {
    this.showStreakModal = false;
    this.restoreFocus();
    this.cdr.markForCheck();
  }

  repairStreak(): void {
    this.learningService.repairStreak()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.loadPath();
            this.openStreakModal();
          }
        }
      });
  }

  openHeartsModal(): void {
    this.rememberFocus();
    this.learningService.getHeartsStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.heartsDetails = data;
        this.showHeartsModal = true;
        this.focusDialog();
        this.cdr.markForCheck();
      });
  }

  closeHeartsModal(): void {
    this.showHeartsModal = false;
    this.restoreFocus();
    this.cdr.markForCheck();
  }

  refillHearts(): void {
    this.learningService.refillHearts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.openHeartsModal();
            this.loadPath();
          }
        }
      });
  }

  goToTavern(): void {
    this.router.navigate(['/tavern'], { queryParams: { bazar: 'racha' } });
  }

  trackByUnit(index: number, unit: LearningUnit): string {
    return unit.id || `${unit.unit_number}-${index}`;
  }

  trackByLevel(index: number, level: LearningLevel): string {
    return level.id || `${level.level_number}-${index}`;
  }
}
