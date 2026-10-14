import { HttpClientTestingModule, HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TimeoutError } from 'rxjs';
import { ApiService } from './api.service';
import { ReadingSummaryResponse, ReadingSummaryService } from './reading-summary.service';

describe('ReadingSummaryService · generación y límites de espera', () => {
  let service: ReadingSummaryService;
  let http: HttpTestingController;
  const endpoint = 'library/inventory/inventory-123/reading-summary/';
  const ready: ReadingSummaryResponse = {
    status: 'ready',
    summary: {
      title: 'Hasta el capítulo 2',
      overview: 'Resumen de lo leído.',
      plot_recap: ['La historia comienza.'],
      key_events: ['El protagonista encuentra una pista.'],
      characters_status: [{ name: 'Protagonista', status: 'Busca respuestas.' }],
      current_cliffhanger: 'La pista sigue sin resolver.'
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [ApiService] });
    service = TestBed.inject(ReadingSummaryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function expectRequest(method: 'POST' | 'GET'): TestRequest {
    const request = http.expectOne(req => req.url.endsWith(endpoint) && req.method === method);
    if (method === 'POST') {
      expect(request.request.body).toEqual({ up_to_chapter: 2 });
    } else {
      expect(request.request.params.get('up_to_chapter')).toBe('2');
    }
    return request;
  }

  it('devuelve un resumen ya listo y termina sin consultar de nuevo', fakeAsync(() => {
    const next = jasmine.createSpy('next');
    const complete = jasmine.createSpy('complete');
    service.load('inventory-123', 2).subscribe({ next, complete });

    expectRequest('POST').flush(ready);

    expect(next).toHaveBeenCalledOnceWith(ready);
    expect(complete).toHaveBeenCalledTimes(1);
    tick(120000);
    http.expectNone(req => req.url.endsWith(endpoint));
  }));

  it('consulta cada dos segundos el mismo capítulo y sólo emite el resultado final', fakeAsync(() => {
    const next = jasmine.createSpy('next');
    const complete = jasmine.createSpy('complete');
    service.load('inventory-123', 2).subscribe({ next, complete });

    expectRequest('POST').flush({ status: 'generating' });
    expect(next).not.toHaveBeenCalled();
    tick(1999);
    http.expectNone(req => req.url.endsWith(endpoint));
    tick(1);
    expectRequest('GET').flush({ status: 'generating' });
    expect(next).not.toHaveBeenCalled();
    tick(1999);
    http.expectNone(req => req.url.endsWith(endpoint));
    tick(1);
    expectRequest('GET').flush(ready);

    expect(next).toHaveBeenCalledOnceWith(ready);
    expect(complete).toHaveBeenCalledTimes(1);
    tick(120000);
    http.expectNone(req => req.url.endsWith(endpoint));
  }));

  it('termina y entrega el motivo cuando el resumen no está disponible', fakeAsync(() => {
    const unavailable: ReadingSummaryResponse = { status: 'unavailable', message: 'Sin texto legible.' };
    const next = jasmine.createSpy('next');
    const complete = jasmine.createSpy('complete');
    service.load('inventory-123', 2).subscribe({ next, complete });
    expectRequest('POST').flush({ status: 'generating' });
    tick(2000);
    expectRequest('GET').flush(unavailable);

    expect(next).toHaveBeenCalledOnceWith(unavailable);
    expect(complete).toHaveBeenCalledTimes(1);
    tick(120000);
    http.expectNone(req => req.url.endsWith(endpoint));
  }));

  it('cancela una petición inicial sin respuesta después de quince segundos', fakeAsync(() => {
    const next = jasmine.createSpy('next');
    const error = jasmine.createSpy('error');
    service.load('inventory-123', 2).subscribe({ next, error });
    const request = expectRequest('POST');

    tick(14999);
    expect(error).not.toHaveBeenCalled();
    expect(request.cancelled).toBeFalse();
    tick(1);

    expect(error).toHaveBeenCalledOnceWith(jasmine.any(TimeoutError));
    expect(next).not.toHaveBeenCalled();
    expect(request.cancelled).toBeTrue();
    tick(120000);
    http.expectNone(req => req.url.endsWith(endpoint));
  }));

  it('aplica también el límite de quince segundos a cada consulta', fakeAsync(() => {
    const error = jasmine.createSpy('error');
    service.load('inventory-123', 2).subscribe({ error });
    expectRequest('POST').flush({ status: 'generating' });
    tick(2000);
    const request = expectRequest('GET');

    tick(14999);
    expect(error).not.toHaveBeenCalled();
    tick(1);

    expect(error).toHaveBeenCalledOnceWith(jasmine.any(TimeoutError));
    expect(request.cancelled).toBeTrue();
    tick(120000);
    http.expectNone(req => req.url.endsWith(endpoint));
  }));

  it('termina a los dos minutos aunque el servidor siga respondiendo generating', fakeAsync(() => {
    const next = jasmine.createSpy('next');
    const error = jasmine.createSpy('error');
    service.load('inventory-123', 2).subscribe({ next, error });
    expectRequest('POST').flush({ status: 'generating' });

    for (let poll = 0; poll < 59; poll++) {
      tick(2000);
      expectRequest('GET').flush({ status: 'generating' });
    }
    tick(1999);
    expect(error).not.toHaveBeenCalled();
    tick(1);

    expect(error).toHaveBeenCalledOnceWith(jasmine.any(TimeoutError));
    expect(next).not.toHaveBeenCalled();
    tick(20000);
    http.expectNone(req => req.url.endsWith(endpoint));
  }));

  it('deja de consultar si se cancela durante la espera entre peticiones', fakeAsync(() => {
    const next = jasmine.createSpy('next');
    const error = jasmine.createSpy('error');
    const subscription = service.load('inventory-123', 2).subscribe({ next, error });
    expectRequest('POST').flush({ status: 'generating' });
    tick(1000);

    subscription.unsubscribe();
    tick(120000);

    http.expectNone(req => req.url.endsWith(endpoint));
    expect(next).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  }));

  it('cancela la consulta en vuelo al cerrar la suscripción', fakeAsync(() => {
    const next = jasmine.createSpy('next');
    const error = jasmine.createSpy('error');
    const subscription = service.load('inventory-123', 2).subscribe({ next, error });
    expectRequest('POST').flush({ status: 'generating' });
    tick(2000);
    const request = expectRequest('GET');

    subscription.unsubscribe();

    expect(request.cancelled).toBeTrue();
    tick(120000);
    http.expectNone(req => req.url.endsWith(endpoint));
    expect(next).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  }));
});
