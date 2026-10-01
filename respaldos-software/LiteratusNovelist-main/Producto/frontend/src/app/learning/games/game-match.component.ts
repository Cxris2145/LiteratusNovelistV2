import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CheckResult } from '../../core/services/learning.service';

interface Piece { id: string; text: string; }

/** Colores de las parejas: cada pareja formada lleva el color de su elemento izquierdo. */
const PAIR_COLORS = ['#2dd4bf', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb923c'];

/**
 * Une las parejas. Se toca un elemento de cada columna para unirlos; tocar uno ya
 * unido deshace la pareja. Respuesta: { id_izquierda: id_derecha }.
 */
@Component({
  selector: 'app-game-match',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="g-help">Toca un elemento de cada columna para unirlos. Toca una pareja para deshacerla.</p>
    <div class="match-grid">
      <div class="col" role="group" aria-label="Columna izquierda">
        <button *ngFor="let item of left; let i = index" type="button" class="piece g-press"
                [class.is-selected]="!feedback && activeLeft === item.id"
                [class.is-paired]="!feedback && pairs[item.id]"
                [class.is-correct]="feedback && isRight(item.id)"
                [class.is-wrong]="feedback && !isRight(item.id)"
                [style.--pair-color]="color(i)"
                [attr.aria-pressed]="activeLeft === item.id"
                [disabled]="!!feedback" (click)="tapLeft(item.id)">
          <span class="dot" *ngIf="pairs[item.id]" aria-hidden="true"></span>
          <span class="piece-text">{{ item.text }}</span>
        </button>
      </div>
      <div class="col" role="group" aria-label="Columna derecha">
        <button *ngFor="let item of right" type="button" class="piece piece--right g-press"
                [class.is-selected]="!feedback && activeRight === item.id"
                [class.is-paired]="!feedback && leftOf(item.id)"
                [style.--pair-color]="colorOfRight(item.id)"
                [attr.aria-pressed]="activeRight === item.id"
                [disabled]="!!feedback" (click)="tapRight(item.id)">
          <span class="dot" *ngIf="leftOf(item.id)" aria-hidden="true"></span>
          <span class="piece-text">{{ item.text }}</span>
        </button>
      </div>
    </div>
    <div class="g-solution" *ngIf="feedback && !feedback.is_correct">
      <strong>Parejas correctas:</strong>
      <ul class="solution-list">
        <li *ngFor="let item of left"><strong>{{ item.text }}</strong> → {{ rightText(feedback.solution?.pairs?.[item.id]) }}</li>
      </ul>
    </div>
  `,
  styleUrls: ['./games.css'],
  styles: [`
    .match-grid { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 10px; }
    .col { display: flex; flex-direction: column; gap: 10px; }
    .piece {
      position: relative; display: flex; align-items: center; gap: 10px; min-height: 56px;
      padding: 10px 12px; border-radius: var(--g-radius); border: 2px solid var(--g-border);
      background: var(--g-surface); text-align: left; font: 600 0.92rem/1.35 var(--font-ui); color: var(--g-text);
    }
    .piece--right { font-weight: 500; font-size: 0.86rem; }
    .piece.is-paired { border-color: var(--pair-color); background: color-mix(in srgb, var(--pair-color) 14%, var(--g-surface)); }
    .dot {
      flex-shrink: 0; width: 12px; height: 12px; border-radius: 50%; background: var(--pair-color);
      animation: dot-in 180ms var(--ease-out);
    }
    .piece-text { flex: 1; }
    .solution-list { margin: 6px 0 0; padding-left: 18px; }
    @keyframes dot-in { from { opacity: 0; transform: scale(0.6); } }
    @media (max-width: 480px) { .match-grid { grid-template-columns: 1fr 1fr; } }
    @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
  `],
})
export class GameMatchComponent implements OnChanges {
  @Input({ required: true }) question: any;
  @Input() feedback: CheckResult | null = null;
  @Output() answerChange = new EventEmitter<Record<string, string> | null>();

  left: Piece[] = [];
  right: Piece[] = [];
  pairs: Record<string, string> = {};
  activeLeft: string | null = null;
  activeRight: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['question']) {
      this.left = this.question.left || [];
      this.right = this.question.right || [];
      this.pairs = {};
      this.activeLeft = this.activeRight = null;
    }
  }

  tapLeft(id: string): void {
    if (this.pairs[id]) {
      this.unpair(id);
      return;
    }
    this.activeLeft = this.activeLeft === id ? null : id;
    this.tryPair();
  }

  tapRight(id: string): void {
    const owner = this.leftOf(id);
    if (owner) {
      this.unpair(owner);
      return;
    }
    this.activeRight = this.activeRight === id ? null : id;
    this.tryPair();
  }

  leftOf(rightId: string): string | undefined {
    return Object.keys(this.pairs).find(key => this.pairs[key] === rightId);
  }

  color(index: number): string {
    return PAIR_COLORS[index % PAIR_COLORS.length];
  }

  colorOfRight(rightId: string): string | null {
    const owner = this.leftOf(rightId);
    return owner ? this.color(this.left.findIndex(item => item.id === owner)) : null;
  }

  isRight(leftId: string): boolean {
    return this.feedback?.solution?.pairs?.[leftId] === this.pairs[leftId];
  }

  rightText(rightId: string | undefined): string {
    return this.right.find(item => item.id === rightId)?.text ?? '';
  }

  private tryPair(): void {
    if (!this.activeLeft || !this.activeRight) return;
    this.pairs = { ...this.pairs, [this.activeLeft]: this.activeRight };
    this.activeLeft = this.activeRight = null;
    this.emit();
  }

  private unpair(leftId: string): void {
    const rest = { ...this.pairs };
    delete rest[leftId];
    this.pairs = rest;
    this.emit();
  }

  private emit(): void {
    const complete = this.left.length > 0 && this.left.every(item => this.pairs[item.id]);
    this.answerChange.emit(complete ? { ...this.pairs } : null);
  }
}
