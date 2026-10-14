import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { ReaderComponent } from './reader.component';
import { ReaderTabsComponent } from './reader-tabs/reader-tabs.component';
import { VocabularyPanelComponent } from './vocabulary-panel/vocabulary-panel.component';
import { BookSearchPanelComponent } from './book-search-panel/book-search-panel.component';

/** El lector se descarga al abrir un libro (es la página más pesada de la app). */
@NgModule({
  declarations: [ReaderComponent, ReaderTabsComponent, VocabularyPanelComponent, BookSearchPanelComponent],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: ReaderComponent }])],
})
export class ReaderModule {}
