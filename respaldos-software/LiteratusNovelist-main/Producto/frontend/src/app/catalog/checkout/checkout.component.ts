import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.css']
})
export class CheckoutComponent implements OnInit {
  itemType = '';
  itemReference = '';
  isLoading = false;
  errorMsg = '';
  
  // Datos a mostrar en el resumen
  bookInfo: any = null;
  inkPackage: any = null;
  
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.itemType = params.get('type') || '';
      this.itemReference = params.get('reference') || '';
      
      if (this.itemType === 'book') {
        this.loadBookInfo();
      } else if (this.itemType === 'ink') {
        this.inkPackage = null;
        this.api.get<any[]>('finance/ink-packages/').subscribe({ next: packages => {
          const pack = packages.find(value => String(value.amount) === this.itemReference);
          if (!pack) { this.errorMsg = 'Paquete de Tinta no válido.'; return; }
          this.inkPackage = { ...pack, label: `${pack.amount.toLocaleString('es-CL')} Tinta`,
            price: `$${Number(pack.price).toLocaleString('es-CL')}` };
        }, error: () => this.errorMsg = 'No se pudo consultar el precio del cofre.' });
      } else {
        this.errorMsg = 'Tipo de compra no reconocido.';
      }
    });
  }

  loadBookInfo(): void {
    this.api.get<any>(`catalog/books/${this.itemReference}/`).subscribe({
      next: (data) => { this.bookInfo = data; },
      error: () => { this.errorMsg = 'No se pudo cargar la información del libro.'; }
    });
  }

  confirmPurchase(): void {
    if (this.isLoading || (this.itemType === 'ink' && !this.inkPackage)) return;
    this.isLoading = true;
    this.errorMsg = '';
    
    this.api.post<any>('finance/pay/', {
      item_type: this.itemType,
      item_reference: this.itemReference,
      return_base_url: window.location.origin
    }).subscribe({
      next: (data) => {
        // Si es una compra gratuita, redirigir directamente al éxito
        if (data.status === 'FREE_PURCHASE_SUCCESS') {
          this.router.navigate(['/payment/success'], { 
            queryParams: { buy_order: data.buy_order } 
          });
          return;
        }

        // Construir formulario POST y redirigir a Webpay
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.url;

        const tokenInput = document.createElement('input');
        tokenInput.type = 'hidden';
        tokenInput.name = 'token_ws';
        tokenInput.value = data.token;

        form.appendChild(tokenInput);
        document.body.appendChild(form);
        form.submit();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg = err.error?.error || 'Error al iniciar el pago. Intenta nuevamente.';
      }
    });
  }

  cancel(): void {
    window.history.back();
  }
}
