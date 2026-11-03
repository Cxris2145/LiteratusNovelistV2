import { Pipe, PipeTransform } from '@angular/core';
import { ChatService } from '../services/chat.service';

/**
 * Saldo de Tinta de quien mira la página: ∞ si su cuenta tiene Tinta infinita, si no el valor tal cual
 * (va después de `number` u otro formato). No sirve para el saldo de otra persona (panel, control parental).
 * Impuro porque la bandera llega con el perfil después de pintar; solo lee un booleano.
 */
@Pipe({ name: 'ownInk', standalone: true, pure: false })
export class OwnInkPipe implements PipeTransform {
  constructor(private chat: ChatService) {}

  transform<T>(value: T): T | string {
    return this.chat.hasInfiniteInk ? '∞' : value;
  }
}
