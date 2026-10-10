import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AchievementsService } from '../services/achievements.service';

/** Consulta los nuevos logros después de guardar una acción, con frecuencia limitada. */
export const achievementInterceptor: HttpInterceptorFn = (req, next) => {
  const achievements = inject(AchievementsService);
  const isActivity = req.url.startsWith(environment.apiUrl)
    && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    && !/achievements\/me|users\/(login|register)|community\/presence/.test(req.url);
  return next(req).pipe(tap(event => {
    if (isActivity && req.headers.has('Authorization') && event instanceof HttpResponse) {
      achievements.scheduleCheck();
    }
  }));
};
