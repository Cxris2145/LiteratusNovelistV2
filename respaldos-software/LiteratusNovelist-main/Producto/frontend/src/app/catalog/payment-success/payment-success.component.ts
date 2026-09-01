import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatService } from '../../core/services/chat.service';

@Component({
  selector: 'app-payment-success',
  templateUrl: './payment-success.component.html',
  styleUrls: ['./payment-success.component.css']
})
export class PaymentSuccessComponent implements OnInit {
  buyOrder = '';
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chatService = inject(ChatService);

  ngOnInit(): void {
    this.chatService.loadInitialInk();
    this.route.queryParamMap.subscribe(params => {
      this.buyOrder = params.get('buy_order') || '';
    });
  }

  goToCatalog(): void { this.router.navigate(['/catalog']); }
  goToLibrary(): void { this.router.navigate(['/library']); }
}
