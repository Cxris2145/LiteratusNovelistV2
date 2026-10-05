import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, QueryList, ViewChildren } from '@angular/core';

import { Ranking, RankingEntry, RankingScope } from '../../core/services/community.service';

/** "Ranking de la Taberna": tus amigos y tú por puntos de experiencia. */
@Component({
  selector: 'app-tavern-ranking',
  templateUrl: './tavern-ranking.component.html',
  styleUrls: ['../community-shared.css', './tavern-ranking.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TavernRankingComponent {
  @Input() ranking: Ranking | null = null;
  @Input() scope: RankingScope = 'week';
  @Input() loading = false;
  @Output() scopeChange = new EventEmitter<RankingScope>();

  @ViewChildren('tab') private tabButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  readonly scopes: { id: RankingScope; label: string }[] = [
    { id: 'week', label: 'Esta semana' },
    { id: 'month', label: 'Este mes' },
    { id: 'all', label: 'Siempre' },
  ];

  trackEntry = (_: number, entry: RankingEntry) => entry.friend_code;

  /** Mi fila cuando quedo fuera del top. */
  get myRowOutside(): RankingEntry | null {
    const me = this.ranking?.me;
    return me && !this.ranking!.entries.some(e => e.is_me) ? me : null;
  }

  get nobodyScored(): boolean {
    return !!this.ranking && this.ranking.entries.every(e => e.points === 0);
  }

  points(value: number): string {
    return value.toLocaleString('es-CL');
  }

  medal(rank: number): string | null {
    return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
  }

  select(scope: RankingScope): void {
    if (scope !== this.scope) this.scopeChange.emit(scope);
  }

  /** Flechas para moverse entre pestañas (patrón ARIA tablist). */
  onTabKey(event: KeyboardEvent, index: number): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + this.scopes.length) % this.scopes.length;
    this.tabButtons.get(next)?.nativeElement.focus();
    this.select(this.scopes[next].id);
  }
}
