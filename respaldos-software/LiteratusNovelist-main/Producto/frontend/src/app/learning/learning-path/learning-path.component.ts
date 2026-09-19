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

  // Modales
  selectedLevel: LearningLevel | null = null;
  selectedUnit: LearningUnit | null = null;
  showLevelModal = false;

  showStreakModal = false;
  streakDetails: any = null;

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
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error al cargar senda de aprendizaje', err);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
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
