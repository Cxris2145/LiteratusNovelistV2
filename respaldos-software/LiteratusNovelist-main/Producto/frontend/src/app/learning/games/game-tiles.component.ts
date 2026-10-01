import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CheckResult } from '../../core/services/learning.service';

interface Tile { text: string; used: boolean; }

/**
 * Fichas que se colocan en orden: letras (Anagrama) o palabras (Reconstruye la frase).
 * Se toca una ficha para ponerla en la respuesta y otra vez para devolverla.
 * Respuesta: la palabra formada o la lista de palabras.
 */
@Component({
  selector: 'app-game-tiles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="g-hint" *ngIf="question.hint">
      <span class="material-symbols-rounded" aria-hidden="true">lightbulb</span>{{ question.hint }}
    </p>

    <div class="answer-row" [class.answer-row--words]="words"
         [class.is-correct]="feedback?.is_correct" [class.is-wrong]="feedback && !feedback.is_correct"
         aria-live="polite" [attr.aria-label]="words ? 'Tu frase' : 'Tu palabra'">
      <span class="placeholder" *ngIf="!placed.length">{{ words ? 'Toca las palabras en orden' : 'Toca las letras en orden' }}</span>
      <button *ngFor="let index of placed; let k = index" type="button" class="tile tile--placed g-press"
              [disabled]="!!feedback" (click)="unplace(k)" [attr.aria-label]="'Quitar ' + tiles[index].text">
        {{ tiles[index].text }}
      </button>
    </div>

    <div class="pool" [class.pool--words]="words" role="group" aria-label="Fichas disponibles">
      <button *ngFor="let tile of tiles; let i = index" type="button" class="tile g-press"
              [class.tile--used]="tile.used" [disabled]="tile.used || !!feedback" (click)="place(i)">
        {{ tile.text }}
      </button>
    </div>

    <button type="button" class="clear-btn g-press" *ngIf="placed.length && !feedback" (click)="clear()">
      <span class="material-symbols-rounded" aria-hidden="true">backspace</span> Borrar todo
    </button>

    <div class="g-solution" *ngIf="feedback && !feedback.is_correct">
      <strong>{{ words ? 'La frase era:' : 'La palabra era:' }}</strong>
      {{ words ? feedback.solution?.sentence : (feedback.solution?.word | uppercase) }}
    </div>
  `,
  styleUrls: ['./games.css'],
  styles: [`
    .answer-row {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px;
      min-height: 68px; margin-bottom: 18px; padding: 12px; border-radius: var(--g-radius);
      border: 2px dashed var(--g-border); background: color-mix(in srgb, var(--g-surface) 60%, transparent);
    }
    .answer-row--words { justify-content: flex-start; }
    .answer-row.is-correct, .answer-row.is-wrong { border-style: solid; }
    .placeholder { font: 500 0.9rem var(--font-ui); color: var(--g-muted); }
    .pool { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
    .pool--words { justify-content: flex-start; }
    .tile {
      min-width: 44px; height: 48px; padding: 0 14px; border-radius: 12px;
      border: 2px solid var(--g-border); background: var(--g-surface);
      box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3);
      font: 800 1.15rem var(--font-ui); color: var(--g-strong);
    }
    .pool--words .tile, .answer-row--words .tile { font: 600 0.98rem var(--font-ui); }
    /* La ficha usada deja su hueco para que el resto no salte de lugar. */
    .tile--used { opacity: 0.18; box-shadow: none; }
    .tile--placed { background: var(--g-surface-2); animation: tile-in 150ms var(--ease-out); }
    .clear-btn {
      display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; padding: 8px 12px;
      border: 0; border-radius: 10px; background: transparent; font: 600 0.85rem var(--font-ui); color: var(--g-muted);
    }
    .clear-btn .material-symbols-rounded { font-size: 18px; }
    @keyframes tile-in { from { opacity: 0; transform: translateY(4px) scale(0.95); } }
    @media (prefers-reduced-motion: reduce) { .tile--placed { animation: none; } }
  `],
})
export class GameTilesComponent implements OnChanges {
  @Input({ required: true }) question: any;
  @Input() feedback: CheckResult | null = null;
  @Output() answerChange = new EventEmitter<string | string[] | null>();

  tiles: Tile[] = [];
  placed: number[] = [];

  get words(): boolean {
    return this.question?.type === 'build_sentence';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['question']) {
      const pieces: string[] = this.words ? this.question.tokens : this.question.letters;
      this.tiles = (pieces || []).map(text => ({ text, used: false }));
      this.placed = [];
    }
  }

  place(index: number): void {
    if (this.feedback || this.tiles[index].used) return;
    this.tiles[index] = { ...this.tiles[index], used: true };
    this.placed = [...this.placed, index];
    this.emit();
  }

  unplace(position: number): void {
    if (this.feedback) return;
    const index = this.placed[position];
    this.tiles[index] = { ...this.tiles[index], used: false };
    this.placed = this.placed.filter((_, k) => k !== position);
    this.emit();
  }

  clear(): void {
    this.tiles = this.tiles.map(tile => ({ ...tile, used: false }));
    this.placed = [];
    this.emit();
  }

  private emit(): void {
    if (this.placed.length !== this.tiles.length) {
      this.answerChange.emit(null);
      return;
    }
    const texts = this.placed.map(index => this.tiles[index].text);
    this.answerChange.emit(this.words ? texts : texts.join(''));
  }
}
