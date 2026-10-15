import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { ReaderComponent } from './reader.component';
import { ReaderTabsComponent } from './reader-tabs/reader-tabs.component';
import { ReaderChromeComponent } from './reader-chrome/reader-chrome.component';
import { ReaderMoreSheetComponent } from './reader-more-sheet/reader-more-sheet.component';
import { VocabularyPanelComponent } from './vocabulary-panel/vocabulary-panel.component';
import { BookSearchPanelComponent } from './book-search-panel/book-search-panel.component';
import { ReaderSettingsSheetComponent } from './reader-settings-sheet/reader-settings-sheet.component';
import { ReaderNarrationSheetComponent } from './reader-narration-sheet/reader-narration-sheet.component';
import { ReaderTocComponent } from './reader-toc/reader-toc.component';
import { ReaderSelectionMenuComponent } from './reader-selection-menu/reader-selection-menu.component';
import { ReaderPostItsComponent } from './reader-postits/reader-postits.component';

/** El lector se descarga al abrir un libro (es la página más pesada de la app). */
@NgModule({
  declarations: [
    ReaderComponent, ReaderTabsComponent, ReaderChromeComponent, ReaderMoreSheetComponent, VocabularyPanelComponent, BookSearchPanelComponent,
    ReaderSettingsSheetComponent, ReaderNarrationSheetComponent, ReaderTocComponent, ReaderSelectionMenuComponent,
    ReaderPostItsComponent,
  ],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: ReaderComponent }])],
})
export class ReaderModule {}
