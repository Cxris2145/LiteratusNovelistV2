import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { HomeDataService, PublicHome } from './home-data.service';

describe('Public home data', () => {
  let service: HomeDataService;
  let http: HttpTestingController;
  let originalProduction: boolean;
  const fixture = (): PublicHome => ({
    version: 1, audience: 'public', generated_at: new Date().toISOString(),
    stats: { total_books: 1, total_characters: 0, total_authors: 1, total_genres: 0 },
    books: [], starter_books: [], genres: [], cast: []
  });

  beforeEach(() => {
    originalProduction = environment.production;
    environment.production = true;
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [{
      provide: HTTP_INTERCEPTORS, multi: true,
      useValue: { intercept: (request: any, next: any) => next.handle(request.clone({ setHeaders: { Authorization: 'secret' } })) }
    }] });
    service = TestBed.inject(HomeDataService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    environment.production = originalProduction;
  });

  it('shares one anonymous CDN request between subscribers and keeps the result', () => {
    const received: PublicHome[] = [];
    service.getHome().subscribe(value => received.push(value));
    service.getHome().subscribe(value => received.push(value));
    const request = http.expectOne('/api/public-home');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush(fixture());
    service.getHome().subscribe(value => received.push(value));
    expect(received.length).toBe(3);
    http.expectNone('/assets/data/home-public.json');
    http.expectNone(`${environment.apiUrl}catalog/home/`);
  });

  it('uses the public snapshot when the CDN is unavailable', () => {
    let received: PublicHome | undefined;
    service.getHome().subscribe(value => received = value);
    http.expectOne('/api/public-home').flush({}, { status: 503, statusText: 'Unavailable' });
    const snapshot = http.expectOne('/assets/data/home-public.json');
    expect(snapshot.request.headers.has('Authorization')).toBeFalse();
    snapshot.flush(fixture());
    expect(received?.audience).toBe('public');
    http.expectNone(`${environment.apiUrl}catalog/home/`);
  });

  it('rejects an invalid CDN response and an expired snapshot before requesting the aggregate API', () => {
    let received: PublicHome | undefined;
    service.getHome().subscribe(value => received = value);
    http.expectOne('/api/public-home').flush({ ...fixture(), audience: 'adult' });
    http.expectOne('/assets/data/home-public.json').flush({ ...fixture(), generated_at: new Date(Date.now() - 86_400_000).toISOString() });
    const api = http.expectOne(`${environment.apiUrl}catalog/home/`);
    expect(api.request.headers.has('Authorization')).toBeFalse();
    api.flush(fixture());
    expect(received?.audience).toBe('public');
  });

  it('stops waiting for a cold CDN and missing static asset before using the API', fakeAsync(() => {
    service.getHome().subscribe();
    const cdn = http.expectOne('/api/public-home');
    tick(1500);
    expect(cdn.cancelled).toBeTrue();
    const snapshot = http.expectOne('/assets/data/home-public.json');
    tick(2000);
    expect(snapshot.cancelled).toBeTrue();
    http.expectOne(`${environment.apiUrl}catalog/home/`).flush(fixture());
  }));

  it('refreshes the shared response after five minutes', fakeAsync(() => {
    service.getHome().subscribe();
    http.expectOne('/api/public-home').flush(fixture());
    tick(300_001);
    service.getHome().subscribe();
    http.expectOne('/api/public-home').flush(fixture());
  }));

  it('uses the local API directly in development', () => {
    environment.production = false;
    service.getHome().subscribe();
    http.expectOne(`${environment.apiUrl}catalog/home/`).flush(fixture());
    http.expectNone('/api/public-home');
    http.expectNone('/assets/data/home-public.json');
  });
});
