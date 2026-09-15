import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

export interface CartItem {
  id: string;
  title: string;
  type: 'ink' | 'book';
  reference: string; // e.g. '200', '500', '1200' o slug del libro
  price: number;
  quantity: number;
  label?: string;
  author_name?: string;
  coverThumb?: string;
  icon?: string;
}

@Component({
  selector: 'app-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.css']
})
export class CartComponent implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);

  cartItems: CartItem[] = [];
  couponCode = '';
  couponApplied = false;
  couponDiscount = 0;

  readonly POPULAR_INK_PACKAGES = [
    {
      reference: '200',
      amount: 200,
      title: '200 Gotas de Tinta',
      price: 990,
      badge: 'Básico',
      description: 'Ideal para dialogar y explorar capítulos con personajes IA.'
    },
    {
      reference: '500',
      amount: 500,
      title: '500 Gotas de Tinta',
      price: 1990,
      badge: 'Más Popular',
      description: 'El paquete preferido para lecturas continuas y debates profundos.'
    },
    {
      reference: '1200',
      amount: 1200,
      title: '1.200 Gotas de Tinta',
      price: 3990,
      badge: 'Mayor Ahorro',
      description: 'Acceso ilimitado a personajes y análisis literarios avanzados.'
    }
  ];

  get subtotal(): number {
    return this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  get discountAmount(): number {
    return this.couponApplied ? Math.round(this.subtotal * this.couponDiscount) : 0;
  }

  get total(): number {
    return Math.max(0, this.subtotal - this.discountAmount);
  }

  get totalItemsCount(): number {
    return this.cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }

  ngOnInit(): void {
    this.loadCart();
  }

  loadCart(): void {
    try {
      const raw = localStorage.getItem('literatus_cart');
      this.cartItems = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(this.cartItems)) this.cartItems = [];
    } catch {
      this.cartItems = [];
    }
    this.syncCartCount();
  }

  saveCart(): void {
    try {
      localStorage.setItem('literatus_cart', JSON.stringify(this.cartItems));
      this.syncCartCount();
      window.dispatchEvent(new Event('literatus-cart-updated'));
    } catch (e) {
      console.warn('Error al guardar carrito', e);
    }
  }

  syncCartCount(): void {
    const count = this.totalItemsCount;
    window.dispatchEvent(new CustomEvent('literatus-cart-updated', { detail: { count } }));
  }

  updateQuantity(item: CartItem, delta: number): void {
    item.quantity += delta;
    if (item.quantity <= 0) {
      this.removeItem(item);
    } else {
      this.saveCart();
    }
  }

  removeItem(item: CartItem): void {
    this.cartItems = this.cartItems.filter(i => i.id !== item.id);
    this.saveCart();
  }

  clearCart(): void {
    if (this.cartItems.length === 0) return;
    if (!confirm('¿Deseas vaciar tu carrito de compras?')) return;
    this.cartItems = [];
    this.saveCart();
  }

  addInkPackage(pkg: typeof this.POPULAR_INK_PACKAGES[0]): void {
    const existing = this.cartItems.find(i => i.type === 'ink' && i.reference === pkg.reference);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.cartItems.push({
        id: 'ink-' + pkg.reference,
        title: pkg.title,
        type: 'ink',
        reference: pkg.reference,
        price: pkg.price,
        quantity: 1,
        label: pkg.badge,
        icon: 'ink_pen'
      });
    }
    this.saveCart();
  }

  applyCoupon(): void {
    if (!this.couponCode.trim()) return;
    const code = this.couponCode.trim().toUpperCase();
    if (code === 'LITERATUS' || code === 'NOVELIST' || code === 'TINTA10') {
      this.couponApplied = true;
      this.couponDiscount = 0.15; // 15% de descuento
    } else {
      alert('Cupón no válido o expirado.');
    }
  }

  proceedToCheckout(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/cart' } });
      return;
    }

    if (this.cartItems.length === 0) return;

    // Si hay un paquete de tinta, redirigimos al checkout oficial de tinta
    const inkItem = this.cartItems.find(i => i.type === 'ink');
    if (inkItem) {
      this.router.navigate(['/checkout', 'ink', inkItem.reference]);
    } else {
      const bookItem = this.cartItems.find(i => i.type === 'book');
      if (bookItem) {
        this.router.navigate(['/checkout', 'book', bookItem.reference || bookItem.id]);
      } else {
        this.router.navigate(['/checkout', 'ink', '500']);
      }
    }
  }

  goToCatalog(): void {
    this.router.navigate(['/catalog']);
  }
}
