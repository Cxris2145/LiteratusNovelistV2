import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  registerForm: FormGroup;
  errorMsg = '';
  successMsg = '';
  isLoading = false;
  showPassword = false;
  showConfirmPassword = false;

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private router = inject(Router);

  constructor() {
    this.registerForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
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
      username: this.registerForm.value.username,
      email: this.registerForm.value.email,
      password: this.registerForm.value.password
    };

    this.api.post('users/register/', payload).subscribe({
      next: () => {
        this.successMsg = '¡Cuenta creada con éxito! Redirigiendo al login...';
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
      },
      error: (err) => {
        this.isLoading = false;
        // Se extrae el mensaje de error del backend de ser posible
        if (err.error && typeof err.error === 'object') {
          const errors = Object.values(err.error).flat();
          this.errorMsg = errors.join(' ');
        } else {
          this.errorMsg = 'Ha ocurrido un error durante el registro. Inténtalo de nuevo.';
        }
      }
    });
  }
}
