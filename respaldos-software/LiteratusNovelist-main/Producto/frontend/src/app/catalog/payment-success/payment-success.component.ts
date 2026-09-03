import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatService } from '../../core/services/chat.service';

@Component({
  selector: 'app-payment-success',
  templateUrl: './payment-success.component.html',
  styleUrls: ['./payment-success.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentSuccessComponent implements OnInit {
  buyOrder = '';
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chatService = inject(ChatService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.chatService.loadInitialInk();
    this.route.queryParamMap.subscribe(params => {
      this.buyOrder = params.get('buy_order') || '';
      this.cdr.markForCheck();
    });
  }

  goToCatalog(): void { this.router.navigate(['/catalog']); }
  goToLibrary(): void { this.router.navigate(['/library']); }

  trackByIndex(index: number): number {
    return index;
  }
}
