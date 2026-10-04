import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    const user = authService.currentUser();
    // Si el usuario no ha completado el onboarding y no está ya en la ruta /onboarding, redirigir
    if (user && user.has_completed_onboarding === false && !state.url.startsWith('/onboarding')) {
      return router.createUrlTree(['/onboarding']);
    }
    return true;
  }
  
  // Si no hay token, lo mandamos al login resguardando la URL a la que quería ir
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
