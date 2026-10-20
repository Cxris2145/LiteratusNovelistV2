import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { authInterceptor } from './auth.interceptor';

describe('Peticiones de perfil y renovación de sesión', () => {
  const profileUrl = `${environment.apiUrl}users/profile/`;
  const refreshUrl = `${environment.apiUrl}users/login/refresh/`;
  const inventoryUrl = `${environment.apiUrl}library/inventory/`;
  const favoritesUrl = `${environment.apiUrl}library/favorites/`;
  const storageKeys = ['access_token', 'refresh_token', 'user_profile'];
  let previousStorage: (string | null)[];
  let client: HttpClient;
  let api: ApiService;
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    previousStorage = storageKeys.map(key => localStorage.getItem(key));
    localStorage.setItem('access_token', 'access-a');
    localStorage.setItem('refresh_token', 'refresh-a');
    localStorage.removeItem('user_profile');
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
      { provide: NotificationService, useValue: { error: jasmine.createSpy('error') } },
    ] });
    client = TestBed.inject(HttpClient);
    api = TestBed.inject(ApiService);
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    storageKeys.forEach((key, index) => {
      const value = previousStorage[index];
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    });
  });

  it('comparte perfil entre HttpClient y ApiService solo mientras está en vuelo', () => {
    const values: unknown[] = [];
    client.get(profileUrl).subscribe(value => values.push(value));
    api.get('users/profile/').subscribe(value => values.push(value));
    api.getCached('users/profile/').subscribe(value => values.push(value));
    http.expectOne(profileUrl).flush({ ink_balance: 10 });
    expect(values).toEqual([{ ink_balance: 10 }, { ink_balance: 10 }, { ink_balance: 10 }]);
    expect(api.peekCached('users/profile/')).toBeNull();

    api.getCached('users/profile/').subscribe(value => values.push(value));
    http.expectOne(profileUrl).flush({ ink_balance: 7 });
    expect(values[3]).toEqual({ ink_balance: 7 });
  });

  it('permite volver a pedir un perfil después de un error compartido', () => {
    const error = jasmine.createSpy('error');
    client.get(profileUrl).subscribe({ error });
    api.get('users/profile/').subscribe({ error });
    http.expectOne(profileUrl).flush({}, { status: 500, statusText: 'Error' });
    expect(error).toHaveBeenCalledTimes(2);

    client.get(profileUrl).subscribe();
    http.expectOne(profileUrl).flush({ ink_balance: 9 });
  });

  it('descarta un perfil en vuelo tras una escritura y entrega el balance nuevo', () => {
    const value = jasmine.createSpy('profile');
    client.get(profileUrl).subscribe(value);
    const oldProfile = http.expectOne(profileUrl);
    client.post(`${environment.apiUrl}ai/sessions/one/messages/`, { text: 'Hola' }).subscribe();
    http.expectOne(`${environment.apiUrl}ai/sessions/one/messages/`).flush({ ink_balance: 7 });

    expect(oldProfile.cancelled).toBeTrue();
    expect(value).not.toHaveBeenCalled();
    http.expectOne(profileUrl).flush({ ink_balance: 7 });
    expect(value).toHaveBeenCalledOnceWith({ ink_balance: 7 });
  });

  it('cancela perfiles de la cuenta anterior al cambiar de sesión', () => {
    const oldValue = jasmine.createSpy('old profile');
    client.get(profileUrl).subscribe(oldValue);
    const oldProfile = http.expectOne(profileUrl);
    auth.startSession('access-b', 'refresh-b', null);
    expect(oldProfile.cancelled).toBeTrue();

    const newValue = jasmine.createSpy('new profile');
    client.get(profileUrl).subscribe(newValue);
    const newProfile = http.expectOne(profileUrl);
    expect(newProfile.request.headers.get('Authorization')).toBe('Bearer access-b');
    newProfile.flush({ ink_balance: 3 });
    expect(oldValue).not.toHaveBeenCalled();
    expect(newValue).toHaveBeenCalledOnceWith({ ink_balance: 3 });
  });

  it('renueva una sola vez ante 401 simultáneos sin repetir el evento de login', () => {
    const sessions: boolean[] = [];
    const subscription = auth.isLoggedIn$.subscribe(value => sessions.push(value));
    const inventory = jasmine.createSpy('inventory');
    const favorites = jasmine.createSpy('favorites');
    client.get(inventoryUrl).subscribe(inventory);
    client.get(favoritesUrl).subscribe(favorites);
    http.expectOne(inventoryUrl).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(favoritesUrl).flush({}, { status: 401, statusText: 'Expired' });
    const refresh = http.expectOne(refreshUrl);
    expect(refresh.request.body).toEqual({ refresh: 'refresh-a' });
    refresh.flush({ access: 'renewed-a', refresh: 'renewed-refresh-a' });

    for (const url of [inventoryUrl, favoritesUrl]) {
      const retry = http.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-a');
      retry.flush([]);
    }
    expect(sessions).toEqual([true]);
    expect(inventory).toHaveBeenCalledOnceWith([]);
    expect(favorites).toHaveBeenCalledOnceWith([]);
    subscription.unsubscribe();
  });

  it('un ingreso explícito sincroniza una vez los consumidores con las credenciales nuevas', () => {
    const tokens: (string | null)[] = [];
    const subscription = auth.isLoggedIn$.subscribe(() => tokens.push(auth.getAccessToken()));
    auth.startSession('access-b', 'refresh-b', null);
    expect(tokens).toEqual(['access-a', 'access-b']);
    subscription.unsubscribe();
  });

  it('reutiliza el token renovado ante un 401 tardío', () => {
    client.get(inventoryUrl).subscribe();
    client.get(favoritesUrl).subscribe();
    const lateRequest = http.expectOne(favoritesUrl);
    http.expectOne(inventoryUrl).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(refreshUrl).flush({ access: 'renewed-a' });
    http.expectOne(inventoryUrl).flush([]);

    lateRequest.flush({}, { status: 401, statusText: 'Expired' });
    http.expectNone(refreshUrl);
    const retry = http.expectOne(favoritesUrl);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-a');
    retry.flush([]);
  });

  it('cierra una sola vez la sesión si falla el refresh compartido', () => {
    const logout = spyOn(auth, 'logout').and.callFake(() => auth.clearTokens());
    client.get(inventoryUrl).subscribe({ error: () => {} });
    client.get(favoritesUrl).subscribe({ error: () => {} });
    http.expectOne(inventoryUrl).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(favoritesUrl).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(refreshUrl).flush({}, { status: 401, statusText: 'Invalid refresh' });
    expect(logout).toHaveBeenCalledTimes(1);
    expect(auth.isLoggedIn()).toBeFalse();
  });

  it('cancela un refresh anterior para no sustituir las credenciales de la cuenta nueva', () => {
    const oldValue = jasmine.createSpy('old result');
    client.get(inventoryUrl).subscribe(oldValue);
    http.expectOne(inventoryUrl).flush({}, { status: 401, statusText: 'Expired' });
    const oldRefresh = http.expectOne(refreshUrl);
    auth.startSession('access-b', 'refresh-b', null);
    expect(oldRefresh.cancelled).toBeTrue();
    expect(auth.getAccessToken()).toBe('access-b');
    expect(oldValue).not.toHaveBeenCalled();
    http.expectNone(inventoryUrl);
  });

  it('un 401 de la sesión anterior no renueva ni cierra la cuenta nueva', () => {
    const logout = spyOn(auth, 'logout');
    client.get(inventoryUrl).subscribe({ error: () => {} });
    const oldRequest = http.expectOne(inventoryUrl);
    auth.startSession('access-b', 'refresh-b', null);
    oldRequest.flush({}, { status: 401, statusText: 'Old session' });
    http.expectNone(refreshUrl);
    expect(logout).not.toHaveBeenCalled();
    expect(auth.getAccessToken()).toBe('access-b');
  });

  it('conserva la sesión si el reintento falla por un error del servidor', () => {
    const logout = spyOn(auth, 'logout');
    client.get(inventoryUrl).subscribe({ error: () => {} });
    http.expectOne(inventoryUrl).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(refreshUrl).flush({ access: 'renewed-a' });
    http.expectOne(inventoryUrl).flush({}, { status: 500, statusText: 'Error' });
    expect(logout).not.toHaveBeenCalled();
  });

  it('no envía JWT ni renueva sesión ante un 401 de assets o servicios externos', () => {
    const logout = spyOn(auth, 'logout');
    for (const url of ['assets/default_cover.jpg', 'https://media.example.test/cover.webp']) {
      client.get(url).subscribe({ error: () => {} });
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({}, { status: 401, statusText: 'External unauthorized' });
    }
    http.expectNone(refreshUrl);
    expect(logout).not.toHaveBeenCalled();
    expect(auth.getAccessToken()).toBe('access-a');
  });
});
