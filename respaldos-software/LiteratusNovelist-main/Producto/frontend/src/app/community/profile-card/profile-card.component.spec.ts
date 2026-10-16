import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { ProfileCardComponent } from './profile-card.component';
import { userStorageKey } from '../../core/services/auth.service';
import { CommunityProfile } from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';

const CARD: CommunityProfile = {
  full: true, friend_code: 'K7Q2XM', username: 'lectora', tagline: 'Leo de noche', bio: 'Me encantan las sagas.',
  outfit: {}, equipped_frame: '', equipped_title: '', level: 3, level_name: 'Aprendiz', xp: 120,
  favorite_genres: [], stats: { books: 2, books_read: 1, reviews: 0, friends: 1, brindis: 0 },
  member_since: '2026-01-01T00:00:00Z', is_public: true, relation: 'self', request_id: null,
};

describe('ProfileCardComponent', () => {
  const key = userStorageKey('literatus_tavern_profile_more');
  let saved: string | null;

  beforeEach(() => {
    saved = localStorage.getItem(key);
    localStorage.removeItem(key);
    TestBed.configureTestingModule({
      declarations: [ProfileCardComponent],
      imports: [RouterTestingModule],
      providers: [{ provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['success', 'info']) }],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  afterEach(() => {
    if (saved === null) localStorage.removeItem(key);
    else localStorage.setItem(key, saved);
  });

  function create(compact: boolean): ComponentFixture<ProfileCardComponent> {
    const fixture = TestBed.createComponent(ProfileCardComponent);
    fixture.componentRef.setInput('card', CARD);
    fixture.componentRef.setInput('mine', true);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return fixture;
  }

  it('en la sala guarda "Sobre mí", la privacidad y el código en "Más sobre mí", cerrado e inerte', () => {
    const el: HTMLElement = create(true).nativeElement;
    const toggle = el.querySelector<HTMLButtonElement>('.pc-more-toggle')!;
    const region = el.querySelector<HTMLElement>('#pc-more')!;

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(region.hasAttribute('inert')).toBeTrue();
    expect(region.querySelector('.pc-about')).not.toBeNull();
    expect(region.querySelector('.pc-switch')).not.toBeNull();
    expect(region.querySelector('.pc-code')).not.toBeNull();
  });

  it('abre y cierra, y recuerda el estado por cuenta', () => {
    const fixture = create(true);
    const el: HTMLElement = fixture.nativeElement;

    el.querySelector<HTMLButtonElement>('.pc-more-toggle')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.pc-more-toggle')!.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('#pc-more')!.hasAttribute('inert')).toBeFalse();
    expect(localStorage.getItem(key)).toBe('1');

    const again: HTMLElement = create(true).nativeElement;
    expect(again.querySelector('.pc-more-toggle')!.getAttribute('aria-expanded')).toBe('true');

    el.querySelector<HTMLButtonElement>('.pc-more-toggle')!.click();
    fixture.detectChanges();
    expect(localStorage.getItem(key)).toBe('0');
  });

  it('fuera de la sala muestra todo sin desplegable', () => {
    const el: HTMLElement = create(false).nativeElement;

    expect(el.querySelector('.pc-more-toggle')).toBeNull();
    expect(el.querySelector('.pc-about')).not.toBeNull();
    expect(el.querySelector('.pc-stats dd')!.textContent!.trim()).toBe('2');
  });
});
