import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { FriendCard } from '../../core/services/community.service';
import { FriendListComponent } from './friend-list.component';

function friend(code: string, avatar: string | null = null): FriendCard {
  return {
    friend_code: code, username: code, avatar, outfit: {}, equipped_frame: '', equipped_title: '',
    tagline: '', level: 1, level_name: 'Aprendiz', brindis_given: false,
    status: { kind: 'away', label: 'De paseo', book_title: null },
  };
}

describe('FriendListComponent: gestos y presencia', () => {
  let fixture: ComponentFixture<FriendListComponent>;
  let component: FriendListComponent;

  beforeEach(() => {
    spyOn(window, 'matchMedia').and.callFake(query => ({
      matches: query === '(hover: hover) and (pointer: fine)', media: query,
      onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    } as MediaQueryList));
    TestBed.configureTestingModule({ declarations: [FriendListComponent] });
    // Estas pruebas cubren el ciclo de los gestos, independiente del diseño de las filas.
    TestBed.overrideComponent(FriendListComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(FriendListComponent);
    component = fixture.componentInstance;
  });

  it('actualiza cuántos amigos están en la Taberna cuando cambia su presencia', () => {
    const away = friend('away');
    const present = { ...friend('present'), status: { kind: 'tavern' as const, label: 'En la taberna', book_title: null } };
    fixture.componentRef.setInput('friends', [away, present]);
    fixture.detectChanges();
    expect(component.presentCount).toBe(1);

    fixture.componentRef.setInput('friends', [away, { ...present, status: away.status }]);
    fixture.detectChanges();
    expect(component.presentCount).toBe(0);
  });

  it('una foto visible no despierta un Maguito; si la foto falla, vuelve a permitir su gesto', fakeAsync(() => {
    const reader = friend('photo', 'https://example.com/avatar.png');
    fixture.componentRef.setInput('friends', [reader]);
    fixture.detectChanges();
    component.poke(reader);
    expect(component.awake).toBeNull();

    component.photos.failed(reader.friend_code);
    component.poke(reader);
    expect(component.awake).toBe(reader.friend_code);
    tick(650);
    expect(component.awake).toBeNull();
  }));

  it('aceptar dos amigos seguidos deja terminar la celebración del segundo', fakeAsync(() => {
    fixture.componentRef.setInput('friends', [friend('first'), friend('second')]);
    fixture.componentRef.setInput('celebrate', 'first');
    fixture.detectChanges();
    tick(500);
    fixture.componentRef.setInput('celebrate', 'second');
    fixture.detectChanges();

    tick(600);
    expect(component.celebrating).toBe('second');
    expect(component.awake).toBe('second');
    tick(500);
    expect(component.celebrating).toBeNull();
    expect(component.awake).toBeNull();
  }));

  it('cancela los gestos pendientes al salir de la Taberna', fakeAsync(() => {
    const reader = friend('reader');
    fixture.componentRef.setInput('friends', [reader]);
    fixture.detectChanges();
    component.poke(reader);
    fixture.destroy();
    tick(1100);

    expect(component.awake).toBe(reader.friend_code);
  }));
});
