import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    return true;
  }
  
  // Si no hay token, lo mandamos al login resguardando la URL a la que quería ir
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
