import { HttpInterceptorFn, HttpErrorResponse, HttpBackend, HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';
import { catchError, switchMap, throwError } from 'rxjs';
import { Router } from '@angular/router';

const isPublicReadRequest = (req: any): boolean => {
  return req.method === 'GET' && (
    req.url.includes('/api/v1/catalog/') ||
    req.url.includes('/api/v1/ai/hub/')
  );
};

const isProtectedRoute = (url: string): boolean => {
  return url.startsWith('/library') ||
    url.startsWith('/reader') ||
    url.startsWith('/profile') ||
    url.startsWith('/checkout') ||
    url.startsWith('/dashboard');
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const httpBackend = inject(HttpBackend);
  const token = authService.getAccessToken();
  const isApiRequest = req.url.startsWith(environment.apiUrl);

  let authReq = req;
  if (token && isApiRequest) {
    authReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });
  }

  return next(authReq).pipe(
    catchError((error: any) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        if (token && isPublicReadRequest(req)) {
          authService.clearTokens();
          return next(req);
        }

        // Evitar interceptar si la petición ya es de login o de refresco
        if (req.url.includes('/users/login/') || req.url.includes('/login/')) {
          return throwError(() => error);
        }

        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          // Bypassear interceptores para la petición de refresco usando HttpBackend
          const httpClientBypass = new HttpClient(httpBackend);
          const refreshUrl = `${environment.apiUrl}users/login/refresh/`;

          return httpClientBypass.post<any>(refreshUrl, { refresh: refreshToken }).pipe(
            switchMap((res: any) => {
              const newAccessToken = res.access;
              const newRefreshToken = res.refresh || refreshToken;

              authService.setTokens(newAccessToken, newRefreshToken);

              const retryReq = req.clone({
                headers: req.headers.set('Authorization', `Bearer ${newAccessToken}`)
              });
              return next(retryReq);
            }),
            catchError((refreshErr) => {
              authService.clearTokens();
              if (isProtectedRoute(router.url)) {
                router.navigate(['/login']);
              }
              return throwError(() => refreshErr);
            })
          );
        } else {
          authService.clearTokens();
        }
      }
      return throwError(() => error);
    })
  );
};
