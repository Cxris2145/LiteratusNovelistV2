import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-payment-failure',
  templateUrl: './payment-failure.component.html',
  styleUrls: ['./payment-failure.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentFailureComponent implements OnInit {
  reason = '';
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.route.queryParamMap.pipe(take(1)).subscribe(params => {
      this.reason = params.get('reason') || 'El pago fue cancelado o rechazado.';
      this.cdr.markForCheck();
    });
  }

  tryAgain(): void { window.history.back(); }
  goToCatalog(): void { this.router.navigate(['/catalog']); }

  trackByIndex(index: number): number {
    return index;
  }
}
