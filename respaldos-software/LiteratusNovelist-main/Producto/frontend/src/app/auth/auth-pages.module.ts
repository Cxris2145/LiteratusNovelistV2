import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../shared/shared.module';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { VerifyEmailComponent } from './verify-email/verify-email.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';

/** Ingreso, registro, bienvenida y recuperación de contraseña: un solo paquete pequeño. */
@NgModule({
  declarations: [LoginComponent, RegisterComponent, OnboardingComponent, VerifyEmailComponent, ForgotPasswordComponent, ResetPasswordComponent],
  imports: [SharedModule],
})
export class AuthPagesModule {}

@NgModule({ imports: [AuthPagesModule, RouterModule.forChild([{ path: '', component: LoginComponent }])] })
export class LoginRouteModule {}

@NgModule({ imports: [AuthPagesModule, RouterModule.forChild([{ path: '', component: RegisterComponent }])] })
export class RegisterRouteModule {}

@NgModule({ imports: [AuthPagesModule, RouterModule.forChild([{ path: '', component: OnboardingComponent }])] })
export class OnboardingRouteModule {}

@NgModule({ imports: [AuthPagesModule, RouterModule.forChild([{ path: '', component: VerifyEmailComponent }])] })
export class VerifyEmailRouteModule {}

@NgModule({ imports: [AuthPagesModule, RouterModule.forChild([{ path: '', component: ForgotPasswordComponent }])] })
export class ForgotPasswordRouteModule {}

@NgModule({ imports: [AuthPagesModule, RouterModule.forChild([{ path: '', component: ResetPasswordComponent }])] })
export class ResetPasswordRouteModule {}
