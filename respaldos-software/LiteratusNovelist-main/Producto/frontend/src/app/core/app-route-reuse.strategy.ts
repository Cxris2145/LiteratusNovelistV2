import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

/**
 * Angular reutiliza el componente cuando solo cambia un parámetro de la ruta. El lector
 * guarda muchísimo estado por libro (capítulos, audio, progreso), así que al cambiar de
 * pestaña (/reader/A -> /reader/B) se crea un lector nuevo: el anterior guarda su
 * posición y detiene la narración en ngOnDestroy.
 */
@Injectable()
export class AppRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, current: ActivatedRouteSnapshot): boolean {
    if (future.routeConfig === current.routeConfig && future.routeConfig?.path === 'reader/:id') {
      return future.paramMap.get('id') === current.paramMap.get('id');
    }
    return super.shouldReuseRoute(future, current);
  }
}
