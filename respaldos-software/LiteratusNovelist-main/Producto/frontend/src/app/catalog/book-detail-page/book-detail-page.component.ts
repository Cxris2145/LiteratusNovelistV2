import { Component, OnInit, AfterViewInit, OnDestroy, inject, ViewChild, ElementRef, ChangeDetectorRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { LiyumiService } from '../../core/services/liyumi.service';
import { ChatService } from '../../core/services/chat.service';
import { NotificationService } from '../../core/services/notification.service';

/** Resumen del libro completo con IA (GET/POST catalog/books/<slug>/summary/). */
interface BookSummaryContent {
  overview: string;
  plot: string[];
  characters: { name: string; role: string }[];
  themes: string[];
}

interface BookSummaryResponse {
  status: 'ready' | 'generating' | 'missing' | 'unavailable';
  summary?: BookSummaryContent;
  message?: string;
}

const SUMMARY_POLL_MS = 4000;
const SUMMARY_POLL_LIMIT_MS = 5 * 60 * 1000;

@Component({
  selector: 'app-book-detail-page',
  templateUrl: './book-detail-page.component.html',
  styleUrls: ['./book-detail-page.component.css']
})
export class BookDetailPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private _avatarCarousel!: ElementRef;
  @ViewChild('avatarCarousel') set avatarCarousel(el: ElementRef) {
    this._avatarCarousel = el;
    setTimeout(() => this.updateAvatarOverflow(), 0);
  }
  get avatarCarousel(): ElementRef {
    return this._avatarCarousel;
  }

  /** True cuando el carrusel de personajes tiene más contenido del que cabe:
   *  sólo entonces mostramos las flechas de navegación. */
  avatarsCanScroll = false;
  
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);
  private liyumi = inject(LiyumiService);
  private chatService = inject(ChatService);
  private notificationService = inject(NotificationService);
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

  // Resumen completo (incluye el final: se muestra solo si el lector lo abre)
  summaryState: 'idle' | 'loading' | 'generating' | 'unavailable' = 'idle';
  summary: BookSummaryContent | null = null;
  summaryMessage = '';
  showSummary = false;
  private summaryPoll: ReturnType<typeof setTimeout> | null = null;
  private summaryPollDeadline = 0;

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
    this.stopSummaryPoll();
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
    this.resetSummary();
    this.loadSummary(slug);
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

  // ── Resumen completo con IA ───────────────────────────────────
  get summaryButtonLabel(): string {
    if (this.summaryState === 'loading') return 'Abriendo…';
    if (this.summaryState === 'generating') return 'Generando resumen…';
    return this.summary ? 'Mostrar resumen' : 'Generar resumen con IA';
  }

  /** Al abrir la ficha solo se consulta si ya existe; nunca se genera sin que el lector lo pida. */
  private loadSummary(slug: string): void {
    this.api.get<BookSummaryResponse>(`catalog/books/${slug}/summary/`).subscribe({
      next: (res) => {
        if (res.status === 'ready' && res.summary && slug === this.slug) this.summary = res.summary;
      },
      error: () => {} // libro restringido u otro error: el botón lo explicará al usarlo
    });
  }

  openSummary(): void {
    if (this.summary) {
      this.showSummary = true;
      return;
    }
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (!this.slug || this.summaryState === 'loading' || this.summaryState === 'generating') return;
    this.summaryState = 'loading';
    this.summaryMessage = '';
    const slug = this.slug;
    this.api.post<BookSummaryResponse>(`catalog/books/${slug}/summary/`, {}).subscribe({
      next: (res) => {
        this.summaryPollDeadline = Date.now() + SUMMARY_POLL_LIMIT_MS;
        this.handleSummary(slug, res);
      },
      error: (err) => this.summaryFailed(err.error?.message || err.error?.error)
    });
  }

  private handleSummary(slug: string, res: BookSummaryResponse): void {
    if (slug !== this.slug) return; // el lector ya pasó a otro libro
    if (res.status === 'ready' && res.summary) {
      this.summary = res.summary;
      this.summaryState = 'idle';
      this.showSummary = true;
    } else if (res.status === 'generating') {
      this.summaryState = 'generating';
      if (Date.now() > this.summaryPollDeadline) {
        this.summaryFailed('El resumen está tardando más de lo normal. Vuelve a intentarlo en unos minutos.');
        return;
      }
      this.summaryPoll = setTimeout(() => {
        this.api.get<BookSummaryResponse>(`catalog/books/${slug}/summary/`).subscribe({
          next: (next) => this.handleSummary(slug, next),
          error: (err) => this.summaryFailed(err.error?.message)
        });
      }, SUMMARY_POLL_MS);
    } else {
      this.summaryFailed(res.message);
    }
  }

  private summaryFailed(message?: string): void {
    this.stopSummaryPoll();
    this.summaryState = 'unavailable';
    this.summaryMessage = message || 'No se pudo generar el resumen. Intenta de nuevo en unos minutos.';
  }

  private stopSummaryPoll(): void {
    if (this.summaryPoll) clearTimeout(this.summaryPoll);
    this.summaryPoll = null;
  }

  private resetSummary(): void {
    this.stopSummaryPoll();
    this.summary = null;
    this.summaryState = 'idle';
    this.summaryMessage = '';
    this.showSummary = false;
  }

handleAction(): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    if (this.book?.is_age_restricted && !this.isOwned) {
      const user = this.auth.currentUser();
      const birthDate = user?.profile?.birth_date || user?.birth_date;
      
      if (!birthDate) {
        this.notificationService.error(
          `Para acceder a este contenido restringido (+${this.book.min_age}), debes registrar tu fecha de nacimiento en tu perfil.`,
          'Falta Fecha de Nacimiento'
        );
      } else {
        this.notificationService.error(
          `Tu edad actual no te permite acceder a este contenido. Está restringido para mayores de ${this.book.min_age} años.`,
          'Contenido Restringido'
        );
      }
      return;
    }

    if (this.isOwned && this.book?.inventory_id) {
      this.router.navigate(['/reader', this.book.inventory_id]);
    } else {
      this.confirmPurchase();
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
    if (!this.slug || this.purchaseLoading) return;
    this.purchaseLoading = true;
    this.purchaseErrorMsg = '';

    this.api.post<any>(`catalog/books/${this.slug}/purchase/`, {}).subscribe({
      next: (res) => {
        this.isOwned = true;
        if (this.book) {
          this.book.is_owned = true;
          this.book.inventory_id = res.inventory_id;
        }
        if (res.ink_balance !== undefined) {
          this.userInkBalance = res.ink_balance;
          this.chatService.updateInkBalance(this.userInkBalance);
        }
        this.purchaseLoading = false;
        this.showPurchaseModal = false;
        document.body.style.overflow = '';
        this.notificationService.success(`«${this.book?.title || 'Obra'}» agregada a tu biblioteca.`, '¡Adquisición Exitosa!');
        // Liyumi celebra la adquisición
        this.liyumi.wave('¡Excelente elección! 🎉 Tu obra ha sido agregada a Mi Biblioteca. ¡A leer!');
      },
      error: (err) => {
        console.error('Error purchasing book:', err);
        this.purchaseErrorMsg = err.error?.message || err.error?.error || 'Hubo un error al procesar la adquisición.';
        this.purchaseLoading = false;
        this.notificationService.error(this.purchaseErrorMsg, 'Error de Adquisición');
      }
    });
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
          this.notificationService.warning('No se pudo descargar el archivo. Es posible que esta edición no cuente con un PDF adjunto.', 'Descarga no disponible');
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
    const carousel = this.avatarCarousel?.nativeElement as HTMLElement | undefined;
    if (!carousel) return;
    const card = carousel.firstElementChild as HTMLElement | null;
    const step = card ? card.clientWidth + 24 : 160; // ancho tarjeta + gap
    carousel.scrollBy({ left: step * 2 * direction, behavior: 'smooth' });
  }

  @HostListener('window:resize')
  updateAvatarOverflow(): void {
    const el = this.avatarCarousel?.nativeElement as HTMLElement | undefined;
    this.avatarsCanScroll = !!el && el.scrollWidth - el.clientWidth > 8;
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
