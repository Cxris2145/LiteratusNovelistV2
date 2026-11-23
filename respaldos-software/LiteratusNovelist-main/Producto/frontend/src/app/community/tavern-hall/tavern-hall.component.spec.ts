import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject, NEVER, Subject, of } from 'rxjs';

import { TavernHallComponent } from './tavern-hall.component';
import { AuthService } from '../../core/services/auth.service';
import { CommunityService } from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { TAVERN_MOBILE_QUERY } from '../mobile-panel/tavern-mobile-panel.directive';

describe('TavernHallComponent', () => {
  let community: jasmine.SpyObj<CommunityService>;
  let router: jasmine.SpyObj<Router>;
  let loggedIn = false;
  let guest = false;
  let mobile = false;
  let query: Record<string, string> = {};
  let queryChanges: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let fragmentChanges: BehaviorSubject<string | null>;

  function create(): ComponentFixture<TavernHallComponent> {
    queryChanges.next(convertToParamMap(query));
    TestBed.configureTestingModule({
      declarations: [TavernHallComponent],
      imports: [NoopAnimationsModule],
      providers: [
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn, isGuest: () => guest } },
        { provide: CommunityService, useValue: community },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(query) },
            queryParamMap: queryChanges,
            fragment: fragmentChanges,
          },
        },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open'), openDialogs: [] } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['success', 'error']) },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    const fixture = TestBed.createComponent(TavernHallComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    community = jasmine.createSpyObj('CommunityService',
      ['me', 'friends', 'requests', 'heartbeat', 'getActivity'], { changed$: new Subject<void>() });
    // La carga real no importa en estas pruebas: queda pendiente.
    for (const method of ['me', 'friends', 'requests', 'heartbeat', 'getActivity'] as const) {
      (community[method] as jasmine.Spy).and.returnValue(NEVER);
    }
    router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));
    loggedIn = false;
    guest = false;
    mobile = false;
    query = {};
    queryChanges = new BehaviorSubject(convertToParamMap({}));
    fragmentChanges = new BehaviorSubject<string | null>(null);
    spyOn(window, 'matchMedia').and.callFake(media => ({
      matches: media === TAVERN_MOBILE_QUERY && mobile,
      media,
      onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => true,
    } as MediaQueryList));
  });

  it('sin sesión muestra la mesa de ejemplo y no llama a la API', () => {
    const fixture = create();

    expect(community.me).not.toHaveBeenCalled();
    expect(community.heartbeat).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-tavern-scene')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-tavern-music')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-tavern-bazar')).toBeNull();
  });

  it('reenvía la vuelta de PayPal a los planes', () => {
    query = { paypal: 'return' };
    create();

    expect(router.navigate).toHaveBeenCalledWith(['/planes'], { queryParams: { paypal: 'return' }, replaceUrl: true });
  });

  it('?bazar=racha abre El Bazar en ese mostrador, dentro de la taberna', () => {
    loggedIn = true;
    query = { bazar: 'racha' };
    const fixture = create();

    expect(fixture.componentInstance.bazarOpen).toBeTrue();
    expect(fixture.componentInstance.bazarTab).toBe('racha');
    expect(fixture.nativeElement.querySelector('app-tavern-bazar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-tavern-music')).toBeNull();
  });

  it('el visitante que pide El Bazar va a iniciar sesión y vuelve al ropero', () => {
    const fixture = create();
    fixture.componentInstance.openBazar('ropero');

    expect(fixture.componentInstance.bazarOpen).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/tavern?bazar=ropero' } });
  });

  it('crea los paneles secundarios al abrirlos y conserva su instancia al cerrarlos', () => {
    loggedIn = true;
    mobile = true;
    const fixture = create();
    const hall = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('app-tavern-bazar')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-friend-chat')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-tavern-reading-clubs')).toBeNull();

    hall.openBazar('ropero');
    fixture.detectChanges();
    const bazar = fixture.nativeElement.querySelector('app-tavern-bazar');
    expect(bazar).not.toBeNull();
    hall.closeBazar();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-tavern-bazar')).toBe(bazar);

    hall.openChat('AMIGO');
    fixture.detectChanges();
    const chat = fixture.nativeElement.querySelector('app-friend-chat');
    hall.closeChat();
    fixture.detectChanges();
    expect(chat).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-friend-chat')).toBe(chat);

    hall.openClubs('lectura');
    fixture.detectChanges();
    const clubs = fixture.nativeElement.querySelector('app-tavern-reading-clubs');
    hall.closeClubs();
    fixture.detectChanges();
    expect(clubs).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-tavern-reading-clubs')).toBe(clubs);
  });

  it('mantiene un solo panel móvil abierto y pausa la escena mientras lo cubre', () => {
    loggedIn = true;
    mobile = true;
    const hall = create().componentInstance;
    expect(hall.scenePaused).toBeFalse();
    hall.openLocalPanel('friends');
    expect(hall.localPanel).toBe('friends');
    expect(hall.scenePaused).toBeTrue();
    hall.openClubs('lectura');
    expect(hall.localPanel).toBeNull();
    expect(hall.clubsOpen).toBeTrue();
    hall.openChat('AMIGO');
    expect(hall.clubsOpen).toBeFalse();
    expect(hall.chatOpen).toBeTrue();
    hall.openBazar('tintes');
    expect(hall.chatOpen).toBeFalse();
    expect(hall.bazarOpen).toBeTrue();
    hall.openLocalPanel('profile');
    expect(hall.bazarOpen).toBeFalse();
    expect(hall.localPanel).toBe('profile');
    hall.closeLocalPanel();
    expect(hall.scenePaused).toBeFalse();
  });

  it('el panel lateral de escritorio no pausa la mesa que sigue visible', () => {
    loggedIn = true;
    const hall = create().componentInstance;
    hall.openBazar('ropero');
    expect(hall.isMobile).toBeFalse();
    expect(hall.scenePaused).toBeFalse();
  });

  it('los enlaces directos abren e inicializan el panel correcto y cierran el perfil', () => {
    loggedIn = true;
    mobile = true;
    const fixture = create();
    const hall = fixture.componentInstance;
    hall.openLocalPanel('profile');
    queryChanges.next(convertToParamMap({ charla: 'amigo' }));
    fixture.detectChanges();
    expect(hall.localPanel).toBeNull();
    expect(hall.chatCode).toBe('AMIGO');
    expect(hall.chatVisited).toBeTrue();
    expect(fixture.nativeElement.querySelector('app-friend-chat')).not.toBeNull();
    queryChanges.next(convertToParamMap({ lectura: 'lectura-1' }));
    expect(hall.chatOpen).toBeFalse();
    expect(hall.clubsOpen).toBeTrue();
    expect(hall.clubsVisited).toBeTrue();
    expect(hall.activeClubId).toBe('lectura-1');
  });

  it('una cuenta de prueba no abre Charlas mediante un enlace directo', () => {
    loggedIn = true;
    guest = true;
    query = { charla: 'AMIGO' };
    const hall = create().componentInstance;
    expect(hall.chatOpen).toBeFalse();
    expect(hall.chatVisited).toBeFalse();
  });

  it('no superpone sondeos lentos y agrupa las recargas solicitadas en una sola', fakeAsync(() => {
    loggedIn = true;
    const firstPresence = new Subject<any>();
    const nextPresence = new Subject<any>();
    community.heartbeat.and.returnValues(firstPresence, nextPresence);
    community.me.and.returnValue(of({ friend_code: 'SELF', username: 'Lector', outfit: {}, level: 1 } as any));
    community.friends.and.returnValue(of({ results: [] }));
    community.requests.and.returnValue(of({ incoming: [], outgoing: [] }));
    community.getActivity.and.returnValue(of({ messages: [], reactions: [] }));
    const fixture = create();
    const hall = fixture.componentInstance;
    hall.loadAll();
    hall.loadAll();
    tick(24000);
    expect(community.heartbeat).toHaveBeenCalledTimes(1);
    expect(community.getActivity).toHaveBeenCalledTimes(1);

    firstPresence.next({ pending_incoming: 0 });
    firstPresence.complete();
    expect(community.heartbeat).toHaveBeenCalledTimes(2);
    expect(community.getActivity).toHaveBeenCalledTimes(2);
    fixture.destroy();
    tick();
  }));

  it('al destruir la vista cancela la recarga pendiente', () => {
    loggedIn = true;
    const fixture = create();
    fixture.componentInstance.loadAll();
    fixture.destroy();
    expect(community.heartbeat).toHaveBeenCalledTimes(1);
    expect(community.getActivity).toHaveBeenCalledTimes(1);
  });
});
