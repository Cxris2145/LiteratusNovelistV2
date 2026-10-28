import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { BookDetailPageComponent } from './book-detail-page.component';

/** Ficha de un libro (/book/:slug), la página que más se comparte: va sola para abrir rápido. */
@NgModule({
  declarations: [BookDetailPageComponent],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: BookDetailPageComponent }])],
})
export class BookDetailRouteModule {}
