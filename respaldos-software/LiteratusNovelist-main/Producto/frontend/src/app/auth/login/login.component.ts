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
  infoMsg = '';
  /** La cuenta existe y la contraseña es correcta, pero falta abrir el enlace del correo. */
  needsVerification = false;
  isResending = false;
  isLoading = false;
  isGuestLoading = false;
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
    // Llega aquí desde "Eliminar cuenta" en el perfil (ver AuthService.deleteAccount).
    if (this.route.snapshot.queryParams['cuenta'] === 'eliminada') {
      this.infoMsg = 'Tu cuenta y sus datos se borraron para siempre. Gracias por leer con nosotros.';
    }
    // Llega aquí cuando la cuenta de prueba se cerró o el servidor ya la borró (ver AuthService.logout).
    if (this.route.snapshot.queryParams['prueba'] === 'terminada') {
      this.infoMsg = 'Tu sesión de prueba terminó y sus datos se borraron. Puedes abrir otra cuando quieras.';
    }
  }

  onSubmit() {
    if (this.loginForm.invalid) return;

    this.isLoading = true;
    this.errorMsg = '';
    this.infoMsg = '';
    this.needsVerification = false;

    const credentials = {
      username: this.loginForm.value.username.trim(),
      password: this.loginForm.value.password
    };
    this.api.post<{access: string, refresh: string, user: any}>('users/login/', credentials)
      .subscribe({
        next: (res) => this.enter(res, this.returnUrl),
        error: (err) => {
          if (err.error?.code === 'account_not_verified') {
            this.needsVerification = true;
            this.errorMsg = err.error.detail;
          } else if (err.status === 0) {
            this.errorMsg = 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
          } else {
            this.errorMsg = 'Credenciales inválidas. Verifica tu usuario o contraseña.';
          }
          this.isLoading = false;
        }
      });
  }

  resendVerification() {
    const identifier = this.loginForm.value.username?.trim();
    if (!identifier || this.isResending) return;
    this.isResending = true;
    this.auth.resendVerification(identifier).subscribe({
      next: (res: any) => {
        this.isResending = false;
        this.infoMsg = res.message;
      },
      error: () => {
        this.isResending = false;
        this.infoMsg = 'No pudimos reenviar el enlace. Inténtalo de nuevo en unos minutos.';
      }
    });
  }

  /** Abre la sesión. Si en esta pestaña había otra cuenta, recarga para no heredar sus datos en memoria. */
  private enter(res: {access: string, refresh: string, user: any}, target: string) {
    const switchedAccount = this.auth.startSession(res.access, res.refresh, res.user);
    const destination = res.user?.has_completed_onboarding === false ? '/onboarding' : target;
    if (switchedAccount) {
      window.location.assign(destination);
    } else {
      this.router.navigateByUrl(destination);
    }
  }

  /**
   * "Probar sin cuenta": cada clic crea una cuenta de prueba nueva (lector, sin permisos de
   * administración) que el servidor borra al cerrar la página o después de una hora.
   */
  loginAsGuest() {
    this.isLoading = true;
    this.isGuestLoading = true;
    this.errorMsg = '';
    this.infoMsg = '';

    this.api.post<{access: string, refresh: string, user: any}>('users/guest/', {}).subscribe({
      next: (res) => {
        const target = (this.returnUrl && !this.returnUrl.startsWith('/dashboard') && this.returnUrl !== '/login')
          ? this.returnUrl
          : '/catalog';
        this.enter(res, target);
      },
      error: (err) => {
        this.errorMsg = err.status === 429
          ? 'Se abrieron muchas cuentas de prueba desde esta red. Espera unos minutos e inténtalo de nuevo.'
          : err.error?.detail || 'No pudimos abrir la cuenta de prueba. Inténtalo de nuevo.';
        this.isLoading = false;
        this.isGuestLoading = false;
      }
    });
  }
}
