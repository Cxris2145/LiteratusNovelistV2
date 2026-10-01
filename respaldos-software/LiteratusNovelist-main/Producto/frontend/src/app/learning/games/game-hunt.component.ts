import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CheckResult } from '../../core/services/learning.service';

/** Caza la palabra: se toca una palabra del fragmento. Respuesta: su posición. */
@Component({
  selector: 'app-game-hunt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="g-hint" *ngIf="question.hint">
      <span class="material-symbols-rounded" aria-hidden="true">lightbulb</span>{{ question.hint }}
    </p>
    <p class="fragment" role="group" aria-label="Fragmento del texto">
      <button *ngFor="let token of tokens; let i = index" type="button" class="word g-press"
              [class.is-selected]="!feedback && selected === i"
              [class.is-correct]="feedback && correct.includes(i)"
              [class.is-wrong]="feedback && selected === i && !correct.includes(i)"
              [attr.aria-pressed]="selected === i"
              [disabled]="!!feedback" (click)="pick(i)">{{ token }}</button>
    </p>
    <div class="g-solution" *ngIf="feedback && !feedback.is_correct">
      <strong>La palabra era «{{ feedback.solution?.word }}».</strong>
    </div>
  `,
  styleUrls: ['./games.css'],
  styles: [`
    .fragment {
      display: flex; flex-wrap: wrap; gap: 4px 2px; margin: 0; padding: 20px 18px;
      border-radius: var(--g-radius); border: 1px solid var(--g-border); background: var(--g-surface);
      font-family: var(--font-literary, Georgia, serif); font-size: 1.12rem; line-height: 1.7;
    }
    .word {
      padding: 1px 3px; border: 2px solid transparent; border-radius: 8px; background: transparent;
      font: inherit; color: var(--g-text);
    }
  `],
})
export class GameHuntComponent implements OnChanges {
  @Input({ required: true }) question: any;
  @Input() feedback: CheckResult | null = null;
  @Output() answerChange = new EventEmitter<number | null>();

  tokens: string[] = [];
  selected: number | null = null;

  get correct(): number[] {
    return this.feedback?.solution?.indexes ?? [];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['question']) {
      this.tokens = this.question.tokens || [];
      this.selected = null;
    }
  }

  pick(index: number): void {
    if (this.feedback) return;
    this.selected = index;
    this.answerChange.emit(index);
  }
}
