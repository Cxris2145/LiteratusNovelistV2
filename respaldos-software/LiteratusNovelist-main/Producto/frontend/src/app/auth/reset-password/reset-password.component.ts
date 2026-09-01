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
      }
    });
  }

  onSubmit() {
    if (this.isInvalidLink || !this.newPassword || !this.confirmPassword) return;

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }
    
    this.isLoading = true;
    this.message = '';
    this.error = '';

    this.authService.confirmPasswordReset(this.uid, this.token, this.newPassword).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        this.message = res.message || 'Contraseña actualizada con éxito.';
      },
      error: (err: any) => {
        this.isLoading = false;
        this.error = err.error?.error || 'Ha ocurrido un error al actualizar la contraseña.';
      }
    });
  }
}
