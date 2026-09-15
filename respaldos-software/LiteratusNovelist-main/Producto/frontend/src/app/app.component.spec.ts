import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { ChatService } from './core/services/chat.service';
import { SettingsService } from './core/services/settings.service';

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
    profileUpdated$: new Subject<void>(),
    loadInitialInk: jasmine.createSpy('loadInitialInk'),
    getUserProfile: () => of(null)
  };

  const settingsMock = { loadSettings: () => of(null) };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, RouterTestingModule, NoopAnimationsModule],
      declarations: [AppComponent],
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: ChatService, useValue: chatMock },
        { provide: SettingsService, useValue: settingsMock }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
  });

  it('crea la aplicación', () => {
    expect(component).toBeTruthy();
    expect(component.title).toBe('frontend');
  });

  it('navega al catálogo con query param al realizar búsqueda global', () => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    component.globalSearchTerm = 'Misterio';
    component.onGlobalSearch();
    expect(router.navigate).toHaveBeenCalledWith(['/catalog'], { queryParams: { search: 'Misterio' } });

    component.globalSearchTerm = '';
    component.onGlobalSearch();
    expect(router.navigate).toHaveBeenCalledWith(['/catalog']);
  });

  it('limpia el término de búsqueda global', () => {
    component.globalSearchTerm = 'Fantasía';
    component.clearGlobalSearch();
    expect(component.globalSearchTerm).toBe('');
  });

  it('navega a /tavern al abrir la taberna', () => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    component.openTavern();
    expect(router.navigate).toHaveBeenCalledWith(['/tavern']);
  });

  it('calcula las iniciales del usuario correctamente', () => {
    expect(component.userInitials).toBe('V');
  });
});
