import { NotebookLauncherComponent } from './notebook/notebook-launcher/notebook-launcher.component';
import { RouteProgressComponent } from './core/components/route-progress/route-progress.component';
import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { AppRoutingModule } from './app-routing.module';
import { SharedModule } from './shared/shared.module';
import { AppComponent } from './app.component';
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

import { FooterComponent } from './core/components/footer/footer.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { AssistantWidgetComponent } from './core/components/assistant-widget/assistant-widget.component';
import { achievementInterceptor } from './core/interceptors/achievement.interceptor';
import { GuideDialogComponent } from './core/components/guide-dialog/guide-dialog.component';

@NgModule({
  // Las páginas van en sus propios módulos (ver app-routing.module.ts); aquí solo la portada
  // y la estructura que se ve en todas: encabezado, menú inferior, pie, asistente y guía.
  declarations: [
    AppComponent,
    BottomNavComponent,
    MainNavComponent,
    HeaderSearchComponent,
    HomeComponent,
    FooterComponent,
    AssistantWidgetComponent,
    GuideDialogComponent,
  ],


  imports: [
    BrowserModule,
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
    // El motor de animaciones (~60 KB) se baja aparte, sin frenar la primera página.
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([authInterceptor, achievementInterceptor])),
    { provide: RouteReuseStrategy, useClass: AppRouteReuseStrategy }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
