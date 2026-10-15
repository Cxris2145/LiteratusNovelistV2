import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ReaderTab, ReaderTabsService } from '../../../core/services/reader-tabs.service';
import { ReaderComponent } from '../reader.component';

type MoreAction = 'characters' | 'notebook' | 'vocabulary' | 'summary' | 'postit' | 'favorite';

/** Opciones del libro y libros abiertos, fuera de la superficie de lectura. */
@Component({
  selector: 'app-reader-more-sheet',
  templateUrl: './reader-more-sheet.component.html',
  styleUrl: './reader-more-sheet.component.css',
})
export class ReaderMoreSheetComponent {
  readonly r = inject(ReaderComponent);
  readonly tabsService = inject(ReaderTabsService);
  private readonly router = inject(Router);

  readonly trackTab = (_: number, tab: ReaderTab) => tab.id;

  close(): void {
    this.r.isMoreOpen = false;
  }

  act(action: MoreAction): void {
    this.close();
    if (action === 'characters') this.r.openCharacters();
    if (action === 'notebook') this.r.notebook.openForBook(this.r.inventoryId);
    if (action === 'vocabulary') this.r.openVocabulary();
    if (action === 'summary') this.r.openProgressSummary();
    if (action === 'postit') this.r.createPostIt();
    if (action === 'favorite') this.r.toggleFavorite();
  }

  selectTab(tab: ReaderTab): void {
    this.close();
    if (tab.id !== this.r.inventoryId) this.router.navigate(['/reader', tab.id]);
  }

  closeTab(tab: ReaderTab, event: Event): void {
    event.stopPropagation();
    const next = this.tabsService.close(tab.id);
    if (tab.id !== this.r.inventoryId) return;
    this.close();
    this.router.navigate(next ? ['/reader', next.id] : ['/library']);
  }
}
