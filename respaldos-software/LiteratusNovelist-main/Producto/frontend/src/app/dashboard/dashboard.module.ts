import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';

import { DashboardRoutingModule } from './dashboard-routing.module';
import { DashboardLayoutComponent } from './dashboard-layout/dashboard-layout.component';
import { OverviewComponent } from './overview/overview.component';
import { BooksComponent } from './books/books.component';
import { BookEditorComponent } from './book-editor/book-editor.component';
import { AuthorsComponent } from './authors/authors.component';
import { AvatarEditorComponent } from './avatar-editor/avatar-editor.component';
import { AvatarsComponent } from './avatars/avatars.component';
import { UsersComponent } from './users/users.component';
import { AuthorEditorComponent } from './author-editor/author-editor.component';

@NgModule({
  declarations: [
    DashboardLayoutComponent,
    OverviewComponent,
    BooksComponent,
    BookEditorComponent,
    AuthorsComponent,
    AvatarEditorComponent,
    AvatarsComponent,
    UsersComponent,
    AuthorEditorComponent,
  ],
  imports: [
    CommonModule,
    HttpClientModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    DashboardRoutingModule,
    MatMenuModule,
    MatButtonModule,
  ]
})
export class DashboardModule {}
