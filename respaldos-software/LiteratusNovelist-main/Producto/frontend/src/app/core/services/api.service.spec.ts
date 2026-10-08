import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';

describe('Caché del catálogo por sesión', () => {
  let api: ApiService;
  let http: HttpTestingController;
  let previousToken: string | null;

  beforeEach(() => {
    previousToken = localStorage.getItem('access_token');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    if (previousToken === null) localStorage.removeItem('access_token');
    else localStorage.setItem('access_token', previousToken);
  });

  it('no reutiliza resultados de la cuenta adulta al entrar una cuenta menor', () => {
    localStorage.setItem('access_token', 'sesion-adulta');
    api.getCached('catalog/books/').subscribe();
    http.expectOne(request => request.url.endsWith('catalog/books/')).flush({ results: ['Libro +18'] });
    expect(api.peekCached('catalog/books/')).toEqual({ results: ['Libro +18'] });

    localStorage.setItem('access_token', 'sesion-menor');
    expect(api.peekCached('catalog/books/')).toBeNull();
    api.getCached('catalog/books/').subscribe();
    http.expectOne(request => request.url.endsWith('catalog/books/')).flush({ results: ['Libro infantil'] });
    expect(api.peekCached('catalog/books/')).toEqual({ results: ['Libro infantil'] });

    localStorage.removeItem('access_token');
    expect(api.peekCached('catalog/books/')).toBeNull();
  });

  it('una respuesta en vuelo de otra sesión no sustituye la respuesta actual', () => {
    localStorage.setItem('access_token', 'sesion-adulta');
    api.getCached('catalog/books/').subscribe();
    const adultRequest = http.expectOne(request => request.url.endsWith('catalog/books/'));
    api.invalidate();
    localStorage.setItem('access_token', 'sesion-menor');
    api.getCached('catalog/books/').subscribe();
    const childRequest = http.expectOne(request => request.url.endsWith('catalog/books/'));
    childRequest.flush({ results: [] });
    adultRequest.flush({ results: ['Libro +18'] });
    expect(api.peekCached('catalog/books/')).toEqual({ results: [] });
  });
});
