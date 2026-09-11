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
  isAdminLoading = false;
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

    this.api.post<{access: string, refresh: string, user: any}>('users/login/', this.loginForm.value)
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
    this.isLoading = true;
    this.isAdminLoading = true;
    this.errorMsg = '';

    this.api.post<{access: string, refresh: string, user: any}>('users/login/', {
      username: 'admin',
      password: 'admin'
    }).subscribe({
      next: (res) => {
        this.auth.setTokens(res.access, res.refresh);
        if (res.user) {
          this.auth.setUser(res.user);
        }
        // Entrar a la aplicación (catálogo o URL previa no administrativa), NO al panel de administración
        const target = (this.returnUrl && !this.returnUrl.startsWith('/dashboard') && this.returnUrl !== '/login') 
          ? this.returnUrl 
          : '/catalog';
        this.router.navigateByUrl(target);
      },
      error: (err) => {
        console.error('Error al iniciar sesión como administrador:', err);
        this.errorMsg = 'No se pudo conectar con las credenciales de administrador.';
        this.isLoading = false;
        this.isAdminLoading = false;
      }
    });
  }
}
