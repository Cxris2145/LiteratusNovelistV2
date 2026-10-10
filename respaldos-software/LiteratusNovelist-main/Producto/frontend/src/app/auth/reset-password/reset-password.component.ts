import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService, PasswordRecoverySession } from '../../core/services/auth.service';
import { passwordResetError } from '../password-reset-error';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['../password-recovery.css']
})
export class ResetPasswordComponent implements OnInit {
  session: PasswordRecoverySession | null = null;
  newPassword = '';
  confirmPassword = '';
  showPassword = false;
  isLoading = false;
  message = '';
  error = '';
  private destroyRef = inject(DestroyRef);

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.session = this.authService.getPasswordRecovery();
  }

  onSubmit(): void {
    if (this.isLoading || !this.session) return;
    this.error = '';
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }
    if (!this.authService.getPasswordRecovery()) {
      this.session = null;
      this.error = 'La verificación ha caducado. Solicita un código nuevo.';
      return;
    }
    this.isLoading = true;
    this.authService.confirmPasswordReset(this.session.email, this.session.token, this.newPassword, this.confirmPassword)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: res => {
          this.isLoading = false;
          this.message = res.message;
          this.newPassword = this.confirmPassword = '';
          this.authService.clearPasswordRecovery();
        },
        error: err => {
          this.isLoading = false;
          this.error = passwordResetError(err, 'No pudimos cambiar la contraseña. Inténtalo de nuevo.');
          if (err.error?.code === 'RESET_INVALID') {
            this.session = null;
            this.authService.clearPasswordRecovery();
          }
        }
      });
  }
}
