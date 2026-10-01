import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CheckResult } from '../../core/services/learning.service';

/** Clasifica: cada elemento va a una categoría. Respuesta: { id_elemento: id_categoría }. */
@Component({
  selector: 'app-game-classify',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="g-help">Elige la categoría de cada elemento.</p>
    <ul class="items">
      <li *ngFor="let item of question.items" class="item"
          [class.is-correct]="feedback && isRight(item.id)"
          [class.is-wrong]="feedback && !isRight(item.id)">
        <span class="item-text">{{ item.text }}</span>
        <span class="choices" role="radiogroup" [attr.aria-label]="item.text">
          <button *ngFor="let cat of question.categories" type="button" class="choice g-press"
                  role="radio" [attr.aria-checked]="assigned[item.id] === cat.id"
                  [class.is-selected]="!feedback && assigned[item.id] === cat.id"
                  [class.is-correct]="feedback && solution[item.id] === cat.id"
                  [class.is-wrong]="feedback && assigned[item.id] === cat.id && solution[item.id] !== cat.id"
                  [disabled]="!!feedback" (click)="assign(item.id, cat.id)">{{ cat.label }}</button>
        </span>
      </li>
    </ul>
  `,
  styleUrls: ['./games.css'],
  styles: [`
    .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .item {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
      padding: 12px 14px; border-radius: var(--g-radius); border: 2px solid var(--g-border); background: var(--g-surface);
    }
    .item-text { flex: 1 1 220px; font: 600 0.95rem/1.4 var(--font-ui); color: var(--g-text); }
    .choices { display: flex; flex-wrap: wrap; gap: 6px; }
    .choice {
      padding: 8px 12px; border-radius: 999px; border: 2px solid var(--g-border); background: var(--g-surface-2);
      font: 600 0.82rem var(--font-ui); color: var(--g-text);
    }
  `],
})
export class GameClassifyComponent implements OnChanges {
  @Input({ required: true }) question: any;
  @Input() feedback: CheckResult | null = null;
  @Output() answerChange = new EventEmitter<Record<string, string> | null>();

  assigned: Record<string, string> = {};

  get solution(): Record<string, string> {
    return this.feedback?.solution?.items ?? {};
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['question']) this.assigned = {};
  }

  assign(itemId: string, categoryId: string): void {
    if (this.feedback) return;
    this.assigned = { ...this.assigned, [itemId]: categoryId };
    const complete = (this.question.items || []).every((item: any) => this.assigned[item.id]);
    this.answerChange.emit(complete ? { ...this.assigned } : null);
  }

  isRight(itemId: string): boolean {
    return this.solution[itemId] === this.assigned[itemId];
  }
}
