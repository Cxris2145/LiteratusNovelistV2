import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { legacyShopRedirect } from './core/guards/legacy-shop.redirect';
import { adminGuard } from './guards/admin.guard';
import { onboardingGuard } from './core/guards/onboarding.guard';
import { IdlePreloadStrategy } from './core/idle-preload.strategy';

import { HomeComponent } from './home/home.component';

// Solo la portada va en el paquete inicial. Cada `loadChildren` trae un módulo con su página
// al abrirla: en un celular con 4G la app abre bastante antes. Las rutas con `preload` (catálogo,
// ficha de libro, autores, categorías, biblioteca e ingreso) son livianas y se bajan solas en
// segundo plano cuando la app ya cargó, así que al tocarlas abren al instante.
const preload = { preload: true };
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
  { path: 'login', data: preload, loadChildren: () => import('./auth/auth-pages.module').then(m => m.LoginRouteModule) },
  { path: 'register', data: preload, loadChildren: () => import('./auth/auth-pages.module').then(m => m.RegisterRouteModule) },
  { path: 'onboarding', canActivate: [onboardingGuard], loadChildren: () => import('./auth/auth-pages.module').then(m => m.OnboardingRouteModule) },
  { path: 'verify-email', loadChildren: () => import('./auth/auth-pages.module').then(m => m.VerifyEmailRouteModule) },
  { path: 'forgot-password', loadChildren: () => import('./auth/auth-pages.module').then(m => m.ForgotPasswordRouteModule) },
  { path: 'reset-password', loadChildren: () => import('./auth/auth-pages.module').then(m => m.ResetPasswordRouteModule) },
  { path: 'profile', canActivate: [authGuard], loadChildren: () => import('./users/account.module').then(m => m.ProfileRouteModule) },
  { path: 'control-parental', canActivate: [authGuard], loadChildren: () => import('./parental/parental.module').then(m => m.ParentalModule) },
  { path: 'catalog', data: preload, loadChildren: () => import('./catalog/book-list/book-list.module').then(m => m.CatalogRouteModule) },
  { path: 'authors', data: preload, loadChildren: () => import('./catalog/author-list/author-list.module').then(m => m.AuthorsRouteModule) },
  { path: 'publish-book', canActivate: [authGuard], loadChildren: () => import('./users/account.module').then(m => m.PublishBookRouteModule) },
  { path: 'authors/publish', redirectTo: 'publish-book', pathMatch: 'full' },
  { path: 'characters', loadChildren: () => import('./characters/characters.module').then(m => m.CharacterHubRouteModule) },
  { path: 'chat', loadChildren: () => import('./characters/characters.module').then(m => m.DemoChatRouteModule) },
  { path: 'demo-chat', redirectTo: 'chat', pathMatch: 'full' },
  { path: 'demo-chat/:avatarId', redirectTo: 'chat/:avatarId' },
  { path: 'book/:slug', data: preload, loadChildren: () => import('./catalog/book-detail-page/book-detail-page.module').then(m => m.BookDetailRouteModule) },
  { path: 'author/:slug', data: preload, loadChildren: () => import('./catalog/author-detail-page/author-detail-page.module').then(m => m.AuthorDetailRouteModule) },
  { path: 'checkout', loadChildren: () => import('./catalog/commerce.module').then(m => m.CheckoutRouteModule) },
  { path: 'payment', loadChildren: () => import('./catalog/commerce.module').then(m => m.PaymentRouteModule) },
  { path: 'library', canActivate: [authGuard], data: preload, loadChildren: () => import('./library/library-list/library-list.module').then(m => m.LibraryRouteModule) },
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
  { path: 'categories', data: preload, loadChildren: () => import('./categories/categories.module').then(m => m.CategoriesRouteModule) },
  { path: '', component: HomeComponent, pathMatch: 'full' },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: IdlePreloadStrategy, scrollPositionRestoration: 'top' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
