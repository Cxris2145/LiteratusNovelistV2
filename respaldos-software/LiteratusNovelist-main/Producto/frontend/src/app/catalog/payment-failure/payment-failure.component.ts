import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-payment-failure',
  templateUrl: './payment-failure.component.html',
  styleUrls: ['./payment-failure.component.css']
})
export class PaymentFailureComponent implements OnInit {
  reason = '';
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.reason = params.get('reason') || 'El pago fue cancelado o rechazado.';
    });
  }

  tryAgain(): void { window.history.back(); }
  goToCatalog(): void { this.router.navigate(['/catalog']); }
}
