import { Component, ElementRef, Input, OnChanges, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ReaderTab, ReaderTabsService } from '../../../core/services/reader-tabs.service';

/**
 * Barra de pestañas del lector: cada libro abierto es una pestaña, como en un navegador.
 * Tocar una pestaña abre ese libro donde quedó; la × la cierra; el + vuelve a la
 * biblioteca para abrir otro. Las acciones del lector se proyectan a la derecha.
 */
@Component({
  selector: 'app-reader-tabs',
  templateUrl: './reader-tabs.component.html',
  styleUrl: './reader-tabs.component.css',
})
export class ReaderTabsComponent implements OnChanges {
  private router = inject(Router);
  readonly tabsService = inject(ReaderTabsService);

  /** id de inventario del libro que se está leyendo. */
  @Input() activeId = '';

  @ViewChild('strip') strip?: ElementRef<HTMLElement>;

  /** Pestañas cuya portada no cargó: muestran un ícono en su lugar. */
  brokenCovers = new Set<string>();

  trackTab = (_: number, tab: ReaderTab) => tab.id;

  ngOnChanges(): void {
    // Deja visible la pestaña activa cuando hay más de las que caben.
    setTimeout(() => {
      const active = this.strip?.nativeElement.querySelector('.rt-tab.active') as HTMLElement | null;
      active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  select(tab: ReaderTab): void {
    if (tab.id !== this.activeId) this.router.navigate(['/reader', tab.id]);
  }

  close(tab: ReaderTab, event: Event): void {
    event.stopPropagation();
    const next = this.tabsService.close(tab.id);
    if (tab.id !== this.activeId) return;
    this.router.navigate(next ? ['/reader', next.id] : ['/library']);
  }

  /** Clic con la rueda (botón central) cierra la pestaña, como en el navegador. */
  onAuxClick(tab: ReaderTab, event: MouseEvent): void {
    if (event.button === 1) this.close(tab, event);
  }
}
