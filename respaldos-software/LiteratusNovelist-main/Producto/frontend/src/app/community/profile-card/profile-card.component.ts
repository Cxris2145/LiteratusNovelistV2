import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';

import { CommunityProfile } from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { copyText } from '../clipboard.util';

/**
 * Tarjeta de perfil de La Taberna: Maguito con su ropa, frase, géneros, estadísticas y
 * "Sobre mí". Con `mine` muestra además tu código de amigo y los accesos para editar.
 * Lo que se proyecte dentro (ng-content) aparece al pie: acciones de la página que la usa.
 */
@Component({
  selector: 'app-profile-card',
  templateUrl: './profile-card.component.html',
  styleUrls: ['../community-shared.css', './profile-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileCardComponent {
  private notification = inject(NotificationService);

  @Input() card: CommunityProfile | null = null;
  @Input() mine = false;
  @Input() compact = false;
  /** Primer lugar del ranking semanal (con puntos). */
  @Input() crowned = false;
  /** El Bazar está abierto (para aria-expanded del botón "Vestir a Maguito"). */
  @Input() dressing = false;
  /** "Vestir a Maguito": la página abre el ropero del Bazar. */
  @Output() dress = new EventEmitter<void>();

  async copyCode(): Promise<void> {
    if (!this.card) return;
    const copied = await copyText('#' + this.card.friend_code);
    if (copied) {
      this.notification.success('Código copiado. Compártelo con quien quieras sentar a tu mesa.', 'Taberna');
    } else {
      this.notification.info(`Tu código es #${this.card.friend_code}.`, 'Taberna');
    }
  }
}
