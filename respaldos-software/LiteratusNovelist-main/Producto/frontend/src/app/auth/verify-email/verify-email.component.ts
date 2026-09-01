import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.css']
})
export class VerifyEmailComponent implements OnInit {
  isLoading = true;
  successMessage = '';
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const uid = params['uid'];
      const token = params['token'];

      if (uid && token) {
        this.verify(uid, token);
      } else {
        this.isLoading = false;
        this.errorMessage = 'Enlace de verificación inválido. Faltan parámetros.';
      }
    });
  }

  verify(uid: string, token: string) {
    this.authService.verifyEmail(uid, token).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        this.successMessage = res.message || 'Tu cuenta ha sido verificada exitosamente.';
      },
      error: (err: any) => {
        this.isLoading = false;
        this.errorMessage = err.error?.error || 'El enlace es inválido o ha expirado.';
      }
    });
  }
}
