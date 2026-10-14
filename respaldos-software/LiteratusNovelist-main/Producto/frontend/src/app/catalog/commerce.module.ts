import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../shared/shared.module';
import { authGuard } from '../core/guards/auth.guard';
import { CartComponent } from './cart/cart.component';
import { CheckoutComponent } from './checkout/checkout.component';
import { PaymentSuccessComponent } from './payment-success/payment-success.component';
import { PaymentFailureComponent } from './payment-failure/payment-failure.component';
import { MembershipComponent } from '../membership/membership.component';
import { InkwellComponent } from '../membership/inkwell/inkwell.component';

/** Carrito, pago y planes: se descargan al abrir cualquiera de esas páginas. */
@NgModule({
  declarations: [CartComponent, CheckoutComponent, PaymentSuccessComponent, PaymentFailureComponent, MembershipComponent, InkwellComponent],
  imports: [SharedModule],
  exports: [CartComponent, CheckoutComponent, PaymentSuccessComponent, PaymentFailureComponent, MembershipComponent],
})
export class CommerceModule {}

@NgModule({ imports: [CommerceModule, RouterModule.forChild([{ path: '', component: CartComponent }])] })
export class CartRouteModule {}

@NgModule({
  imports: [CommerceModule, RouterModule.forChild([
    { path: ':type/:reference', component: CheckoutComponent, canActivate: [authGuard] },
  ])],
})
export class CheckoutRouteModule {}

@NgModule({
  imports: [CommerceModule, RouterModule.forChild([
    { path: 'success', component: PaymentSuccessComponent },
    { path: 'failure', component: PaymentFailureComponent },
  ])],
})
export class PaymentRouteModule {}

@NgModule({ imports: [CommerceModule, RouterModule.forChild([{ path: '', component: MembershipComponent }])] })
export class PlanesRouteModule {}
