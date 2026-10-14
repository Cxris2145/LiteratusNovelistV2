import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { VerifyEmailComponent } from './auth/verify-email/verify-email.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';
import { BookListComponent } from './catalog/book-list/book-list.component';
import { BookDetailPageComponent } from './catalog/book-detail-page/book-detail-page.component';
import { authGuard } from './core/guards/auth.guard';
import { legacyShopRedirect } from './core/guards/legacy-shop.redirect';
import { adminGuard } from './guards/admin.guard';
import { AuthorDetailPageComponent } from './catalog/author-detail-page/author-detail-page.component';
import { LibraryListComponent } from './library/library-list/library-list.component';
import { OnboardingComponent } from './auth/onboarding/onboarding.component';
import { onboardingGuard } from './core/guards/onboarding.guard';

import { HomeComponent } from './home/home.component';

import { AuthorListComponent } from './catalog/author-list/author-list.component';
import { CategoriesComponent } from './categories/categories.component';
import { CategoryDetailComponent } from './categories/category-detail/category-detail.component';

// Las páginas del catálogo, la biblioteca y el ingreso van en el paquete inicial. El resto
// (lector, La Taberna, juegos, personajes, compras y cuenta) se descarga al abrirlas: en un
// celular con 4G la app abre bastante antes. Cada `loadChildren` trae un módulo con su página.
const routes: Routes = [
  { path: 'home', component: HomeComponent },
  { path: 'favorites', canActivate: [authGuard], loadChildren: () => import('./users/account.module').then(m => m.FavoritesRouteModule) },
  { path: 'flashcards', canActivate: [authGuard], loadChildren: () => import('./users/account.module').then(m => m.FlashcardsRouteModule) },
  { path: 'achievements', canActivate: [authGuard], loadChildren: () => import('./users/account.module').then(m => m.AchievementsRouteModule) },
  { path: 'games', loadChildren: () => import('./library/games/games.module').then(m => m.GamesModule) },
  { path: 'enigma', redirectTo: 'games/enigma', pathMatch: 'full' },
  { path: 'interrogatorio', redirectTo: 'games/interrogatorio', pathMatch: 'full' },
  { path: 'messages', loadChildren: () => import('./characters/characters.module').then(m => m.MessagesRouteModule) },
  { path: 'cart', loadChildren: () => import('./catalog/commerce.module').then(m => m.CartRouteModule) },
  // La Taberna (/tavern) es la comunidad y trae El Bazar (?bazar=ropero). "Sé parte de Literatus"
  // (/planes) reúne planes, membresía y cofres de Tinta. /tavern/tienda era la tienda anterior.
  { path: 'tavern/tienda', canActivate: [legacyShopRedirect], children: [] },
  { path: 'tavern', loadChildren: () => import('./community/tavern.module').then(m => m.TavernModule) },
  { path: 'planes', loadChildren: () => import('./catalog/commerce.module').then(m => m.PlanesRouteModule) },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'onboarding', component: OnboardingComponent, canActivate: [onboardingGuard] },
  { path: 'verify-email', component: VerifyEmailComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'profile', canActivate: [authGuard], loadChildren: () => import('./users/account.module').then(m => m.ProfileRouteModule) },
  { path: 'catalog', component: BookListComponent },
  { path: 'authors', component: AuthorListComponent },
  { path: 'publish-book', canActivate: [authGuard], loadChildren: () => import('./users/account.module').then(m => m.PublishBookRouteModule) },
  { path: 'authors/publish', redirectTo: 'publish-book', pathMatch: 'full' },
  { path: 'characters', loadChildren: () => import('./characters/characters.module').then(m => m.CharacterHubRouteModule) },
  { path: 'chat', loadChildren: () => import('./characters/characters.module').then(m => m.DemoChatRouteModule) },
  { path: 'demo-chat', redirectTo: 'chat', pathMatch: 'full' },
  { path: 'demo-chat/:avatarId', redirectTo: 'chat/:avatarId' },
  { path: 'book/:slug', component: BookDetailPageComponent },
  { path: 'author/:slug', component: AuthorDetailPageComponent },
  { path: 'checkout', loadChildren: () => import('./catalog/commerce.module').then(m => m.CheckoutRouteModule) },
  { path: 'payment', loadChildren: () => import('./catalog/commerce.module').then(m => m.PaymentRouteModule) },
  { path: 'library', component: LibraryListComponent, canActivate: [authGuard] },
  // El lector conserva "reader/:id" en el primer nivel: AppRouteReuseStrategy compara ese path
  // para crear un lector nuevo al cambiar de libro, y el hijo vacío hereda el parámetro :id.
  { path: 'reader/:id', canActivate: [authGuard], loadChildren: () => import('./library/reader/reader.module').then(m => m.ReaderModule) },
  {
    path: 'learn',
    loadChildren: () => import('./learning/learning.module').then(m => m.LearningModule),
    canActivate: [authGuard]
  },
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
