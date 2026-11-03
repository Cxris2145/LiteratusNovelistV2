import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';

import { AVATAR_FRAMES } from './frame-catalog';

export { AVATAR_FRAMES } from './frame-catalog';

/**
 * Envuelve un avatar redondo (foto, iniciales o el busto de Maguito) y le dibuja el marco equipado.
 * Un marco desconocido o vacío no dibuja nada, así el avatar conserva su borde de siempre.
 *
 *   <app-avatar-frame [frame]="profile.equipped_frame" size="lg">
 *     <img class="..." ...>
 *   </app-avatar-frame>
 *
 * Tamaños: sm (menú superior) y md (listas) llevan solo el anillo quieto; lg (perfil, Bazar) suma
 * adornos y movimiento. Los marcos de temporada y de colección viven en avatar-frame.bazar.css.
 */
@Component({
  selector: 'app-avatar-frame',
  template: '<ng-content></ng-content><span class="af-ornament" aria-hidden="true"></span><span class="af-fx" aria-hidden="true"></span>',
  styleUrls: ['./avatar-frame.component.css', './avatar-frame.bazar.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarFrameComponent {
  @Input() frame: string | null | undefined = '';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  @HostBinding('attr.data-frame')
  get dataFrame(): string | null {
    return this.frame && AVATAR_FRAMES.includes(this.frame) ? this.frame : null;
  }

  @HostBinding('attr.data-size')
  get dataSize(): string {
    return this.size;
  }
}
