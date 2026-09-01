import { HttpInterceptorFn, HttpErrorResponse, HttpBackend, HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';
import { catchError, switchMap, throwError } from 'rxjs';
import { Router } from '@angular/router';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const httpBackend = inject(HttpBackend);
  const token = authService.getAccessToken();

  let authReq = req;
  if (token) {
    authReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });
  }

  return next(authReq).pipe(
    catchError((error: any) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
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
              router.navigate(['/login']);
              return throwError(() => refreshErr);
            })
          );
        } else {
          authService.clearTokens();
          router.navigate(['/login']);
        }
      }
      return throwError(() => error);
    })
  );
};
