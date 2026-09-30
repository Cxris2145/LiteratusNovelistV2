// src/app/learning/play-level/play-level.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { LearningService, ExerciseSession, ExerciseSubmitResult } from '../../core/services/learning.service';

type GameState = 'reading' | 'quiz' | 'victory' | 'game_over';

@Component({
  selector: 'app-play-level',
  templateUrl: './play-level.component.html',
  styleUrls: ['./play-level.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayLevelComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public learningService = inject(LearningService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  levelId: string = '';
  isLoading = true;
  gameState: GameState = 'reading';

  session: ExerciseSession | null = null;
  currentPageIndex: number = 0;

  // Cuestionario
  currentQuestionIndex: number = 0;
  selectedAnswers: { [questionId: string]: any } = {};
  currentSelectedOptionId: any = null;
  orderedItems: string[] = [];

  // Feedback por pregunta
  isQuestionChecked = false;
  isCurrentAnswerCorrect = false;
  currentExplanation = '';

  // Vidas del jugador durante la sesión
  currentHearts: number = 5;

  // Tiempo
  startTime: number = 0;

  // Resultado final
  result: ExerciseSubmitResult | null = null;

  ngOnInit(): void {
    this.levelId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.levelId) {
      this.router.navigate(['/learn']);
      return;
    }
    this.loadSession();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSession(): void {
    this.isLoading = true;
    this.learningService.getLevelSession(this.levelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (session) => {
          this.session = session;
          this.isLoading = false;
          this.startTime = Date.now();
          this.initQuestionState();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error al cargar sesión de comprensión', err);
          if (err?.error?.error === 'NO_HEARTS') {
            this.gameState = 'game_over';
          } else {
            this.router.navigate(['/learn']);
          }
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  // ── FASE 1: LECTURA DE PÁGINAS ──
  nextPage(): void {
    if (!this.session) return;
    if (this.currentPageIndex < this.session.pages.length - 1) {
      this.currentPageIndex++;
      this.cdr.markForCheck();
    }
  }

  prevPage(): void {
    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
      this.cdr.markForCheck();
    }
  }

  startQuiz(): void {
    this.gameState = 'quiz';
    this.currentQuestionIndex = 0;
    this.initQuestionState();
    this.cdr.markForCheck();
  }

  // ── FASE 2: PREGUNTAS ──
  get currentQuestion(): any {
    if (!this.session || !this.session.questions) return null;
    return this.session.questions[this.currentQuestionIndex];
  }

  get quizProgressPercent(): number {
    if (!this.session || !this.session.questions) return 0;
    return Math.round((this.currentQuestionIndex / this.session.questions.length) * 100);
  }

  initQuestionState(): void {
    this.isQuestionChecked = false;
    this.isCurrentAnswerCorrect = false;
    this.currentExplanation = '';
    this.currentSelectedOptionId = null;

    if (this.currentQuestion && this.currentQuestion.type === 'order_events') {
      this.orderedItems = [...(this.currentQuestion.order_items || [])];
    }
  }

  selectOption(optId: string): void {
    if (this.isQuestionChecked) return;
    this.currentSelectedOptionId = optId;
    this.selectedAnswers[this.currentQuestion.id] = optId;
    this.cdr.markForCheck();
  }

  moveOrderItem(index: number, direction: 'up' | 'down'): void {
    if (this.isQuestionChecked) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= this.orderedItems.length) return;

    const temp = this.orderedItems[index];
    this.orderedItems[index] = this.orderedItems[targetIdx];
    this.orderedItems[targetIdx] = temp;
    this.selectedAnswers[this.currentQuestion.id] = [...this.orderedItems];
    this.cdr.markForCheck();
  }

  canCheck(): boolean {
    if (!this.currentQuestion) return false;
    if (this.currentQuestion.type === 'order_events') {
      return this.orderedItems.length > 0;
    }
    return this.currentSelectedOptionId !== null;
  }

  checkAnswer(): void {
    if (!this.canCheck() || this.isQuestionChecked) return;

    if (this.currentQuestion.type === 'order_events') {
      this.selectedAnswers[this.currentQuestion.id] = [...this.orderedItems];
    }

    this.isQuestionChecked = true;
    this.cdr.markForCheck();
  }

  continueNextQuestion(): void {
    if (!this.session) return;

    if (this.currentQuestionIndex < this.session.questions.length - 1) {
      this.currentQuestionIndex++;
      this.initQuestionState();
      this.cdr.markForCheck();
    } else {
      // Fin del cuestionario -> Enviar intento
      this.submitAttempt();
    }
  }

  submitAttempt(): void {
    this.isLoading = true;
    const duration = Math.round((Date.now() - this.startTime) / 1000);

    this.learningService.submitLevel(this.levelId, {
      answers: this.selectedAnswers,
      duration_seconds: duration
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.result = result;
          this.isLoading = false;
          if (result.passed) {
            this.gameState = 'victory';
          } else {
            if (result.hearts_remaining <= 0) {
              this.gameState = 'game_over';
            } else {
              this.gameState = 'victory'; // Muestra resumen con resultado no aprobado
            }
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error al enviar intento de nivel', err);
          this.isLoading = false;
          this.router.navigate(['/learn']);
        }
      });
  }

  quitSession(): void {
    if (confirm('¿Estás seguro de salir? Perderás el progreso de este ejercicio.')) {
      this.router.navigate(['/learn']);
    }
  }

  returnToPath(): void {
    this.router.navigate(['/learn']);
  }

  retryLevel(): void {
    this.gameState = 'reading';
    this.currentPageIndex = 0;
    this.currentQuestionIndex = 0;
    this.selectedAnswers = {};
    this.result = null;
    this.startTime = Date.now();
    this.initQuestionState();
    this.cdr.markForCheck();
  }

  goToTavern(): void {
    this.router.navigate(['/tavern']);
  }
}
