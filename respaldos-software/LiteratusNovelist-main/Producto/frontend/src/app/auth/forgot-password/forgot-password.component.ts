import { Component, DestroyRef, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { passwordResetError } from '../password-reset-error';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['../password-recovery.css']
})
export class ForgotPasswordComponent implements OnDestroy {
  @ViewChild('codeInput') codeInput?: ElementRef<HTMLInputElement>;
  email = '';
  code = '';
  step: 'email' | 'code' = 'email';
  isLoading = false;
  isResending = false;
  message = '';
  error = '';
  resendSeconds = 0;
  private resendAt = 0;
  private countdown?: ReturnType<typeof setInterval>;
  private destroyRef = inject(DestroyRef);

  constructor(private authService: AuthService, private router: Router) {}

  sendCode(): void {
    if (this.isLoading || this.isResending) return;
    this.email = this.email.trim().toLowerCase();
    this.isLoading = true;
    this.error = this.message = '';
    this.authService.requestPasswordReset(this.email).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.isLoading = false;
        this.step = 'code';
        this.message = res.message;
        this.startCountdown(res.resend_after);
        setTimeout(() => this.codeInput?.nativeElement.focus());
      },
      error: err => {
        this.isLoading = false;
        this.error = passwordResetError(err, 'No pudimos solicitar el código. Inténtalo de nuevo.');
      }
    });
  }

  verifyCode(): void {
    if (this.isLoading || this.isResending || !/^[0-9]{6}$/.test(this.code)) return;
    this.isLoading = true;
    this.error = '';
    this.authService.verifyPasswordResetCode(this.email, this.code).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/reset-password']);
      },
      error: err => {
        this.isLoading = false;
        this.error = passwordResetError(err, 'No pudimos verificar el código. Inténtalo de nuevo.');
        setTimeout(() => this.codeInput?.nativeElement.focus());
      }
    });
  }

  resendCode(): void {
    if (this.resendSeconds || this.isLoading || this.isResending) return;
    this.isResending = true;
    this.error = this.message = '';
    this.authService.requestPasswordReset(this.email).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.isResending = false;
        this.code = '';
        this.message = res.message;
        this.startCountdown(res.resend_after);
        setTimeout(() => this.codeInput?.nativeElement.focus());
      },
      error: err => {
        this.isResending = false;
        this.error = passwordResetError(err, 'No pudimos reenviar el código. Inténtalo de nuevo.');
      }
    });
  }

  changeEmail(): void {
    if (this.isLoading || this.isResending) return;
    this.step = 'email';
    this.code = this.error = this.message = '';
    this.authService.clearPasswordRecovery();
  }

  private startCountdown(seconds: number): void {
    clearInterval(this.countdown);
    this.resendAt = Date.now() + seconds * 1000;
    this.resendSeconds = seconds;
    this.countdown = setInterval(() => {
      this.resendSeconds = Math.max(0, Math.ceil((this.resendAt - Date.now()) / 1000));
      if (!this.resendSeconds) clearInterval(this.countdown);
    }, 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.countdown);
  }
}
