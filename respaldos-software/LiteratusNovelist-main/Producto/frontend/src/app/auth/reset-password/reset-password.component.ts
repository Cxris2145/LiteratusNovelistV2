import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.css']
})
export class ResetPasswordComponent implements OnInit {
  uid = '';
  token = '';
  newPassword = '';
  confirmPassword = '';
  
  isLoading = false;
  isValidating = false;
  message = '';
  error = '';
  isInvalidLink = false;

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.uid = params['uid'];
      this.token = params['token'];

      if (!this.uid || !this.token) {
        this.isInvalidLink = true;
        this.error = 'El enlace de recuperación es inválido o está incompleto.';
        return;
      }

      this.isValidating = true;
      this.authService.validatePasswordReset(this.uid, this.token).subscribe({
        next: () => {
          this.isValidating = false;
          this.isInvalidLink = false;
          this.error = '';
        },
        error: (err: any) => {
          this.isValidating = false;
          this.isInvalidLink = true;
          this.error = err.error?.token?.[0] || err.error?.non_field_errors?.[0] || 'El enlace de recuperación no es válido o ha expirado.';
        }
      });
    });
  }

  onSubmit() {
    if (this.isInvalidLink || !this.newPassword || !this.confirmPassword) return;

    if (this.newPassword.length < 8) {
      this.error = 'La nueva contraseña debe tener al menos 8 caracteres.';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }
    
    this.isLoading = true;
    this.message = '';
    this.error = '';

    this.authService.confirmPasswordReset(this.uid, this.token, this.newPassword, this.confirmPassword).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        this.message = res.message || 'Contraseña actualizada con éxito.';
      },
      error: (err: any) => {
        this.isLoading = false;
        this.error =
          err.error?.token?.[0] ||
          err.error?.new_password?.[0] ||
          err.error?.confirm_password?.[0] ||
          err.error?.non_field_errors?.[0] ||
          'Ha ocurrido un error al actualizar la contraseña.';
      }
    });
  }
}
