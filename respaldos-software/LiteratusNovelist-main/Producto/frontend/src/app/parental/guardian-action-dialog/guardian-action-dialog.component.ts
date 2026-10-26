import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { GuardianAction, ParentalService } from '../../core/services/parental.service';
import { apiErrorMessage, fieldErrors } from '../parental-format';

export interface GuardianActionDialogData {
  action: GuardianAction;
  childId: string;
  childName: string;
  username: string;
  /** false: la cuenta tiene el correo interno, así que sin el tutor no recupera su contraseña. */
  hasOwnEmail: boolean;
}

const COPY: Record<GuardianAction, { icon: string; title: string; button: string; busy: string }> = {
  password: { icon: 'key', title: 'Cambiar su contraseña', button: 'Cambiar contraseña', busy: 'Cambiando…' },
  unlink: { icon: 'link_off', title: 'Desvincular su cuenta', button: 'Desvincular', busy: 'Desvinculando…' },
  delete: { icon: 'delete_forever', title: 'Eliminar su cuenta', button: 'Eliminar para siempre', busy: 'Eliminando…' },
};

/** Cambiar la contraseña del hijo, desvincularlo o borrar su cuenta: todo pide la contraseña del tutor. */
@Component({
  selector: 'app-guardian-action-dialog',
  templateUrl: './guardian-action-dialog.component.html',
  styleUrls: ['../parental-shared.css', '../child-form-dialog/child-form-dialog.component.css',
              './guardian-action-dialog.component.css']
})
export class GuardianActionDialogComponent {
  readonly data = inject<GuardianActionDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<GuardianActionDialogComponent, boolean>>(MatDialogRef);
  private parental = inject(ParentalService);
  private destroyRef = inject(DestroyRef);

  readonly copy = COPY[this.data.action];
  newPassword = '';
  parentPassword = '';
  showPassword = false;
  saving = false;
  error = '';
  errors: Record<string, string> = {};

  get canSubmit(): boolean {
    return !this.saving && !!this.parentPassword && (this.data.action !== 'password' || this.newPassword.length > 0);
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.saving = true;
    this.error = '';
    this.errors = {};
    this.dialogRef.disableClose = true;
    this.parental.act(this.data.childId, this.data.action, this.parentPassword, this.newPassword)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => this.dialogRef.close(true),
        error: err => {
          this.saving = false;
          this.dialogRef.disableClose = false;
          this.errors = fieldErrors(err);
          this.error = Object.keys(this.errors).length ? '' : apiErrorMessage(err, 'No pudimos hacerlo. Inténtalo de nuevo.');
        }
      });
  }
}
