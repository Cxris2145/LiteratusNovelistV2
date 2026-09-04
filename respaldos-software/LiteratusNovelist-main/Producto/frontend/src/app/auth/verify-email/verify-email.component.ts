import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VerifyEmailComponent implements OnInit {
  isLoading = true;
  successMessage = '';
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      const uid = params['uid'];
      const token = params['token'];

      if (uid && token) {
        this.verify(uid, token);
      } else {
        this.isLoading = false;
        this.errorMessage = 'Enlace de verificación inválido. Faltan parámetros.';
        this.cdr.markForCheck();
      }
    });
  }

  verify(uid: string, token: string) {
    this.authService.verifyEmail(uid, token).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        this.successMessage = res.message || 'Tu cuenta ha sido verificada exitosamente.';
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.errorMessage = err.error?.error || 'El enlace es inválido o ha expirado.';
        this.cdr.markForCheck();
      }
    });
  }
}
