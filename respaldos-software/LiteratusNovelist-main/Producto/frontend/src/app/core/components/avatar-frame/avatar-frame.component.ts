import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';

/** Marcos que sabe dibujar (Profile.equipped_frame / ShopItem.value). */
export const AVATAR_FRAMES = [
  'frame-gold', 'frame-victorian', 'frame-maestro',
  'frame-parchment', 'frame-inkblue', 'frame-autumn', 'frame-constellation',
  'frame-laurel', 'frame-eternal-flame', 'frame-library', 'frame-owl', 'frame-summit', 'frame-tavern',
] as const;

/**
 * Envuelve un avatar redondo (foto, iniciales o el busto de Maguito) y le dibuja el marco equipado.
 * Un marco desconocido o vacío no dibuja nada, así el avatar conserva su borde de siempre.
 *
 *   <app-avatar-frame [frame]="profile.equipped_frame" size="lg">
 *     <img class="..." ...>
 *   </app-avatar-frame>
 *
 * Tamaños: sm (menú superior, solo el anillo), md (listas), lg (perfil, con adornos y movimiento).
 */
@Component({
  selector: 'app-avatar-frame',
  template: '<ng-content></ng-content><span class="af-ornament" aria-hidden="true"></span>',
  styleUrls: ['./avatar-frame.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarFrameComponent {
  @Input() frame: string | null | undefined = '';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  @HostBinding('attr.data-frame')
  get dataFrame(): string | null {
    return this.frame && (AVATAR_FRAMES as readonly string[]).includes(this.frame) ? this.frame : null;
  }

  @HostBinding('attr.data-size')
  get dataSize(): string {
    return this.size;
  }
}
