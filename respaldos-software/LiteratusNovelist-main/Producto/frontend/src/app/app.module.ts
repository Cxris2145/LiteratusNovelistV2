import { NotebookLauncherComponent } from './notebook/notebook-launcher/notebook-launcher.component';
import { RouteProgressComponent } from './core/components/route-progress/route-progress.component';
import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { SharedModule } from './shared/shared.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { OnboardingComponent } from './auth/onboarding/onboarding.component';
import { BookListComponent } from './catalog/book-list/book-list.component';
import { BottomNavComponent } from './core/components/bottom-nav/bottom-nav.component';
import { MainNavComponent } from './core/components/main-nav/main-nav.component';
import { HeaderSearchComponent } from './core/components/header-search/header-search.component';

import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HttpClientModule, provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { CommonModule } from '@angular/common';
import { RouteReuseStrategy, RouterModule } from '@angular/router';
import { AppRouteReuseStrategy } from './core/app-route-reuse.strategy';
import { HomeComponent } from './home/home.component';
import { BookDetailPageComponent } from './catalog/book-detail-page/book-detail-page.component';
import { AuthorDetailPageComponent } from './catalog/author-detail-page/author-detail-page.component';
import { LibraryListComponent } from './library/library-list/library-list.component';

import { AuthorListComponent } from './catalog/author-list/author-list.component';
import { FooterComponent } from './core/components/footer/footer.component';
import { CategoriesComponent } from './categories/categories.component';
import { CategoryDetailComponent } from './categories/category-detail/category-detail.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { VerifyEmailComponent } from './auth/verify-email/verify-email.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';
import { AssistantWidgetComponent } from './core/components/assistant-widget/assistant-widget.component';
import { achievementInterceptor } from './core/interceptors/achievement.interceptor';
import { GuideDialogComponent } from './core/components/guide-dialog/guide-dialog.component';
import { BookSummaryComponent } from './core/components/book-summary/book-summary.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    RegisterComponent,
    BookListComponent,
    BottomNavComponent,
    MainNavComponent,
    HeaderSearchComponent,
    HomeComponent,
    BookDetailPageComponent,
    AuthorDetailPageComponent,
    LibraryListComponent,
    AuthorListComponent,
    FooterComponent,
    CategoriesComponent,
    CategoryDetailComponent,
    VerifyEmailComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    AssistantWidgetComponent,
    GuideDialogComponent,
    BookSummaryComponent,
    OnboardingComponent,
  ],


  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule,
    RouterModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    SharedModule,
    NotebookLauncherComponent,
    RouteProgressComponent,
    ServiceWorkerModule.register('ngsw-worker.js', {
  enabled: !isDevMode(),
  // Register the ServiceWorker as soon as the application is stable
  // or after 30 seconds (whichever comes first).
  registrationStrategy: 'registerWhenStable:30000'
})
  ],
  providers: [
    provideHttpClient(withInterceptors([authInterceptor, achievementInterceptor])),
    { provide: RouteReuseStrategy, useClass: AppRouteReuseStrategy }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
