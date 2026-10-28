import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { BookListComponent } from './book-list.component';

/** Catálogo (/catalog). */
@NgModule({
  declarations: [BookListComponent],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: BookListComponent }])],
})
export class CatalogRouteModule {}
