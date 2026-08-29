import { Component, OnInit, AfterViewInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ChatService } from '../../core/services/chat.service';

@Component({
  selector: 'app-tavern',
  templateUrl: './tavern.component.html',
  styleUrls: ['./tavern.component.css']
})
export class TavernComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);
  private chatService = inject(ChatService);

  inkBalance: number = 0;
  displayBalance: number = 0;

  adLoading: boolean = false;
  adTimer: number = 0;

  chests = [
    { title: 'Cofre de Aprendiz', amount: 500, price: '$2.000', icon: 'package', color: '#00ccff' },
    { title: 'Cofre de Erudito', amount: 1500, price: '$5.000', icon: 'landmark', color: '#8b5cf6' },
    { title: 'Cofre de Maestro', amount: 5000, price: '$14.990', icon: 'crown', color: '#ffd700' }
  ];

  private router = inject(Router);

  ngOnInit(): void {
    if (this.isLoggedIn()) {
      this.fetchBalance();
    }
  }

  ngAfterViewInit(): void {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } }),
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('access_token');
  }

  fetchBalance(): void {
    this.api.get<any>('users/profile/').subscribe({
      next: (res) => {
        this.inkBalance = res.ink_balance;
        this.chatService.updateInkBalance(this.inkBalance);
        this.animateOdometer();
      },
      error: () => {
        console.warn('Usuario no autenticado o error al obtener balance');
      }
    });
  }

  animateOdometer(): void {
    const start = this.displayBalance;
    const end = this.inkBalance;
    const duration = 1000;
    const startTime = performance.now();

    const update = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (easeOutExpo)
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

      this.displayBalance = Math.floor(start + (end - start) * ease);

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    requestAnimationFrame(update);
  }

  watchAd(): void {
    if (!this.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    if (this.adLoading) return;

    this.adLoading = true;
    this.adTimer = 5;

    const interval = setInterval(() => {
      this.adTimer--;
      if (this.adTimer <= 0) {
        clearInterval(interval);
        this.claimAdReward();
      }
    }, 1000);
  }

  claimAdReward(): void {
    this.api.post<any>('users/me/add_ink/', { amount: 10 }).subscribe({
      next: (res) => {
        this.inkBalance = res.ink_balance;
        this.chatService.updateInkBalance(this.inkBalance);
        this.animateOdometer();
        this.adLoading = false;
      },
      error: () => {
        this.adLoading = false;
      }
    });
  }

  buyChest(chest: any): void {
    if (!this.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    alert(`Redirigiendo a pasarela de pago para el ${chest.title}...`);
  }
}
