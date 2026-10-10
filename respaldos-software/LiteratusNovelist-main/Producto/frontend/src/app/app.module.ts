import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { OnboardingComponent } from './auth/onboarding/onboarding.component';
import { BookListComponent } from './catalog/book-list/book-list.component';
import { ReaderComponent } from './library/reader/reader.component';
import { ReaderTabsComponent } from './library/reader/reader-tabs/reader-tabs.component';
import { VocabularyPanelComponent } from './library/reader/vocabulary-panel/vocabulary-panel.component';
import { MaguitoComponent } from './core/components/maguito/maguito.component';
import { MainNavComponent } from './core/components/main-nav/main-nav.component';

import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HttpClientModule, provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { CommonModule } from '@angular/common';
import { RouteReuseStrategy, RouterModule } from '@angular/router';
import { AppRouteReuseStrategy } from './core/app-route-reuse.strategy';
import { HomeComponent } from './home/home.component';
import { BookDetailPageComponent } from './catalog/book-detail-page/book-detail-page.component';
import { MembershipComponent } from './membership/membership.component';
import { AIUsageMeterComponent } from './core/components/ai-usage-meter/ai-usage-meter.component';
import { AuthorDetailPageComponent } from './catalog/author-detail-page/author-detail-page.component';
import { CheckoutComponent } from './catalog/checkout/checkout.component';
import { PaymentSuccessComponent } from './catalog/payment-success/payment-success.component';
import { PaymentFailureComponent } from './catalog/payment-failure/payment-failure.component';
import { LibraryListComponent } from './library/library-list/library-list.component';
import { AuthorSubmitBookComponent } from './catalog/author-submit-book/author-submit-book.component';
import { CharacterHubComponent } from './characters/character-hub/character-hub.component';
import { DemoChatPageComponent } from './characters/demo-chat-page/demo-chat-page.component';
import { AudioVisualizerComponent } from './core/components/audio-visualizer/audio-visualizer.component';

import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { ProfileComponent } from './users/profile/profile.component';
import { AuthorListComponent } from './catalog/author-list/author-list.component';
import { LucideSparkles, LucideFlame, LucideStar, LucideShoppingCart, LucideBookOpen, LucidePenTool, LucideLock, LucideLandmark, LucideShieldCheck, LucideCreditCard, LucideUser, LucideUsers, LucideLogOut, LucideBarChart2, LucideHome, LucideCheck, LucideX, LucideFileText, LucidePlus, LucidePlay, LucidePause, LucideSquare, LucideInfo, LucideSearch, LucideBookmark, LucideHelpCircle, LucideMessageSquare, LucidePackage, LucideCrown, LucideCheckCircle, LucideLibrary, LucideXCircle, LucideRefreshCcw, LucideMessageCircle, LucideClock, LucideVolume2, LucideEye, LucideEyeOff, LucideDownload, LucideLogIn, LucideVolumeX } from '@lucide/angular';
import { FooterComponent } from './core/components/footer/footer.component';
import { CategoriesComponent } from './categories/categories.component';
import { CategoryDetailComponent } from './categories/category-detail/category-detail.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { VerifyEmailComponent } from './auth/verify-email/verify-email.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';
import { FavoritesComponent } from './library/favorites/favorites.component';
import { MessagesComponent } from './characters/messages/messages.component';
import { CartComponent } from './catalog/cart/cart.component';
import { AssistantWidgetComponent } from './core/components/assistant-widget/assistant-widget.component';
import { AchievementsComponent } from './library/achievements/achievements.component';
import { AvatarFrameComponent } from './core/components/avatar-frame/avatar-frame.component';
import { CosmeticPreviewComponent } from './core/components/cosmetic-preview/cosmetic-preview.component';
import { achievementInterceptor } from './core/interceptors/achievement.interceptor';
import { EnigmaGameComponent } from './library/games/enigma-game/enigma-game.component';
import { BlindInterrogationComponent } from './library/games/blind-interrogation/blind-interrogation.component';
import { GuideDialogComponent } from './core/components/guide-dialog/guide-dialog.component';
import { BookSummaryComponent } from './core/components/book-summary/book-summary.component';
import { ScrollRevealDirective } from './core/directives/scroll-reveal.directive';
import { CountUpDirective } from './core/directives/count-up.directive';
import { TiltDirective } from './core/directives/tilt.directive';
import { InkwellComponent } from './membership/inkwell/inkwell.component';
import { TavernHallComponent } from './community/tavern-hall/tavern-hall.component';
import { TavernSceneComponent } from './community/tavern-scene/tavern-scene.component';
import { TavernBazarComponent } from './community/tavern-bazar/tavern-bazar.component';
import { TavernTableComponent } from './community/tavern-table/tavern-table.component';
import { TavernMusicComponent } from './community/tavern-music/tavern-music.component';
import { ProfileCardComponent } from './community/profile-card/profile-card.component';
import { FriendListComponent } from './community/friend-list/friend-list.component';
import { TavernRankingComponent } from './community/tavern-ranking/tavern-ranking.component';
import { AddFriendDialogComponent } from './community/add-friend-dialog/add-friend-dialog.component';
import { FriendProfileComponent } from './community/friend-profile/friend-profile.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    RegisterComponent,
    BookListComponent,
    ReaderComponent,
    ReaderTabsComponent,
    VocabularyPanelComponent,
    MaguitoComponent,
    MainNavComponent,
    HomeComponent,
    BookDetailPageComponent,
    MembershipComponent,
    AuthorDetailPageComponent,
    CheckoutComponent,
    PaymentSuccessComponent,
    PaymentFailureComponent,
    LibraryListComponent,
    CharacterHubComponent,
    DemoChatPageComponent,
    ProfileComponent,
    AuthorListComponent,
    AudioVisualizerComponent,
    FooterComponent,
    CategoriesComponent,
    CategoryDetailComponent,
    VerifyEmailComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    FavoritesComponent,
    MessagesComponent,
    CartComponent,
    AssistantWidgetComponent,
    AchievementsComponent,
    AvatarFrameComponent,
    CosmeticPreviewComponent,
    EnigmaGameComponent,
    GuideDialogComponent,
    BookSummaryComponent,
    ScrollRevealDirective,
    CountUpDirective,
    TiltDirective,
    InkwellComponent,
    AuthorSubmitBookComponent,
    OnboardingComponent,
    BlindInterrogationComponent,
    TavernHallComponent,
    TavernSceneComponent,
    TavernBazarComponent,
    ProfileCardComponent,
    FriendListComponent,
    TavernRankingComponent,
    AddFriendDialogComponent,
    FriendProfileComponent
  ],


  imports: [
    TavernMusicComponent,
    TavernTableComponent,
    AIUsageMeterComponent,
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule,
    RouterModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    MatMenuModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatDialogModule,
    MatSnackBarModule,
    LucideSparkles, LucideFlame, LucideStar, LucideShoppingCart, LucideBookOpen, LucidePenTool, LucideLock, LucideLandmark, LucideShieldCheck, LucideCreditCard, LucideUser, LucideUsers, LucideLogOut, LucideBarChart2, LucideHome, LucideCheck, LucideX, LucideFileText, LucidePlus, LucidePlay, LucidePause, LucideSquare, LucideInfo, LucideSearch, LucideBookmark, LucideHelpCircle, LucideMessageSquare, LucidePackage, LucideCrown, LucideCheckCircle, LucideLibrary, LucideXCircle, LucideRefreshCcw, LucideMessageCircle, LucideClock, LucideVolume2, LucideEye, LucideEyeOff, LucideDownload, LucideLogIn, LucideVolumeX, ServiceWorkerModule.register('ngsw-worker.js', {
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
