import { Component, DestroyRef, ElementRef, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../../../core/services/auth.service';

export interface DeleteAccountDialogData {
  email: string;
}

/** Confirma con la contraseña el borrado definitivo de la cuenta (ver AuthService.deleteAccount). */
@Component({
  selector: 'app-delete-account-dialog',
  templateUrl: './delete-account-dialog.component.html',
  styleUrls: ['./delete-account-dialog.component.css']
})
export class DeleteAccountDialogComponent {
  @ViewChild('passwordInput') passwordInput?: ElementRef<HTMLInputElement>;
  readonly data = inject<DeleteAccountDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<DeleteAccountDialogComponent>>(MatDialogRef);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  password = '';
  showPassword = false;
  deleting = false;
  error = '';

  confirm(): void {
    if (!this.password || this.deleting) return;
    this.deleting = true;
    this.error = '';
    // Mientras se borra no se cierra con Esc ni tocando fuera.
    this.dialogRef.disableClose = true;
    this.auth.deleteAccount(this.password).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      // logout recarga la app; el botón sigue en "Eliminando…" hasta entonces.
      next: () => this.auth.logout('/login?cuenta=eliminada'),
      error: (err: HttpErrorResponse) => {
        this.deleting = false;
        this.dialogRef.disableClose = false;
        this.error = err.status === 429
          ? 'Hiciste demasiados intentos. Espera un rato y vuelve a probar.'
          : err.error?.error || 'No pudimos eliminar tu cuenta. Inténtalo de nuevo.';
        setTimeout(() => this.passwordInput?.nativeElement.select());
      }
    });
  }
}
