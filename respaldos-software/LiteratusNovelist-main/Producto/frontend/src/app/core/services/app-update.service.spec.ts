import { TestBed } from '@angular/core/testing';
import { NavigationError, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { AppUpdateService, isChunkLoadError } from './app-update.service';
import { NotificationService } from './notification.service';

describe('AppUpdateService', () => {
  let events: Subject<unknown>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let service: AppUpdateService;
  let fullLoad: jasmine.Spy;

  const chunkError = new TypeError('Failed to fetch dynamically imported module: https://x.app/chunk-OLD.js');

  beforeEach(() => {
    sessionStorage.removeItem('literatus_chunk_reload');
    events = new Subject();
    notifications = jasmine.createSpyObj<NotificationService>('NotificationService', ['error']);
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        { provide: NotificationService, useValue: notifications },
      ],
    });
    fullLoad = spyOn(AppUpdateService.prototype as any, 'fullLoad');
    service = TestBed.inject(AppUpdateService);
  });

  afterEach(() => sessionStorage.removeItem('literatus_chunk_reload'));

  it('reconoce el error de archivo faltante de Chrome, Safari y Firefox', () => {
    expect(isChunkLoadError(chunkError)).toBeTrue();
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBeTrue();
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: /chunk-A.js'))).toBeTrue();
    expect(isChunkLoadError(new Error('Http failure response for /api/: 500'))).toBeFalse();
    expect(isChunkLoadError(undefined)).toBeFalse();
  });

  it('recarga la página directo en la sección pedida', () => {
    expect(service).toBeTruthy();
    events.next(new NavigationError(1, '/games/enigma', chunkError));
    expect(fullLoad).toHaveBeenCalledOnceWith('/games/enigma');
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('no recarga en bucle si la misma sección vuelve a fallar', () => {
    events.next(new NavigationError(1, '/learn', chunkError));
    events.next(new NavigationError(2, '/learn', chunkError));
    expect(fullLoad).toHaveBeenCalledTimes(1);
    expect(notifications.error).toHaveBeenCalledTimes(1);
  });

  it('ignora otros errores de navegación', () => {
    events.next(new NavigationError(1, '/learn', new Error('guard roto')));
    expect(fullLoad).not.toHaveBeenCalled();
    expect(notifications.error).not.toHaveBeenCalled();
  });
});
