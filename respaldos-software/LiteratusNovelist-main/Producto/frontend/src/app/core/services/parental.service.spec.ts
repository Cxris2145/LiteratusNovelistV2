import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ParentalService } from './parental.service';
import { apiErrorMessage, fieldErrors, formatMinutes, relativeTime } from '../../parental/parental-format';

describe('ParentalService · control parental', () => {
  let service: ParentalService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(ParentalService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const endpoint = (path: string) => http.expectOne(req => req.url.endsWith(path));

  it('crea el perfil del hijo con la declaración del tutor', () => {
    service.createChild({ username: 'tomas', password: 'CuentoDeHadas2026!', birth_date: '2016-05-01', consent: true }).subscribe();
    const req = endpoint('/parental/children/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.consent).toBeTrue();
    req.flush({ id: 'abc', username: 'tomas' });
  });

  it('pide cada sección del historial por separado', () => {
    service.overview('abc').subscribe();
    endpoint('/parental/children/abc/').flush({});
    service.section('abc', 'games').subscribe();
    endpoint('/parental/children/abc/games/').flush({});
    service.chat('abc', 'chat1').subscribe();
    endpoint('/parental/children/abc/chats/chat1/').flush({});
  });

  it('solo manda la contraseña nueva al cambiar la contraseña', () => {
    service.act('abc', 'password', 'mia', 'nueva').subscribe();
    expect(endpoint('/parental/children/abc/password/').request.body).toEqual({ parent_password: 'mia', new_password: 'nueva' });
    service.act('abc', 'unlink', 'mia').subscribe();
    expect(endpoint('/parental/children/abc/unlink/').request.body).toEqual({ parent_password: 'mia' });
  });
});

describe('Formatos del control parental', () => {
  it('escribe los minutos en horas cuando corresponde', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(95)).toBe('1 h 35 min');
  });

  it('dice hace cuánto pasó algo', () => {
    const now = new Date(2026, 9, 26, 18, 0);
    expect(relativeTime(new Date(2026, 9, 26, 17, 55).toISOString(), now)).toBe('hace 5 min');
    expect(relativeTime(new Date(2026, 9, 26, 15, 0).toISOString(), now)).toBe('hace 3 h');
    expect(relativeTime(new Date(2026, 9, 25, 20, 0).toISOString(), now)).toBe('ayer');
    expect(relativeTime(null, now)).toBe('sin actividad todavía');
  });

  it('lee los errores del backend', () => {
    expect(apiErrorMessage({ status: 400, error: { error: 'La contraseña no es correcta.' } }, 'x')).toBe('La contraseña no es correcta.');
    expect(apiErrorMessage({ status: 429, error: {} }, 'x')).toContain('demasiados intentos');
    expect(fieldErrors({ error: { username: ['Ese nombre de usuario ya está en uso.'] } }))
      .toEqual({ username: 'Ese nombre de usuario ya está en uso.' });
    expect(fieldErrors({ error: { error: 'Falta la fecha.', code: 'BIRTH_DATE_REQUIRED', field: 'birth_date' } }))
      .toEqual({ birth_date: 'Falta la fecha.' });
  });
});
