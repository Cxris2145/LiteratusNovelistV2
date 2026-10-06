import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, NEVER, Subject } from 'rxjs';

import { TavernHallComponent } from './tavern-hall.component';
import { AuthService } from '../../core/services/auth.service';
import { CommunityService } from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';

describe('TavernHallComponent', () => {
  let community: jasmine.SpyObj<CommunityService>;
  let router: jasmine.SpyObj<Router>;
  let loggedIn = false;
  let query: Record<string, string> = {};

  function create(): ComponentFixture<TavernHallComponent> {
    TestBed.configureTestingModule({
      declarations: [TavernHallComponent],
      providers: [
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } },
        { provide: CommunityService, useValue: community },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) }, queryParamMap: new BehaviorSubject(convertToParamMap(query)) },
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
      ['me', 'friends', 'requests', 'ranking', 'heartbeat', 'getActivity'], { changed$: new Subject<void>() });
    // La carga real no importa en estas pruebas: queda pendiente.
    for (const method of ['me', 'friends', 'requests', 'ranking', 'heartbeat', 'getActivity'] as const) {
      (community[method] as jasmine.Spy).and.returnValue(NEVER);
    }
    router = jasmine.createSpyObj('Router', ['navigate']);
    loggedIn = false;
    query = {};
  });

  it('sin sesión muestra la mesa de ejemplo y no llama a la API', () => {
    const fixture = create();

    expect(community.me).not.toHaveBeenCalled();
    expect(community.heartbeat).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-tavern-scene')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('app-tavern-music').length).toBe(1);
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
    expect(fixture.nativeElement.querySelectorAll('app-tavern-music').length).toBe(1);
  });

  it('el visitante que pide El Bazar va a iniciar sesión y vuelve al ropero', () => {
    const fixture = create();
    fixture.componentInstance.openBazar('ropero');

    expect(fixture.componentInstance.bazarOpen).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/tavern?bazar=ropero' } });
  });
});
