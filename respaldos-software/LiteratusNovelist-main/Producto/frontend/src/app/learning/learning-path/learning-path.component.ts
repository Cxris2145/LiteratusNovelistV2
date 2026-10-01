// src/app/learning/learning-path/learning-path.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { LearningService, UserStatus, LearningUnit, LearningLevel } from '../../core/services/learning.service';

@Component({
  selector: 'app-learning-path',
  templateUrl: './learning-path.component.html',
  styleUrls: ['./learning-path.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LearningPathComponent implements OnInit, OnDestroy {
  private learningService = inject(LearningService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  isLoading = true;
  userStatus: UserStatus | null = null;
  units: LearningUnit[] = [];
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
    this.loadPath();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPath(): void {
    this.isLoading = true;
    this.learningService.getPath()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.userStatus = data.user_status;
          this.units = data.units;
          this.currentLevelId = this.findCurrentLevel(data.units);
          this.isLoading = false;
          this.cdr.markForCheck();
          this.scrollToCurrent();
        },
        error: (err) => {
          console.error('Error al cargar senda de aprendizaje', err);
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

  /** Con 100 niveles, al entrar se lleva la vista al nivel que toca (una sola vez). */
  private scrollToCurrent(): void {
    if (this.scrolledToCurrent || !this.currentLevelId) return;
    this.scrolledToCurrent = true;
    setTimeout(() => {
      document.querySelector(`[data-level-id="${this.currentLevelId}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  }

  // Offset horizontal para el sendero serpenteante (zigzag estilizado)
  getNodeOffset(index: number): string {
    const offsets = ['0px', '45px', '70px', '45px', '0px', '-45px', '-70px', '-45px'];
    return offsets[index % offsets.length];
  }

  onNodeClick(unit: LearningUnit, level: LearningLevel): void {
    if (!level.is_unlocked) {
      return;
    }
    this.selectedUnit = unit;
    this.selectedLevel = level;
    this.showLevelModal = true;
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
    this.cdr.markForCheck();
  }

  openSkipModal(unit: LearningUnit): void {
    this.skipUnit = unit;
    this.showSkipModal = true;
    this.cdr.markForCheck();
  }

  closeSkipModal(): void {
    this.showSkipModal = false;
    this.skipUnit = null;
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
    this.learningService.getStreakStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.streakDetails = data;
        this.showStreakModal = true;
        this.cdr.markForCheck();
      });
  }

  closeStreakModal(): void {
    this.showStreakModal = false;
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
    this.learningService.getHeartsStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.heartsDetails = data;
        this.showHeartsModal = true;
        this.cdr.markForCheck();
      });
  }

  closeHeartsModal(): void {
    this.showHeartsModal = false;
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
    this.router.navigate(['/tavern']);
  }
}
