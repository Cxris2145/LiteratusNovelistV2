// src/app/learning/play-level/play-level.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, takeUntil } from 'rxjs';
import { LearningService, ExerciseSession, ExerciseSubmitResult, CheckResult } from '../../core/services/learning.service';

type GameState = 'intro' | 'reading' | 'quiz' | 'victory' | 'game_over';

/** Nombre e ícono de cada tipo de actividad. */
const ACTIVITIES: Record<string, { label: string; icon: string }> = {
  single_choice: { label: 'Comprensión', icon: 'quiz' },
  inference_prediction: { label: 'Inferencia', icon: 'psychology' },
  character_role: { label: 'Personajes', icon: 'groups' },
  context_vocabulary: { label: 'Vocabulario', icon: 'spellcheck' },
  synonym_replacement: { label: 'Sinónimos', icon: 'spellcheck' },
  fill_blank: { label: 'Completa la frase', icon: 'edit_note' },
  true_false: { label: 'Verdadero o falso', icon: 'rule' },
  order_events: { label: 'Ordena la historia', icon: 'format_list_numbered' },
  match_pairs: { label: 'Une las parejas', icon: 'join_inner' },
  word_scramble: { label: 'Anagrama', icon: 'shuffle' },
  build_sentence: { label: 'Reconstruye la frase', icon: 'segment' },
  word_hunt: { label: 'Caza la palabra', icon: 'search' },
  classify: { label: 'Clasifica', icon: 'category' },
  rapid_true_false: { label: 'Relámpago', icon: 'bolt' },
};

const PRAISE = ['¡Correcto!', '¡Muy bien!', '¡Excelente!', '¡Así se hace!'];

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

  /** En modo salto, levelId es el id de la unidad a la que se salta. */
  levelId: string = '';
  mode: 'level' | 'skip' = 'level';
  isLoading = true;
  gameState: GameState = 'reading';

  session: ExerciseSession | null = null;
  currentPageIndex: number = 0;

  // Actividades
  currentQuestionIndex: number = 0;
  selectedAnswers: { [questionId: string]: any } = {};
  currentAnswer: any = null;
  feedback: CheckResult | null = null;
  /** Sin conexión con la corrección inmediata: la respuesta se guarda y se califica al final. */
  checkUnavailable = false;
  isChecking = false;
  showText = false;

  // Tiempo
  startTime: number = 0;

  // Resultado final
  result: ExerciseSubmitResult | null = null;

  ngOnInit(): void {
    this.levelId = this.route.snapshot.paramMap.get('id') || '';
    this.mode = this.route.snapshot.data['mode'] === 'skip' ? 'skip' : 'level';
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

  get isSkip(): boolean {
    return this.mode === 'skip';
  }

  /** Unidades que se saltan, como texto: «1», «1 y 2» o «1 a 6». */
  get skippedRange(): string {
    const units = this.session?.skipped_units ?? this.result?.skipped_units ?? [];
    if (!units.length) return '';
    if (units.length === 1) return `${units[0]}`;
    if (units.length === 2) return `${units[0]} y ${units[1]}`;
    return `${units[0]} a ${units[units.length - 1]}`;
  }

  private sessionRequest(): Observable<ExerciseSession> {
    return this.isSkip ? this.learningService.getSkipSession(this.levelId) : this.learningService.getLevelSession(this.levelId);
  }

  private checkRequest(questionId: string, answer: any): Observable<CheckResult> {
    return this.isSkip
      ? this.learningService.checkSkipAnswer(this.levelId, questionId, answer)
      : this.learningService.checkAnswer(this.levelId, questionId, answer);
  }

  private submitRequest(payload: { answers: any; duration_seconds: number }): Observable<ExerciseSubmitResult> {
    return this.isSkip ? this.learningService.submitSkip(this.levelId, payload) : this.learningService.submitLevel(this.levelId, payload);
  }

  loadSession(): void {
    this.isLoading = true;
    this.sessionRequest()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (session) => {
          this.session = session;
          this.isLoading = false;
          this.startTime = Date.now();
          this.resetProgress();
          // Las salas de juego y las pruebas no tienen lectura: se presentan y se juega.
          this.gameState = session.pages?.length ? 'reading' : 'intro';
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

  private resetProgress(): void {
    this.currentPageIndex = 0;
    this.currentQuestionIndex = 0;
    this.selectedAnswers = {};
    this.result = null;
    this.showText = false;
    this.resetQuestion();
  }

  private resetQuestion(): void {
    this.currentAnswer = null;
    this.feedback = null;
    this.checkUnavailable = false;
    this.isChecking = false;
  }

  // ── FASE 1: LECTURA ──
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
    this.resetQuestion();
    this.cdr.markForCheck();
  }

  // ── FASE 2: ACTIVIDADES ──
  get currentQuestion(): any {
    return this.session?.questions?.[this.currentQuestionIndex] ?? null;
  }

  get totalQuestions(): number {
    return this.session?.questions?.length ?? 0;
  }

  /** Avance de 0 a 1: cuenta la actividad actual como hecha en cuanto se comprueba. */
  get progress(): number {
    if (!this.totalQuestions) return 0;
    const done = this.currentQuestionIndex + (this.feedback || this.checkUnavailable ? 1 : 0);
    return done / this.totalQuestions;
  }

  get activity(): { label: string; icon: string } {
    return ACTIVITIES[this.currentQuestion?.type] ?? ACTIVITIES['single_choice'];
  }

  get activityList(): { label: string; icon: string }[] {
    const seen = new Set<string>();
    return (this.session?.questions ?? [])
      .map(q => ACTIVITIES[q.type] ?? ACTIVITIES['single_choice'])
      .filter(a => !seen.has(a.label) && !!seen.add(a.label));
  }

  get isChecked(): boolean {
    return !!this.feedback || this.checkUnavailable;
  }

  get feedbackTone(): 'ok' | 'partial' | 'bad' | 'neutral' {
    if (this.checkUnavailable || !this.feedback) return 'neutral';
    if (this.feedback.is_correct) return 'ok';
    return this.feedback.fraction > 0 ? 'partial' : 'bad';
  }

  get feedbackTitle(): string {
    switch (this.feedbackTone) {
      case 'ok': return PRAISE[this.currentQuestionIndex % PRAISE.length];
      case 'partial': return `¡Casi! ${Math.round((this.feedback?.fraction ?? 0) * 100)} % correcto`;
      case 'bad': return 'No es correcto';
      default: return 'Respuesta registrada';
    }
  }

  get isLastQuestion(): boolean {
    return this.currentQuestionIndex === this.totalQuestions - 1;
  }

  trackById = (_: number, q: any) => q?.id;

  onAnswer(answer: any): void {
    if (this.isChecked) return;
    this.currentAnswer = answer;
    this.cdr.markForCheck();
  }

  canCheck(): boolean {
    return !!this.currentQuestion && this.currentAnswer !== null && this.currentAnswer !== undefined && !this.isChecked;
  }

  checkAnswer(): void {
    if (!this.canCheck() || this.isChecking) return;
    const question = this.currentQuestion;
    const answer = this.currentAnswer;
    this.selectedAnswers[question.id] = answer;
    this.isChecking = true;
    this.cdr.markForCheck();

    this.checkRequest(question.id, answer)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (feedback) => {
          this.feedback = feedback;
          this.isChecking = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('No se pudo corregir la actividad al momento', err);
          // La respuesta ya quedó guardada: se califica al final, como antes.
          this.checkUnavailable = true;
          this.isChecking = false;
          this.cdr.markForCheck();
        }
      });
  }

  /** El Relámpago se comprueba solo al terminar o al acabarse el tiempo. */
  onRapidFinished(): void {
    this.checkAnswer();
  }

  continueNextQuestion(): void {
    if (!this.session || !this.isChecked) return;
    if (!this.isLastQuestion) {
      this.currentQuestionIndex++;
      this.resetQuestion();
      this.cdr.markForCheck();
    } else {
      this.submitAttempt();
    }
  }

  /** Enter comprueba y, después, continúa (salvo mientras corre el Relámpago). */
  @HostListener('document:keydown.enter', ['$event'])
  onEnter(event: Event): void {
    if (this.gameState !== 'quiz' || (this.currentQuestion?.type === 'rapid_true_false' && !this.isChecked)) return;
    const target = event.target as HTMLElement;
    if (target?.tagName === 'BUTTON') return; // el botón enfocado ya maneja su Enter
    if (this.isChecked) this.continueNextQuestion();
    else this.checkAnswer();
  }

  submitAttempt(): void {
    this.isLoading = true;
    const duration = Math.round((Date.now() - this.startTime) / 1000);

    this.submitRequest({
      answers: this.selectedAnswers,
      duration_seconds: duration
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.result = result;
          this.isLoading = false;
          if (!result.passed && result.hearts_remaining <= 0) {
            this.gameState = 'game_over';
          } else {
            this.gameState = 'victory'; // También muestra el resumen si no aprobó
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

  /** Una partida nueva pide la sesión otra vez: el servidor olvida las respuestas fijadas. */
  retryLevel(): void {
    this.loadSession();
  }

  goToTavern(): void {
    this.router.navigate(['/tavern/tienda']);
  }

  recapScore(item: any): string {
    if (item.fraction === undefined || item.fraction === null || item.is_correct || item.fraction === 0) return '';
    return `${Math.round(item.fraction * 100)} %`;
  }
}
