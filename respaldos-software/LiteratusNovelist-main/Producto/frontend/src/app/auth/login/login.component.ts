import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  errorMsg = '';
  isLoading = false;
  isLoadingAdmin = false;
  returnUrl: string = '/catalog';
  showPassword = false;

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

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

    this.api.post<{ access: string, refresh: string, user: any }>('users/login/', this.loginForm.value)
      .subscribe({
        next: (res) => {
          this.auth.setTokens(res.access, res.refresh);
          if (res.user) {
            this.auth.setUser(res.user);
          }
          this.router.navigateByUrl(this.returnUrl);
        },
        error: (err) => {
          this.errorMsg = 'Credenciales inválidas. Verifica tu usuario o contraseña.';
          this.isLoading = false;
        }
      });
  }

  loginAsAdmin() {
    this.loginForm.patchValue({
      username: 'admin',
      password: 'admin123'
    });

    this.isLoading = true;
    this.isLoadingAdmin = true;
    this.errorMsg = '';

    this.api.post<{ access: string, refresh: string, user: any }>('users/login/', {
      username: 'admin',
      password: 'admin123'
    }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.isLoadingAdmin = false;
        this.auth.setTokens(res.access, res.refresh);
        if (res.user) {
          this.auth.setUser(res.user);
        }
        // Permanece en el catálogo o en la página donde estaba el usuario con acceso total
        const target = (this.returnUrl && !this.returnUrl.includes('dashboard')) ? this.returnUrl : '/catalog';
        this.router.navigateByUrl(target);
      },
      error: (err) => {
        console.error('Error al conectar:', err);
        this.errorMsg = 'No se pudo conectar. Verifica que el backend esté activo.';
        this.isLoading = false;
        this.isLoadingAdmin = false;
      }
    });
  }
}
