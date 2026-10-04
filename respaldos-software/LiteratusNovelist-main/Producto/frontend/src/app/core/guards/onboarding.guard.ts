import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const onboardingGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  const user = authService.currentUser();
  // Si el usuario ya completó el onboarding, redirigirlo a home
  if (user && user.has_completed_onboarding) {
    return router.createUrlTree(['/home']);
  }

  return true;
};
