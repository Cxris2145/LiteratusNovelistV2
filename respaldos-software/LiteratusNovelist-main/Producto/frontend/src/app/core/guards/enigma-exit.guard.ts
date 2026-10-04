import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';

export interface CanComponentDeactivate {
  canDeactivate: () => Observable<boolean> | Promise<boolean> | boolean;
}

/**
 * Guard de navegación CanDeactivate para la vista del Enigma Diario.
 * Intercepta los intentos de navegación del router si la partida está en curso.
 */
export const enigmaExitGuard: CanDeactivateFn<CanComponentDeactivate> = (
  component: CanComponentDeactivate
): Observable<boolean> | Promise<boolean> | boolean => {
  return component?.canDeactivate ? component.canDeactivate() : true;
};
