import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../core/services/auth.service';
import { SceneGuest, TavernSceneComponent } from './tavern-scene.component';
import { TAVERN_LITE_QUERY } from '../tavern-motion';

describe('TavernSceneComponent mobile', () => {
  let fixture: ComponentFixture<TavernSceneComponent>;
  let component: TavernSceneComponent;
  const me: SceneGuest = { code: 'me', username: 'Mi Maguito', outfit: {} };

  beforeEach(() => {
    spyOn(window, 'matchMedia').and.callFake(query => ({
      matches: query === TAVERN_LITE_QUERY, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    } as MediaQueryList));
    TestBed.configureTestingModule({
      declarations: [TavernSceneComponent],
      imports: [CommonModule, FormsModule],
      providers: [{ provide: AuthService, useValue: { isGuest: () => false, isLoggedIn: () => true } }],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(TavernSceneComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('me', me);
  });

  function click(selector: string): void {
    (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('mantiene todos los participantes accesibles aunque solo dibuje cuatro invitados', () => {
    const guests: SceneGuest[] = Array.from({ length: 6 }, (_, index) => ({
      code: 'guest-' + index, username: 'Amigo ' + index, outfit: {},
      status: { kind: 'tavern', label: 'En la taberna', book_title: null },
    }));
    guests.push({
      code: 'reading', username: 'Leyendo fuera', outfit: {},
      status: { kind: 'reading', label: 'Leyendo', book_title: 'Un libro' },
    });
    fixture.componentRef.setInput('guests', guests);
    fixture.detectChanges();
    click('.ts-participants-toggle');

    expect(component.seats.length).toBe(5);
    expect(component.participants.map(guest => guest.code)).toEqual(['me', ...guests.slice(0, 6).map(guest => guest.code)]);
    const buttons = fixture.nativeElement.querySelectorAll('.ts-participant') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(7);
    const selected = spyOn(component.guestSelect, 'emit');
    buttons[6].click();
    expect(selected).toHaveBeenCalledWith(guests[5]);
    expect(component.participantsOpen).toBeFalse();
  });

  it('abre expresiones sin dejar historial ni acciones superpuestos', () => {
    fixture.detectChanges();
    component.historyOpenState = true;
    component.actionsOpen = true;
    click('.ts-emoji-toggle');

    expect(component.historyOpenState).toBeFalse();
    expect(component.actionsOpen).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('.ts-expression-reactions .ts-react-pill').length).toBe(5);
    expect(fixture.nativeElement.querySelectorAll('.ts-emoji-grid .ts-emoji-pick-btn').length).toBe(8);

    click('.ts-participants-toggle');
    expect(component.showEmojiList).toBeFalse();
    expect(component.participantsOpen).toBeTrue();

    click('.ts-mobile-history');
    expect(component.participantsOpen).toBeFalse();
    expect(component.showEmojiList).toBeFalse();
    expect(fixture.nativeElement.querySelector('.ts-history')).not.toBeNull();
  });

  it('Escape cierra la lista sin propagarse al modo cine', () => {
    fixture.detectChanges();
    click('.ts-participants-toggle');
    const documentEscape = jasmine.createSpy('documentEscape');
    document.addEventListener('keydown', documentEscape);
    try {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      fixture.nativeElement.querySelector('.ts-participant').dispatchEvent(event);
      expect(component.participantsOpen).toBeFalse();
      expect(event.defaultPrevented).toBeTrue();
      expect(documentEscape).not.toHaveBeenCalled();
    } finally { document.removeEventListener('keydown', documentEscape); }
  });

  it('pausa la mesa cubierta y conserva el borrador al volver', () => {
    fixture.detectChanges();
    component.chatText = 'Sigo aquí';
    fixture.componentRef.setInput('paused', true);
    fixture.detectChanges();

    expect(component.ambientPaused).toBeTrue();
    expect(fixture.nativeElement.dataset.ambientPaused).toBe('true');
    expect(component.chatText).toBe('Sigo aquí');

    fixture.componentRef.setInput('paused', false);
    fixture.detectChanges();
    expect(component.chatText).toBe('Sigo aquí');
  });
});
