import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { LibraryListComponent } from './library-list.component';
import { BookSummaryComponent } from '../../core/components/book-summary/book-summary.component';

/** Mi Biblioteca (/library), con el resumen de cada libro. */
@NgModule({
  declarations: [LibraryListComponent, BookSummaryComponent],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: LibraryListComponent }])],
})
export class LibraryRouteModule {}
