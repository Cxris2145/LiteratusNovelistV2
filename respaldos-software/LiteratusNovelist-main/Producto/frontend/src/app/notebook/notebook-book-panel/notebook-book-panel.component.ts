import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { NotebookService } from '../notebook.service';
import { NotebookDigest, NotebookHighlight, NotebookPostIt, NotebookWord } from '../notebook.models';

type Section = 'highlights' | 'post_its' | 'words';
type Fragment = Record<string, unknown>[];

/**
 * Panel "Del libro" de la pestaña de un libro: sus subrayados por capítulo, los post-its con el
 * texto que los rodea y las palabras guardadas. Cada uno se puede abrir en el lector o copiar
 * a los apuntes. Se editan en el lector; aquí se reúnen para estudiar.
 */
@Component({
  selector: 'app-notebook-book-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nbp-head">
      <strong>Del libro</strong>
      <button type="button" class="nb-icon-btn" (click)="load()" title="Actualizar" aria-label="Actualizar lo del libro">
        <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
      </button>
      <button type="button" class="nb-icon-btn" (click)="close.emit()" title="Ocultar panel" aria-label="Ocultar el panel del libro">
        <span class="material-symbols-rounded" aria-hidden="true">close</span>
      </button>
    </div>

    <div class="nbp-tabs" role="tablist" aria-label="Qué mostrar">
      <button type="button" role="tab" *ngFor="let s of sections" [class.on]="section === s.id"
              [attr.aria-selected]="section === s.id" (click)="section = s.id">
        {{ s.label }} <span class="nbp-count">{{ count(s.id) }}</span>
      </button>
    </div>

    <input type="search" class="nbp-filter" [(ngModel)]="filter" placeholder="Filtrar…" aria-label="Filtrar lo del libro">

    <div class="nbp-list" *ngIf="digest; else state">
      <ng-container *ngIf="section === 'highlights'">
        <article class="nbp-item" *ngFor="let h of highlights(); trackBy: trackById">
          <span class="nbp-chapter">{{ h.chapter_title }}</span>
          <p class="nbp-quote" [attr.data-color]="h.color">“{{ h.text }}”</p>
          <div class="nbp-actions">
            <button type="button" (click)="goTo.emit({ chapterId: h.chapter_id, word: h.start_word, lastWord: h.end_word })">
              <span class="material-symbols-rounded" aria-hidden="true">menu_book</span> Ir al pasaje
            </button>
            <button type="button" (click)="copy.emit(highlightFragment(h))">
              <span class="material-symbols-rounded" aria-hidden="true">content_paste_go</span> Copiar
            </button>
          </div>
        </article>
        <p class="nbp-empty" *ngIf="!highlights().length">{{ filter ? 'Nada coincide con el filtro.' : 'Aún no subrayas nada en este libro. Selecciona un texto en el lector y elige un color.' }}</p>
      </ng-container>

      <ng-container *ngIf="section === 'post_its'">
        <article class="nbp-item" *ngFor="let p of postIts(); trackBy: trackById">
          <span class="nbp-chapter">{{ p.chapter_title }}</span>
          <p class="nbp-note">{{ p.text }}</p>
          <p class="nbp-context">{{ p.context }}</p>
          <div class="nbp-actions">
            <button type="button" (click)="goTo.emit({ chapterId: p.chapter_id, word: p.word })">
              <span class="material-symbols-rounded" aria-hidden="true">menu_book</span> Ir al pasaje
            </button>
            <button type="button" (click)="copy.emit(postItFragment(p))">
              <span class="material-symbols-rounded" aria-hidden="true">content_paste_go</span> Copiar
            </button>
          </div>
        </article>
        <p class="nbp-empty" *ngIf="!postIts().length">{{ filter ? 'Nada coincide con el filtro.' : 'Aún no pegas post-its en este libro.' }}</p>
      </ng-container>

      <ng-container *ngIf="section === 'words'">
        <article class="nbp-item" *ngFor="let w of words(); trackBy: trackById">
          <span class="nbp-chapter">{{ w.chapter_title }}<ng-container *ngIf="w.is_learned"> · Aprendida</ng-container></span>
          <p class="nbp-word"><strong>{{ w.word }}</strong><ng-container *ngIf="w.definition">: {{ w.definition }}</ng-container></p>
          <p class="nbp-context" *ngIf="w.context">{{ w.context }}</p>
          <div class="nbp-actions">
            <button type="button" (click)="copy.emit(wordFragment(w))">
              <span class="material-symbols-rounded" aria-hidden="true">content_paste_go</span> Copiar
            </button>
          </div>
        </article>
        <p class="nbp-empty" *ngIf="!words().length">{{ filter ? 'Nada coincide con el filtro.' : 'Aún no guardas palabras de este libro.' }}</p>
      </ng-container>
    </div>

    <ng-template #state>
      <p class="nbp-empty" *ngIf="loading">Cargando lo del libro…</p>
      <p class="nbp-empty" *ngIf="error">{{ error }} <button type="button" class="nbp-retry" (click)="load()">Reintentar</button></p>
    </ng-template>
  `,
})
export class NotebookBookPanelComponent implements OnChanges, OnDestroy {
  private readonly notebook = inject(NotebookService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) inventoryId!: string;
  @Output() readonly goTo = new EventEmitter<{ chapterId: string; word: number; lastWord?: number }>();
  @Output() readonly copy = new EventEmitter<Fragment>();
  @Output() readonly close = new EventEmitter<void>();
  @Output() readonly loaded = new EventEmitter<NotebookDigest>();

  readonly sections: { id: Section; label: string }[] = [
    { id: 'highlights', label: 'Subrayados' },
    { id: 'post_its', label: 'Notas' },
    { id: 'words', label: 'Palabras' },
  ];
  section: Section = 'highlights';
  filter = '';
  digest: NotebookDigest | null = null;
  loading = false;
  error = '';
  private sub?: Subscription;

  ngOnChanges(): void {
    this.digest = null;
    this.load();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  load(): void {
    this.sub?.unsubscribe();
    this.loading = true;
    this.error = '';
    this.sub = this.notebook.digest(this.inventoryId).subscribe({
      next: digest => {
        this.digest = digest;
        this.loading = false;
        this.loaded.emit(digest);
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = 'No se pudo cargar lo del libro.';
        this.cdr.markForCheck();
      },
    });
  }

  count(section: Section): number {
    return this.digest?.[section].length ?? 0;
  }

  highlights(): NotebookHighlight[] {
    return this.matching(this.digest?.highlights || [], h => `${h.text} ${h.chapter_title}`);
  }

  postIts(): NotebookPostIt[] {
    return this.matching(this.digest?.post_its || [], p => `${p.text} ${p.context} ${p.chapter_title}`);
  }

  words(): NotebookWord[] {
    return this.matching(this.digest?.words || [], w => `${w.word} ${w.definition} ${w.context}`);
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  highlightFragment(h: NotebookHighlight): Fragment {
    return [
      { type: 'blockquote', content: [paragraph([text(h.text)])] },
      paragraph([text(`— ${h.chapter_title}`, ['italic'])]),
    ];
  }

  postItFragment(p: NotebookPostIt): Fragment {
    return [
      paragraph([text('Nota: ', ['bold']), text(p.text)]),
      { type: 'blockquote', content: [paragraph([text(p.context, ['italic'])])] },
    ];
  }

  wordFragment(w: NotebookWord): Fragment {
    return [paragraph([text(w.word, ['bold']), ...(w.definition ? [text(`: ${w.definition}`)] : [])])];
  }

  private matching<T>(items: T[], haystack: (item: T) => string): T[] {
    const needle = fold(this.filter.trim());
    return needle ? items.filter(item => fold(haystack(item)).includes(needle)) : items;
  }
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function text(value: string, marks: string[] = []): Record<string, unknown> {
  return { type: 'text', text: value || ' ', ...(marks.length ? { marks: marks.map(type => ({ type })) } : {}) };
}

function paragraph(content: Record<string, unknown>[]): Record<string, unknown> {
  return { type: 'paragraph', content };
}
