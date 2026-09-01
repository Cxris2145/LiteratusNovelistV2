import { Component, OnInit, AfterViewInit, OnDestroy, inject, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { LiyumiService } from '../../core/services/liyumi.service';
import { ChatService } from '../../core/services/chat.service';

@Component({
  selector: 'app-book-detail-page',
  templateUrl: './book-detail-page.component.html',
  styleUrls: ['./book-detail-page.component.css']
})
export class BookDetailPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private _avatarCarousel!: ElementRef;
  @ViewChild('avatarCarousel') set avatarCarousel(el: ElementRef) {
    this._avatarCarousel = el;
  }
  get avatarCarousel(): ElementRef {
    return this._avatarCarousel;
  }
  
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);
  private liyumi = inject(LiyumiService);
  private chatService = inject(ChatService);
  public auth = inject(AuthService);

  slug: string | null = null;
  book: any = null;
  isLoading = true;
  errorMsg = '';
  isOwned = false;
  purchaseLoading = false;
  showPurchaseModal = false;
  purchaseErrorMsg = '';
  userInkBalance = 0;
  selectedAvatar: any = null;
  modalTop = 0;

  displayAvatars: any[] = [];
  private autoScrollInterval: any;

  // TTS state
  isTalking = false;
  private ttsUtterance: SpeechSynthesisUtterance | null = null;

  // Review State
  reviewRating = 5;
  reviewComment = '';
  isSubmittingReview = false;
  reviewErrorMsg = '';

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
    this.route.paramMap.subscribe(params => {
      this.slug = params.get('slug');
      if (this.slug) {
        this.loadBookDetails(this.slug);
      }
    });
  }

  ngAfterViewInit(): void {
    this.startAutoScroll();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
    }
    this.stopSynopsis();
    document.body.style.overflow = '';
  }

  startAutoScroll(): void {
    if (this.autoScrollInterval) clearInterval(this.autoScrollInterval);
    
    this.autoScrollInterval = setInterval(() => {
      if (this.avatarCarousel && this.avatarCarousel.nativeElement && !this.selectedAvatar && !this.showPurchaseModal) {
        const carousel = this.avatarCarousel.nativeElement;
        const maxScroll = carousel.scrollWidth - carousel.clientWidth;
        
        if (carousel.scrollLeft >= maxScroll - 50) {
          carousel.style.scrollBehavior = 'auto';
          carousel.scrollLeft = carousel.scrollWidth / 4;
          setTimeout(() => {
             carousel.style.scrollBehavior = 'smooth';
             carousel.scrollLeft += 250;
          }, 50);
        } else {
          carousel.scrollLeft += 250;
        }
      }
    }, 2500);
  }

  loadBookDetails(slug: string): void {
    this.isLoading = true;
    this.api.get<any>(`catalog/books/${slug}/details/`).subscribe({
      next: (data) => {
        this.book = data;
        this.isOwned = data.is_owned;
        this.userInkBalance = data.ink_balance;
        this.chatService.updateInkBalance(this.userInkBalance);
        
        if (data.avatars && data.avatars.length > 0) {
          this.displayAvatars = data.avatars;
        }
        
        this.isLoading = false;

        // Liyumi saluda con el nombre del libro
        setTimeout(() => {
          this.liyumi.speak({
            text: `📖 "${data.title}" — Una historia que no olvidarás. ¡Escucha la sinopsis!`,
            duration: 5000
          });
        }, 800);
      },
      error: (err) => {
        console.error('Error loading book details:', err);
        this.errorMsg = 'No se pudo cargar la información del libro.';
        this.isLoading = false;
      }
    });
  }

  // ── TTS: Escuchar Sinopsis ────────────────────────────────────
  speakSynopsis(): void {
    if (!this.book?.synopsis) return;

    if (this.isTalking) {
      this.stopSynopsis();
      return;
    }

    const text = this.book.synopsis.slice(0, 400);

    if (typeof SpeechSynthesisUtterance !== 'undefined') {
      this.ttsUtterance = new SpeechSynthesisUtterance(text);
      this.ttsUtterance.lang = 'es-ES';
      this.ttsUtterance.rate = 0.95;
      this.ttsUtterance.pitch = 1.1;

      this.ttsUtterance.onstart = () => {
        this.isTalking = true;
        this.liyumi.speak({ text: '🎙️ Leyendo la sinopsis...', duration: 0 });
      };

      this.ttsUtterance.onend = () => {
        this.isTalking = false;
        this.liyumi.speak({ text: '✨ ¿Qué te pareció? ¡Es fascinante!', duration: 3000 });
      };

      this.ttsUtterance.onerror = () => {
        this.isTalking = false;
        this.liyumi.stopSpeaking();
      };

      window.speechSynthesis.speak(this.ttsUtterance);
    } else {
      console.warn("SpeechSynthesisUtterance not available in this WebView");
    }
  }

  stopSynopsis(): void {
    window.speechSynthesis.cancel();
    this.isTalking = false;
    this.liyumi.stopSpeaking();
  }

  handleAction(): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    if (this.isOwned && this.book.inventory_id) {
      this.router.navigate(['/reader', this.book.inventory_id]);
    } else {
      this.router.navigate(['/checkout', 'book', this.slug]);
    }
  }

  getDifficultyLabel(level: string): string {
    const map: any = {
      'beginner': 'Principiante',
      'intermediate': 'Intermedio',
      'advanced': 'Avanzado',
      'master': 'Maestro'
    };
    return map[level?.toLowerCase()] || level;
  }

  cancelPurchase(): void {
    this.showPurchaseModal = false;
    document.body.style.overflow = '';
  }

  confirmPurchase(): void {
    if (this.slug) {
      this.purchaseLoading = true;
      this.api.post<any>(`catalog/books/${this.slug}/purchase/`, {}).subscribe({
        next: (res) => {
          this.isOwned = true;
          this.book.inventory_id = res.inventory_id;
          this.userInkBalance = res.ink_balance;
          this.chatService.updateInkBalance(this.userInkBalance);
          this.purchaseLoading = false;
          this.showPurchaseModal = false;
          document.body.style.overflow = '';
          // Liyumi celebra la compra
          this.liyumi.wave('¡Excelente elección! 🎉 Tu libro está listo. ¡A leer!');
        },
        error: (err) => {
          console.error('Error purchasing book:', err);
          alert(err.error?.error || 'Hubo un error al procesar la compra.');
          this.purchaseLoading = false;
        }
      });
    }
  }

  selectAvatar(avatar: any): void {
    this.selectedAvatar = avatar;
    this.modalTop = window.scrollY || document.documentElement.scrollTop;
    document.body.style.overflow = 'hidden';
  }

  closeAvatarModal(): void {
    this.selectedAvatar = null;
    document.body.style.overflow = '';
  }

  downloadPDF(): void {
    if (this.book.inventory_id) {
      const endpoint = `library/inventory/${this.book.inventory_id}/download/`;
      this.api.getBlob(endpoint).subscribe({
        next: (blob: Blob) => {
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `${this.book.slug}.pdf`;
          link.click();
          window.URL.revokeObjectURL(downloadUrl);
        },
        error: (err) => {
          console.error('Error downloading PDF:', err);
          alert('No se pudo descargar el archivo. Es posible que esta edición no tenga un PDF adjunto.');
        }
      });
    }
  }

  getAvgRating(reviews: any[]): number {
    if (!reviews || reviews.length === 0) return 0;
    const sum = reviews.reduce((acc: number, r: any) => acc + (r.rating || 0), 0);
    return Math.round(sum / reviews.length);
  }

  scrollCarousel(direction: number): void {
    if (this.avatarCarousel) {
      const carousel = this.avatarCarousel.nativeElement;
      const scrollAmount = 300;
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      
      if (direction === 1 && carousel.scrollLeft >= maxScroll - 50) {
        carousel.scrollTo({ left: carousel.scrollWidth / 4, behavior: 'auto' });
        setTimeout(() => carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' }), 50);
      } else if (direction === -1 && carousel.scrollLeft <= 50) {
        carousel.scrollTo({ left: (carousel.scrollWidth / 4) * 3, behavior: 'auto' });
        setTimeout(() => carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' }), 50);
      } else {
        carousel.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
      }
    }
  }

  setRating(rating: number): void {
    this.reviewRating = rating;
  }

  submitReview(): void {
    if (!this.slug || this.isSubmittingReview) return;
    
    this.isSubmittingReview = true;
    this.reviewErrorMsg = '';

    const payload = {
      rating: this.reviewRating,
      comment: this.reviewComment
    };

    this.api.post<any>(`catalog/books/${this.slug}/add_review/`, payload).subscribe({
      next: (res) => {
        this.isSubmittingReview = false;
        if (!this.book.reviews) this.book.reviews = [];
        this.book.reviews.unshift(res.review);
        this.reviewComment = '';
        this.reviewRating = 5;
        this.liyumi.wave('¡Gracias por tu reseña! A la comunidad le encantará.');
      },
      error: (err) => {
        this.isSubmittingReview = false;
        this.reviewErrorMsg = err.error?.error || 'No se pudo publicar la reseña.';
        console.error('Error submitting review:', err);
      }
    });
  }
}
