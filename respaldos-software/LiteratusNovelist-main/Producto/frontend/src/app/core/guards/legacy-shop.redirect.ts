import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * /tavern/tienda era la tienda que mezclaba planes y Bazar. Los enlaces viejos (correos, la
 * vuelta de PayPal, marcadores) siguen funcionando: "?filtro=maguito" abre el ropero de La
 * Taberna y lo demás llega a los planes con sus parámetros (p. ej. ?paypal=return).
 */
export const legacyShopRedirect: CanActivateFn = route => {
  const router = inject(Router);
  if (route.queryParamMap.get('filtro') === 'maguito') {
    return router.createUrlTree(['/tavern'], { queryParams: { bazar: 'ropero' } });
  }
  return router.createUrlTree(['/planes'], { queryParams: route.queryParams, fragment: route.fragment ?? undefined });
};
