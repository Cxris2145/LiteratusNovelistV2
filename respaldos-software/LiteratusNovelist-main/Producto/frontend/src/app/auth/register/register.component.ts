import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { birthDateValidator, todayIsoDate } from '../../core/utils/birth-date.util';

interface RegisterResponse {
  email: string;
  requires_verification: boolean;
  message: string;
}

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  registerForm: FormGroup;
  errorMsg = '';
  successMsg = '';
  /** Correo al que se envió el enlace de activación; con él se oculta el formulario. */
  pendingEmail: string | null = null;
  isResending = false;
  isLoading = false;
  showPassword = false;
  showConfirmPassword = false;
  readonly today = todayIsoDate();

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  constructor() {
    this.registerForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      birth_date: ['', [Validators.required, birthDateValidator]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  // Validador personalizado para asegurar que las contraseñas coinciden
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      // Forzamos el error en el control de confirmPassword
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    return null;
  }

  get f() {
    return this.registerForm.controls;
  }

  onSubmit() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMsg = '';
    this.successMsg = '';

    const payload = {
      username: this.registerForm.value.username.trim(),
      email: this.registerForm.value.email.trim(),
      password: this.registerForm.value.password,
      birth_date: this.registerForm.value.birth_date
    };

    this.api.post<RegisterResponse>('users/register/', payload).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.requires_verification) {
          this.pendingEmail = res.email;
          this.successMsg = `${res.message} Ábrelo para activar tu cuenta y luego inicia sesión.`;
          return;
        }
        this.successMsg = '¡Cuenta creada con éxito! Redirigiendo al login...';
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg = this.describeError(err);
      }
    });
  }

  resendVerification() {
    if (!this.pendingEmail || this.isResending) return;
    this.isResending = true;
    this.auth.resendVerification(this.pendingEmail).subscribe({
      next: (res: any) => {
        this.isResending = false;
        this.successMsg = res.message;
      },
      error: () => {
        this.isResending = false;
        this.errorMsg = 'No pudimos reenviar el enlace. Inténtalo de nuevo en unos minutos.';
      }
    });
  }

  private describeError(err: any): string {
    if (err.status === 0) {
      return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    }
    const body = err.error;
    if (body && typeof body === 'object') {
      if (typeof body.message === 'string') return body.message;
      // Errores por campo de DRF: { username: [...], email: [...], password: [...] }
      const messages = Object.values(body).flat().filter(m => typeof m === 'string');
      if (messages.length) return messages.join(' ');
    }
    return 'Ha ocurrido un error durante el registro. Inténtalo de nuevo.';
  }
}
