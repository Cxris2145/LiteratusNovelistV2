import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardLayoutComponent } from './dashboard-layout/dashboard-layout.component';
import { OverviewComponent } from './overview/overview.component';
import { BooksComponent } from './books/books.component';
import { BookEditorComponent } from './book-editor/book-editor.component';
import { AuthorsComponent } from './authors/authors.component';
import { AuthorEditorComponent } from './author-editor/author-editor.component';
import { AvatarEditorComponent } from './avatar-editor/avatar-editor.component';
import { AvatarsComponent } from './avatars/avatars.component';
import { UsersComponent } from './users/users.component';

const routes: Routes = [
  {
    path: '',
    component: DashboardLayoutComponent,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: OverviewComponent },
      { path: 'books', component: BooksComponent },
      { path: 'books/new', component: BookEditorComponent },
      { path: 'books/:id/edit', component: BookEditorComponent },
      { path: 'books/:id/avatars/:avatarId', component: AvatarEditorComponent },
      { path: 'authors', component: AuthorsComponent },
      { path: 'authors/new', component: AuthorEditorComponent },
      { path: 'authors/:id/edit', component: AuthorEditorComponent },
      { path: 'avatars', component: AvatarsComponent },
      { path: 'users', component: UsersComponent },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DashboardRoutingModule {}
