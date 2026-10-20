import { HttpInterceptorFn, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { ProfileRequestService } from '../services/profile-request.service';
import { environment } from '../../../environments/environment';
import { catchError, switchMap, tap, throwError } from 'rxjs';
import { Router } from '@angular/router';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isApi = req.url.startsWith(environment.apiUrl);
  if (!isApi) return next(req);

  const authService = inject(AuthService);
  const router = inject(Router);
  const notificationService = inject(NotificationService);
  const profiles = inject(ProfileRequestService);
  const sessionRevision = profiles.sessionRevision;
  const isProfile = req.method === 'GET'
    && req.url.split('?')[0] === `${environment.apiUrl}users/profile/`;
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

  // Una lectura invalidada vuelve a tomar el token actual al reiniciarse.
  const send = () => {
    const token = authService.getAccessToken();
    const authReq = token ? req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`),
    }) : req;

    return next(authReq).pipe(
      catchError((error: unknown) => {
        if (sessionRevision !== profiles.sessionRevision) return throwError(() => error);

        if (error instanceof HttpErrorResponse && error.status === 403 && error.error?.error === 'AGE_RESTRICTED') {
          notificationService.error(error.error.message || 'Contenido restringido por edad. Completa tu perfil.', 'Restricción de Edad');
          router.navigate(['/profile']);
          return throwError(() => error);
        }

        if (!(error instanceof HttpErrorResponse) || error.status !== 401
          || req.url.includes('/users/login/') || req.url.includes('/login/')) {
          return throwError(() => error);
        }

        if (localStorage.getItem('refresh_token')) {
          return authService.refreshAccessToken(token).pipe(
            switchMap(newAccessToken => next(req.clone({
              headers: req.headers.set('Authorization', `Bearer ${newAccessToken}`),
            })).pipe(catchError(retryError => {
              if (retryError instanceof HttpErrorResponse && retryError.status === 401
                && sessionRevision === profiles.sessionRevision) authService.logout();
              return throwError(() => retryError);
            }))),
          );
        }

        if (token) authService.logout();
        else {
          authService.clearTokens();
          router.navigate(['/login']);
        }
        return throwError(() => error);
      }),
      tap(event => {
        if (isMutation && event instanceof HttpResponse && sessionRevision === profiles.sessionRevision) {
          profiles.invalidate();
        }
      }),
    );
  };

  // Incluye HttpClient directo (tema, tinta y gamificación) y ApiService.
  return isProfile ? profiles.share(req.urlWithParams, send) : send();
};
