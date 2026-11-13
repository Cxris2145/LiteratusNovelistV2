import { Pipe, PipeTransform } from '@angular/core';
import { formatClp, ClpFormatOptions } from '../utils/currency.util';

/**
 * Pipe de Angular para formatear montos y precios en Pesos Chilenos (CLP).
 *
 * Ejemplos en plantilla:
 *   {{ 1990 | clp }}               => "$1.990 CLP"
 *   {{ 1990 | clp:false }}         => "$1.990"
 *   {{ 1990 | clp:{ showCode: false } }} => "$1.990"
 *   {{ 3.98 | clp:2 }}             => "$3,98 CLP"
 */
@Pipe({
  name: 'clp',
  standalone: true,
})
export class ClpPipe implements PipeTransform {
  transform(
    value: number | string | null | undefined,
    arg?: boolean | number | ClpFormatOptions
  ): string {
    return formatClp(value, arg);
  }
}

