import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { AuthorDetailPageComponent } from './author-detail-page.component';

/** Ficha de un autor (/author/:slug). */
@NgModule({
  declarations: [AuthorDetailPageComponent],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: AuthorDetailPageComponent }])],
})
export class AuthorDetailRouteModule {}
