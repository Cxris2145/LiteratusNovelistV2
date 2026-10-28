import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { AuthorListComponent } from './author-list.component';

/** Lista de autores (/authors). */
@NgModule({
  declarations: [AuthorListComponent],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: AuthorListComponent }])],
})
export class AuthorsRouteModule {}
