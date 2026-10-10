import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatService } from '../../core/services/chat.service';
import { userStorageKey } from '../../core/services/auth.service';

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
    // Limpiar carrito de compras tras compra exitosa
    try {
      localStorage.removeItem(userStorageKey('literatus_cart'));
      window.dispatchEvent(new CustomEvent('literatus-cart-updated', { detail: { count: 0 } }));
    } catch {}
  }

  goToCatalog(): void { this.router.navigate(['/catalog']); }
  goToLibrary(): void { this.router.navigate(['/library']); }
}
