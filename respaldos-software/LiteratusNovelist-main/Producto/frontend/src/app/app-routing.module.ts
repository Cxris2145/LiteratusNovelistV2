import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { VerifyEmailComponent } from './auth/verify-email/verify-email.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';
import { BookListComponent } from './catalog/book-list/book-list.component';
import { BookDetailPageComponent } from './catalog/book-detail-page/book-detail-page.component';
import { ReaderComponent } from './library/reader/reader.component';
import { TavernComponent } from './library/tavern/tavern.component';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { AuthorDetailPageComponent } from './catalog/author-detail-page/author-detail-page.component';
import { CheckoutComponent } from './catalog/checkout/checkout.component';
import { PaymentSuccessComponent } from './catalog/payment-success/payment-success.component';
import { PaymentFailureComponent } from './catalog/payment-failure/payment-failure.component';
import { LibraryListComponent } from './library/library-list/library-list.component';

import { HomeComponent } from './home/home.component';

import { ProfileComponent } from './users/profile/profile.component';
import { AuthorListComponent } from './catalog/author-list/author-list.component';
import { CharacterHubComponent } from './characters/character-hub/character-hub.component';
import { DemoChatPageComponent } from './characters/demo-chat-page/demo-chat-page.component';
import { CategoriesComponent } from './categories/categories.component';
import { CategoryDetailComponent } from './categories/category-detail/category-detail.component';

const routes: Routes = [
  { path: 'home', component: HomeComponent },
  { path: 'tavern', component: TavernComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'verify-email', component: VerifyEmailComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: 'catalog', component: BookListComponent },
  { path: 'authors', component: AuthorListComponent },
  { path: 'characters', component: CharacterHubComponent },
  { path: 'demo-chat/:avatarId', component: DemoChatPageComponent },
  { path: 'demo-chat', component: DemoChatPageComponent },
  { path: 'book/:slug', component: BookDetailPageComponent },
  { path: 'author/:slug', component: AuthorDetailPageComponent },
  { path: 'checkout/:type/:reference', component: CheckoutComponent, canActivate: [authGuard] },
  { path: 'payment/success', component: PaymentSuccessComponent },
  { path: 'payment/failure', component: PaymentFailureComponent },
  { path: 'library', component: LibraryListComponent, canActivate: [authGuard] },
  { path: 'reader/:id', component: ReaderComponent, canActivate: [authGuard] },
  {
    path: 'dashboard',
    loadChildren: () => import('./dashboard/dashboard.module').then(m => m.DashboardModule),
    canActivate: [adminGuard]
  },
  { path: 'categories', component: CategoriesComponent },
  { path: 'categories/:slug', component: CategoryDetailComponent },
  { path: '', component: HomeComponent, pathMatch: 'full' },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
