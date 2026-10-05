import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';

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
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
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
      ['me', 'friends', 'requests', 'ranking', 'heartbeat'], { changed$: new Subject<void>() });
    router = jasmine.createSpyObj('Router', ['navigate']);
    loggedIn = false;
    query = {};
  });

  it('sin sesión muestra la mesa de ejemplo y no llama a la API', () => {
    const fixture = create();

    expect(community.me).not.toHaveBeenCalled();
    expect(community.heartbeat).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-tavern-scene')).not.toBeNull();
  });

  it('reenvía la vuelta de PayPal a la Tienda', () => {
    query = { paypal: 'return' };
    create();

    expect(router.navigate).toHaveBeenCalledWith(['/tavern/tienda'], { queryParams: { paypal: 'return' }, replaceUrl: true });
  });
});
