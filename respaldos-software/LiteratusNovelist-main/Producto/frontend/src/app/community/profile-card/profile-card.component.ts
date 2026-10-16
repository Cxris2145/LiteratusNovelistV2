import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';

import { userStorageKey } from '../../core/services/auth.service';
import { CommunityProfile } from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { copyText } from '../clipboard.util';

const MORE_KEY = 'literatus_tavern_profile_more';

/**
 * Tarjeta de perfil de La Taberna: Maguito con su ropa, frase, géneros, estadísticas y
 * "Sobre mí". Con `mine` muestra además tu código de amigo y los accesos para editar.
 * En la sala (`compact`) "Sobre mí", la privacidad y el código se despliegan con "Más sobre mí",
 * para que la tarjeta quepa en pantalla; el estado se recuerda por cuenta.
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

  moreOpen = readMore();

  toggleMore(): void {
    this.moreOpen = !this.moreOpen;
    try { localStorage.setItem(userStorageKey(MORE_KEY), this.moreOpen ? '1' : '0'); } catch { /* sin almacenamiento */ }
  }

  @Input() card: CommunityProfile | null = null;
  @Input() mine = false;
  @Input() compact = false;
  /** Primer lugar del ranking semanal (con puntos). */
  @Input() crowned = false;
  /** El Bazar está abierto (para aria-expanded del botón "Vestir a Maguito"). */
  @Input() dressing = false;
  /** "Vestir a Maguito": la página abre el ropero del Bazar. */
  @Output() dress = new EventEmitter<void>();
  /** Se guarda el cambio de perfil público/privado (deshabilita el interruptor). */
  @Input() savingPrivacy = false;
  /** El interruptor de perfil público: la página lo guarda. */
  @Output() privacyChange = new EventEmitter<boolean>();

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

function readMore(): boolean {
  try { return localStorage.getItem(userStorageKey(MORE_KEY)) === '1'; } catch { return false; }
}
