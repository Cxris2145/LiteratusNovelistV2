import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CheckResult } from '../../core/services/learning.service';

/** Preguntas de opción única y verdadero/falso. Respuesta: id de la opción. */
@Component({
  selector: 'app-game-options',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="opts" [class.opts--tf]="question.type === 'true_false'" role="radiogroup" [attr.aria-label]="question.prompt">
      <button *ngFor="let opt of question.options; let i = index" type="button" class="opt g-press"
              role="radio" [attr.aria-checked]="selected === opt.id"
              [class.is-selected]="!feedback && selected === opt.id"
              [class.is-correct]="feedback && opt.id === correctId"
              [class.is-wrong]="feedback && selected === opt.id && opt.id !== correctId"
              [disabled]="!!feedback" (click)="pick(opt.id)">
        <span class="opt-key" aria-hidden="true">{{ keyFor(opt.id, i) }}</span>
        <span class="opt-text">{{ opt.text }}</span>
        <span *ngIf="feedback && opt.id === correctId" class="material-symbols-rounded g-mark g-mark--ok" aria-label="Correcta">check_circle</span>
        <span *ngIf="feedback && selected === opt.id && opt.id !== correctId" class="material-symbols-rounded g-mark g-mark--bad" aria-label="Tu respuesta">cancel</span>
      </button>
    </div>
  `,
  styleUrls: ['./games.css'],
  styles: [`
    .opts { display: flex; flex-direction: column; gap: 12px; }
    .opts--tf { flex-direction: row; }
    .opts--tf .opt { flex: 1; justify-content: center; padding: 22px 16px; }
    .opts--tf .opt-key { display: none; }
    .opt {
      display: flex; align-items: center; gap: 14px; width: 100%;
      padding: 15px 18px; border-radius: var(--g-radius);
      border: 2px solid var(--g-border); background: var(--g-surface);
      box-shadow: 0 4px 0 rgba(0, 0, 0, 0.28);
      text-align: left; font: 600 1rem/1.4 var(--font-ui); color: var(--g-text);
    }
    .opt-key {
      display: grid; place-items: center; flex-shrink: 0;
      width: 32px; height: 32px; border-radius: 9px;
      background: color-mix(in srgb, var(--g-text) 10%, transparent);
      font: 800 0.85rem var(--font-ui); color: var(--g-muted);
    }
    .is-selected .opt-key { background: var(--g-select); color: #fff; }
    .is-correct .opt-key { background: var(--g-ok); color: #fff; }
    .is-wrong .opt-key { background: var(--g-bad); color: #fff; }
    .opt-text { flex: 1; }
  `],
})
export class GameOptionsComponent implements OnChanges {
  @Input({ required: true }) question: any;
  @Input() feedback: CheckResult | null = null;
  @Output() answerChange = new EventEmitter<string | null>();

  selected: string | null = null;

  get correctId(): string | undefined {
    return this.feedback?.solution?.option_id;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['question']) this.selected = null;
  }

  pick(id: string): void {
    if (this.feedback) return;
    this.selected = id;
    this.answerChange.emit(id);
  }

  keyFor(id: string, index: number): string {
    return String.fromCharCode(65 + index);
  }
}
