import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { BookListComponent } from './catalog/book-list/book-list.component';
import { ReaderComponent } from './library/reader/reader.component';

import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HttpClientModule, provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { BookDetailPageComponent } from './catalog/book-detail-page/book-detail-page.component';
import { TavernComponent } from './library/tavern/tavern.component';
import { AuthorDetailPageComponent } from './catalog/author-detail-page/author-detail-page.component';
import { CheckoutComponent } from './catalog/checkout/checkout.component';
import { PaymentSuccessComponent } from './catalog/payment-success/payment-success.component';
import { PaymentFailureComponent } from './catalog/payment-failure/payment-failure.component';
import { LibraryListComponent } from './library/library-list/library-list.component';
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

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    RegisterComponent,
    BookListComponent,
    ReaderComponent,
    HomeComponent,
    BookDetailPageComponent,
    TavernComponent,
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
    ResetPasswordComponent
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
    provideHttpClient(withInterceptors([authInterceptor]))
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
