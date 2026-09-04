import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ForgotPasswordComponent {
  email = '';
  isLoading = false;
  message = '';
  error = '';

  constructor(private authService: AuthService, private cdr: ChangeDetectorRef) {}

  onSubmit() {
    const email = this.email.trim().toLowerCase();
    if (!email) return;

    this.isLoading = true;
    this.message = '';
    this.error = '';

    this.authService.requestPasswordReset(email).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        this.message = res.message || 'Si existe una cuenta asociada a ese correo, recibirás instrucciones.';
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.error = err.error?.email?.[0] || err.error?.error || 'Ingresa un correo electrónico válido.';
        this.cdr.markForCheck();
      }
    });
  }
}
