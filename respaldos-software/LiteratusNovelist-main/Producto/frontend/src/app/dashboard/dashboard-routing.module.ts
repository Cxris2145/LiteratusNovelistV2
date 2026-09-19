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
import { ReportsComponent } from './reports/reports.component';
import { CurationComponent } from './curation/curation.component';
import { CategoriesAdminComponent } from './categories/categories.component';
import { TransactionsComponent } from './transactions/transactions.component';
import { InkEconomyComponent } from './ink/ink.component';
import { GamificationAdminComponent } from './gamification/gamification.component';
import { AIChatsComponent } from './ai-chats/ai-chats.component';
import { AuditLogsComponent } from './audit/audit.component';
import { StoreSettingsComponent } from './settings/settings.component';

const routes: Routes = [
  {
    path: '',
    component: DashboardLayoutComponent,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: OverviewComponent },
      { path: 'reports', component: ReportsComponent },
      { path: 'books', component: BooksComponent },
      { path: 'books/new', component: BookEditorComponent },
      { path: 'books/:id/edit', component: BookEditorComponent },
      { path: 'books/:id/avatars/:avatarId', component: AvatarEditorComponent },
      { path: 'curation', component: CurationComponent },
      { path: 'authors', component: AuthorsComponent },
      { path: 'authors/new', component: AuthorEditorComponent },
      { path: 'authors/:id/edit', component: AuthorEditorComponent },
      { path: 'avatars', component: AvatarsComponent },
      { path: 'categories', component: CategoriesAdminComponent },
      { path: 'users', component: UsersComponent },
      { path: 'gamification', component: GamificationAdminComponent },
      { path: 'ink', component: InkEconomyComponent },
      { path: 'transactions', component: TransactionsComponent },
      { path: 'ai-chats', component: AIChatsComponent },
      { path: 'audit', component: AuditLogsComponent },
      { path: 'settings', component: StoreSettingsComponent },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DashboardRoutingModule {}
