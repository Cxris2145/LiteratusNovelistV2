import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  errorMsg = '';
  isLoading = false;
  returnUrl: string = '/catalog';
  showPassword = false;

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
  }

  ngOnInit() {
    // Get return url from route parameters or default to '/catalog'
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/catalog';
  }

  onSubmit() {
    if (this.loginForm.invalid) return;

    this.isLoading = true;
    this.errorMsg = '';
    const identifier = this.loginForm.value.username.trim();
    const password = this.loginForm.value.password;

    this.auth.login(identifier, password)
      .subscribe({
        next: (res) => {
          this.auth.setTokens(res.access, res.refresh);
          if (res.user) {
            this.auth.setUser(res.user);
          }
          this.router.navigateByUrl(this.returnUrl);
        },
        error: (err) => {
          this.errorMsg = this.resolveLoginError(err);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private resolveLoginError(err: any): string {
    const detail = err?.error?.detail || err?.error?.error || err?.error?.message;

    if (detail && typeof detail === 'string') {
      return detail;
    }

    const usernameErr = err?.error?.username;
    if (usernameErr) {
      return Array.isArray(usernameErr) ? usernameErr[0] : usernameErr;
    }

    const passwordErr = err?.error?.password;
    if (passwordErr) {
      return Array.isArray(passwordErr) ? passwordErr[0] : passwordErr;
    }

    if (err?.status === 0) {
      return 'No se pudo conectar con el servidor. Verifica tu conexión.';
    }

    return 'Correo o contraseña incorrectos.';
  }
}
