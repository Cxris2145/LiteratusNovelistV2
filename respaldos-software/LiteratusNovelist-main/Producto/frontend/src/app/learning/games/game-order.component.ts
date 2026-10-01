import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CheckResult } from '../../core/services/learning.service';

/** Ordena la historia. Respuesta: lista de sucesos en el orden elegido. */
@Component({
  selector: 'app-game-order',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="g-help">Usa las flechas para poner los sucesos en el orden en que ocurrieron.</p>
    <ol class="order-list">
      <li *ngFor="let item of items; let i = index" class="order-item"
          [class.is-correct]="feedback && item === solution[i]"
          [class.is-wrong]="feedback && item !== solution[i]">
        <span class="order-num" aria-hidden="true">{{ i + 1 }}</span>
        <span class="order-text">{{ item }}</span>
        <span class="order-arrows" *ngIf="!feedback">
          <button type="button" class="arrow g-press" [disabled]="i === 0" (click)="move(i, -1)"
                  [attr.aria-label]="'Subir: ' + item">
            <span class="material-symbols-rounded" aria-hidden="true">keyboard_arrow_up</span>
          </button>
          <button type="button" class="arrow g-press" [disabled]="i === items.length - 1" (click)="move(i, 1)"
                  [attr.aria-label]="'Bajar: ' + item">
            <span class="material-symbols-rounded" aria-hidden="true">keyboard_arrow_down</span>
          </button>
        </span>
      </li>
    </ol>
    <div class="g-solution" *ngIf="feedback && !feedback.is_correct">
      <strong>Orden correcto:</strong>
      <ol class="solution-list"><li *ngFor="let step of solution">{{ step }}</li></ol>
    </div>
  `,
  styleUrls: ['./games.css'],
  styles: [`
    .order-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .order-item {
      display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 14px;
      border-radius: var(--g-radius); border: 2px solid var(--g-border); background: var(--g-surface);
      font: 600 0.95rem/1.4 var(--font-ui); color: var(--g-text);
    }
    .order-num {
      display: grid; place-items: center; flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
      background: var(--g-select); color: #fff; font: 800 0.85rem var(--font-ui);
    }
    .is-correct .order-num { background: var(--g-ok); }
    .is-wrong .order-num { background: var(--g-bad); }
    .order-text { flex: 1; }
    .order-arrows { display: flex; flex-direction: column; gap: 4px; }
    .arrow {
      display: grid; place-items: center; width: 34px; height: 28px; padding: 0;
      border: 1px solid var(--g-border); border-radius: 8px; background: var(--g-surface-2);
    }
    .arrow:disabled { opacity: 0.3; }
    .arrow .material-symbols-rounded { font-size: 20px; }
    .solution-list { margin: 6px 0 0; padding-left: 20px; }
  `],
})
export class GameOrderComponent implements OnChanges {
  @Input({ required: true }) question: any;
  @Input() feedback: CheckResult | null = null;
  @Output() answerChange = new EventEmitter<string[] | null>();

  items: string[] = [];

  get solution(): string[] {
    return this.feedback?.solution?.order ?? [];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['question']) {
      this.items = [...(this.question.order_items || [])];
      // Cualquier orden es una respuesta posible: se puede comprobar desde el inicio.
      queueMicrotask(() => this.answerChange.emit([...this.items]));
    }
  }

  move(index: number, step: -1 | 1): void {
    const target = index + step;
    if (this.feedback || target < 0 || target >= this.items.length) return;
    [this.items[index], this.items[target]] = [this.items[target], this.items[index]];
    this.items = [...this.items];
    this.answerChange.emit([...this.items]);
  }
}
