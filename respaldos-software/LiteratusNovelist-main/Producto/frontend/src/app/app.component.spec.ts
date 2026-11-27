import { ElementRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { ChatService } from './core/services/chat.service';
import { SettingsService } from './core/services/settings.service';
import { ApiService } from './core/services/api.service';
import { AppUpdateService } from './core/services/app-update.service';
import { AchievementsService } from './core/services/achievements.service';
import { CharacterChatService } from './core/services/character-chat.service';
import { FavoritesService } from './core/services/favorites.service';
import { GamificationService } from './core/services/gamification.service';
import { GuestSessionService } from './core/services/guest-session.service';
import { MaguitoThemeService } from './core/services/maguito-theme.service';
import { NotificationService } from './core/services/notification.service';
import { ScrollRevealService } from './core/services/scroll-reveal.service';
import { NotebookService } from './notebook/notebook.service';

describe('AppComponent navigation', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;

  const authMock = {
    isLoggedIn$: new BehaviorSubject(false),
    currentUser: () => null,
    isLoggedIn: () => false,
    isAdmin: () => false,
    clearTokens: jasmine.createSpy('clearTokens')
  };

  const chatMock = {
    inkBalance$: new BehaviorSubject(0),
    infiniteInk$: of(false),
    profileUpdated$: new Subject<void>(),
    loadInitialInk: jasmine.createSpy('loadInitialInk'),
    getUserProfile: () => of(null)
  };

  const settingsMock = {
    loadSettings: () => of(null),
    currentTheme$: of('light'),
    themeSaveFailed$: new Subject<void>(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [AppComponent],
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: ChatService, useValue: chatMock },
        { provide: SettingsService, useValue: settingsMock },
        { provide: ApiService, useValue: {} },
        { provide: GuestSessionService, useValue: {} },
        { provide: AppUpdateService, useValue: {} },
        { provide: MaguitoThemeService, useValue: {} },
        { provide: FavoritesService, useValue: { count$: of(0) } },
        { provide: GamificationService, useValue: { dailyRewardClaimable$: of(false), profile$: of(null) } },
        { provide: AchievementsService, useValue: {} },
        { provide: NotificationService, useValue: { notifications$: of([]) } },
        { provide: MatDialog, useValue: {} },
        { provide: ScrollRevealService, useValue: {} },
        { provide: CharacterChatService, useValue: { request$: of(null) } },
        { provide: NotebookService, useValue: { visibility$: of('closed') } },
      ],
    }).overrideComponent(AppComponent, { set: { template: '', styles: [], styleUrls: [] } }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
  });

  it('crea la aplicación', () => {
    expect(component).toBeTruthy();
    expect(component.title).toBe('frontend');
  });

  it('el contador de Tinta abre la recarga de Tinta en los planes', () => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    component.openInkTopUp();
    expect(router.navigate).toHaveBeenCalledWith(['/planes'], { fragment: 'tinta' });
  });

  it('calcula las iniciales del usuario correctamente', () => {
    expect(component.userInitials).toBe('V');
  });

  it('repone las medidas CSS al volver a montar un encabezado del mismo alto', () => {
    let notifyResize: () => void = () => {};
    spyOn(window, 'ResizeObserver').and.callFake((function(callback: ResizeObserverCallback) {
      const observer: ResizeObserver = {
        observe: () => {}, unobserve: () => {}, disconnect: () => {},
      };
      notifyResize = () => callback([], observer);
      return observer;
    }) as any);
    const frames: FrameRequestCallback[] = [];
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => {
      frames.push(callback);
      return frames.length;
    });
    spyOn(window, 'cancelAnimationFrame');
    const host = fixture.nativeElement as HTMLElement;
    const createHeader = () => {
      const header = document.createElement('header');
      const nav = document.createElement('div');
      const content = document.createElement('app-main-nav');
      nav.className = 'nav-bubbles-bar';
      nav.append(content);
      header.append(nav);
      Object.defineProperty(header, 'offsetHeight', { value: 88 });
      Object.defineProperty(nav, 'offsetHeight', { value: 32 });
      Object.defineProperty(content, 'offsetHeight', { value: 80 });
      return new ElementRef(header);
    };

    component.mainHeaderRef = createHeader();
    notifyResize();
    notifyResize();
    expect(frames.length).toBe(1);
    frames.shift()!(0);
    expect(host.style.getPropertyValue('--navbar-h')).toBe('88px');
    expect(host.style.getPropertyValue('--navbar-expanded-h')).toBe('136px');
    expect(host.style.getPropertyValue('--tavern-nav-fill')).toBe('48px');

    component.mainHeaderRef = undefined;
    expect(host.style.getPropertyValue('--navbar-h')).toBe('');
    component.mainHeaderRef = createHeader();
    notifyResize();
    frames.shift()!(0);
    expect(host.style.getPropertyValue('--navbar-h')).toBe('88px');
    expect(host.style.getPropertyValue('--navbar-expanded-h')).toBe('136px');
    expect(host.style.getPropertyValue('--tavern-nav-fill')).toBe('48px');
  });
});
