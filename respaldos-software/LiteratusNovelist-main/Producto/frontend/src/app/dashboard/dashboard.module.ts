import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';

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
import { CurationComponent } from './curation/curation.component';
import { CategoriesAdminComponent } from './categories/categories.component';
import { TransactionsComponent } from './transactions/transactions.component';
import { InkEconomyComponent } from './ink/ink.component';
import { GamificationAdminComponent } from './gamification/gamification.component';
import { AIChatsComponent } from './ai-chats/ai-chats.component';
import { AuditLogsComponent } from './audit/audit.component';
import { StoreSettingsComponent } from './settings/settings.component';
import { ReportsComponent } from './reports/reports.component';

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
    CurationComponent,
    CategoriesAdminComponent,
    TransactionsComponent,
    InkEconomyComponent,
    GamificationAdminComponent,
    AIChatsComponent,
    AuditLogsComponent,
    StoreSettingsComponent,
    ReportsComponent,
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
    MatDividerModule,
  ]
})
export class DashboardModule {}
