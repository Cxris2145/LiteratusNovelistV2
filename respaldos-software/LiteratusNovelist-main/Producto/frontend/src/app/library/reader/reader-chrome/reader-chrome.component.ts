import { Component, inject } from '@angular/core';

import { ReaderComponent } from '../reader.component';

/** Controles compartidos por Páginas y Desplazamiento; el centro de la lectura los muestra. */
@Component({
  selector: 'app-reader-chrome',
  templateUrl: './reader-chrome.component.html',
  styleUrl: './reader-chrome.component.css',
})
export class ReaderChromeComponent {
  readonly r = inject(ReaderComponent);

  open(action: 'search' | 'toc' | 'settings' | 'audio'): void {
    this.r.isMoreOpen = false;
    if (action === 'search') this.r.openSearch();
    if (action === 'toc') this.r.toggleToc();
    if (action === 'settings') this.r.toggleSettings();
    if (action === 'audio') this.r.toggleAudioPanel();
  }

  toggleMore(): void {
    this.r.isMoreOpen = !this.r.isMoreOpen;
    if (this.r.isMoreOpen) {
      this.r.isSettingsOpen = false;
      this.r.isTocOpen = false;
      this.r.isAudioPanelOpen = false;
    }
  }
}
