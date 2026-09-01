import { Component } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css']
})
export class ForgotPasswordComponent {
  email = '';
  isLoading = false;
  message = '';
  error = '';

  constructor(private authService: AuthService) {}

  onSubmit() {
    if (!this.email) return;
    
    this.isLoading = true;
    this.message = '';
    this.error = '';

    this.authService.requestPasswordReset(this.email).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        this.message = res.message || 'Se ha enviado un correo con instrucciones.';
      },
      error: (err: any) => {
        this.isLoading = false;
        this.error = err.error?.error || 'Ha ocurrido un error al intentar enviar el correo.';
      }
    });
  }
}
