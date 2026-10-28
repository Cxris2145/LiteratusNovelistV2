import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../shared/shared.module';
import { CategoriesComponent } from './categories.component';
import { CategoryDetailComponent } from './category-detail/category-detail.component';

/** Categorías (/categories) y cada categoría (/categories/:slug). */
@NgModule({
  declarations: [CategoriesComponent, CategoryDetailComponent],
  imports: [SharedModule, RouterModule.forChild([
    { path: '', component: CategoriesComponent },
    { path: ':slug', component: CategoryDetailComponent },
  ])],
})
export class CategoriesRouteModule {}
