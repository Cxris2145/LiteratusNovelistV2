import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnChanges,
  OnDestroy, Output, SimpleChanges, inject,
} from '@angular/core';
import { CheckResult } from '../../core/services/learning.service';

/**
 * Relámpago: afirmaciones de verdadero o falso, una tras otra, contra el reloj.
 * Al terminar (o al acabarse el tiempo) emite las respuestas y avisa con (finished)
 * para que la partida se compruebe sola. Respuesta: { id_afirmación: true | false }.
 */
@Component({
  selector: 'app-game-rapid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container [ngSwitch]="state">
      <div *ngSwitchCase="'ready'" class="ready">
        <span class="material-symbols-rounded ready-icon" aria-hidden="true">bolt</span>
        <p class="ready-text">
          {{ statements.length }} afirmaciones, {{ limit }} segundos.<br>
          Responde <strong>V</strong> (verdadero) o <strong>F</strong> (falso) lo más rápido que puedas.
        </p>
        <button type="button" class="start-btn g-press" (click)="start()">¡Empezar!</button>
      </div>

      <div *ngSwitchCase="'running'" class="run">
        <div class="timer" aria-hidden="true">
          <span class="timer-fill" [style.animation-duration.s]="limit"></span>
        </div>
        <p class="counter">{{ index + 1 }} / {{ statements.length }}</p>
        <div *ngFor="let statement of [statements[index]]" class="statement" aria-live="polite">
          {{ statement?.text }}
        </div>
        <div class="tf">
          <button type="button" class="tf-btn tf-btn--true g-press" (click)="answer(true)">
            <span class="material-symbols-rounded" aria-hidden="true">check</span> Verdadero
          </button>
          <button type="button" class="tf-btn tf-btn--false g-press" (click)="answer(false)">
            <span class="material-symbols-rounded" aria-hidden="true">close</span> Falso
          </button>
        </div>
      </div>

      <div *ngSwitchCase="'done'">
        <p class="g-help" *ngIf="!feedback">{{ timedOut ? '¡Se acabó el tiempo!' : '¡Listo!' }} Revisando tus respuestas…</p>
        <ul class="recap">
          <li *ngFor="let s of statements" class="recap-item"
              [class.is-correct]="feedback && answers[s.id] === solution[s.id]"
              [class.is-wrong]="feedback && answers[s.id] !== solution[s.id]">
            <span class="recap-text">{{ s.text }}</span>
            <span class="recap-answer">
              {{ answers[s.id] === undefined ? 'Sin responder' : (answers[s.id] ? 'V' : 'F') }}
              <ng-container *ngIf="feedback && answers[s.id] !== solution[s.id]"> → {{ solution[s.id] ? 'V' : 'F' }}</ng-container>
            </span>
          </li>
        </ul>
      </div>
    </ng-container>
  `,
  styleUrls: ['./games.css'],
  styles: [`
    .ready { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 28px 16px; text-align: center;
      border-radius: var(--g-radius); border: 2px dashed var(--g-border); }
    .ready-icon { font-size: 44px; color: var(--color-accent-text, #ffb353); font-variation-settings: 'FILL' 1; }
    .ready-text { margin: 0; font: 500 0.95rem/1.6 var(--font-ui); color: var(--g-text); }
    .start-btn { padding: 12px 28px; border: 0; border-radius: 999px; background: var(--color-accent, #ffb353);
      color: var(--color-on-accent, #15233b); font: 800 1rem var(--font-ui); box-shadow: 0 4px 0 rgba(0, 0, 0, 0.3); }
    .timer { height: 8px; border-radius: 8px; overflow: hidden; background: color-mix(in srgb, var(--g-text) 12%, transparent); }
    /* Tiempo que se agota: movimiento constante, por eso lineal. */
    .timer-fill { display: block; height: 100%; transform-origin: left; background: var(--g-ok);
      animation-name: timer; animation-timing-function: linear; animation-fill-mode: forwards; }
    .counter { margin: 12px 0 8px; font: 800 0.78rem var(--font-ui); letter-spacing: 0.08em; color: var(--g-muted); text-align: center; }
    .statement { min-height: 110px; display: grid; place-items: center; padding: 20px; border-radius: var(--g-radius);
      background: var(--g-surface); border: 2px solid var(--g-border); text-align: center;
      font: 700 1.1rem/1.45 var(--font-ui); color: var(--g-strong); animation: next-in 180ms var(--ease-out); }
    .tf { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
    .tf-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 18px 12px;
      border-radius: var(--g-radius); border: 2px solid; background: var(--g-surface); font: 800 1rem var(--font-ui);
      box-shadow: 0 4px 0 rgba(0, 0, 0, 0.3); }
    .tf-btn--true { border-color: var(--g-ok); color: var(--g-ok); }
    .tf-btn--false { border-color: var(--g-bad); color: var(--g-bad); }
    .recap { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .recap-item { display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: 12px;
      border: 2px solid var(--g-border); background: var(--g-surface); font: 500 0.9rem/1.4 var(--font-ui); color: var(--g-text); }
    .recap-answer { flex-shrink: 0; font-weight: 800; }
    @keyframes timer {
      0% { transform: scaleX(1); background: var(--g-ok); }
      70% { background: #f59e0b; }
      100% { transform: scaleX(0); background: var(--g-bad); }
    }
    @keyframes next-in { from { opacity: 0; transform: translateX(12px); } }
    @media (prefers-reduced-motion: reduce) {
      .statement { animation: none; }
    }
  `],
})
export class GameRapidComponent implements OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) question: any;
  @Input() feedback: CheckResult | null = null;
  @Output() answerChange = new EventEmitter<Record<string, boolean> | null>();
  @Output() finished = new EventEmitter<void>();

  state: 'ready' | 'running' | 'done' = 'ready';
  statements: { id: string; text: string }[] = [];
  answers: Record<string, boolean> = {};
  index = 0;
  limit = 30;
  timedOut = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  get solution(): Record<string, boolean> {
    return this.feedback?.solution?.statements ?? {};
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['question']) {
      clearTimeout(this.timer);
      this.statements = this.question.statements || [];
      this.limit = this.question.time_limit_seconds || 8 * this.statements.length;
      this.answers = {};
      this.index = 0;
      this.timedOut = false;
      this.state = 'ready';
    }
    if (changes['feedback'] && this.feedback) this.state = 'done';
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  start(): void {
    this.state = 'running';
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.finish();
    }, this.limit * 1000);
  }

  answer(value: boolean): void {
    if (this.state !== 'running') return;
    const current = this.statements[this.index];
    this.answers = { ...this.answers, [current.id]: value };
    this.index += 1;
    if (this.index >= this.statements.length) this.finish();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (this.state !== 'running') return;
    const key = event.key.toLowerCase();
    if (key === 'v' || key === 'arrowleft') this.answer(true);
    if (key === 'f' || key === 'arrowright') this.answer(false);
  }

  private finish(): void {
    if (this.state === 'done') return;
    clearTimeout(this.timer);
    this.state = 'done';
    this.answerChange.emit({ ...this.answers });
    this.finished.emit();
    this.cdr.markForCheck();
  }
}
