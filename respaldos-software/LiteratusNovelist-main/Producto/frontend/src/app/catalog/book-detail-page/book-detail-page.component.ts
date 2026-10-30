import { Component, OnInit, AfterViewInit, OnDestroy, inject, ViewChild, ElementRef, ChangeDetectorRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { AuthService } from '../../core/services/auth.service';
import { LiyumiService } from '../../core/services/liyumi.service';
import { ChatService } from '../../core/services/chat.service';
import { NotificationService } from '../../core/services/notification.service';

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
  private characterChat = inject(CharacterChatService);

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
  readonly maxReviewLength = 500;
  readonly minReviewLength = 3;
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

  /** Conversar con el personaje en la ventana rápida, sin abrir el libro. */
  chatWithAvatar(avatar: any): void {
    if (!avatar?.id) return;
    this.closeAvatarModal();
    this.characterChat.open(avatar.id);
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

  private static readonly PROFANE_WORDS = new Set<string>([
    'puto', 'putos', 'puta', 'putas', 'putazo', 'putear', 'puteria',
    'hijodeputa', 'hijosdeputa', 'hijadeputa', 'hdp',
    'mierda', 'mierdas', 'mierdero',
    'carajo', 'carajos',
    'cabron', 'cabrona', 'cabrones', 'cabronas',
    'pendejo', 'pendeja', 'pendejos', 'pendejas', 'pendejada', 'pendejadas',
    'imbecil', 'imbeciles', 'idiota', 'idiotas',
    'estupido', 'estupida', 'estupidos', 'estupidas',
    'tarado', 'tarada', 'tarados', 'taradas',
    'mongolico', 'mongolica', 'subnormal', 'subnormales',
    'marica', 'maricas', 'maricon', 'maricones', 'maricona', 'mariconada',
    'joder', 'jodido', 'jodida', 'jodidos', 'jodidas', 'jodete',
    'coño', 'coños', 'gilipollas', 'capullo', 'polla', 'pollas', 'soplapollas',
    'verga', 'vergas', 'vergazo',
    'chinga', 'chingar', 'chingado', 'chingada', 'chingados', 'chingadas',
    'chingatumadre', 'pinche', 'pinches',
    'culero', 'culera', 'culeros', 'culeras',
    'mamaguevo', 'mamahuevo', 'malparido', 'malparida', 'malparidos', 'malparidas',
    'gonorrea', 'pirobo', 'carechimba',
    'culo', 'culos',
    'culiao', 'culia', 'culiaos', 'culias', 'culiado', 'culiada', 'culiados', 'culiadas',
    'qlo', 'qlia', 'qliao', 'ctm',
    'conchetumare', 'conchatumadre', 'conchetumadre', 'conchesumadre',
    'chuchetumare', 'chuchatumadre',
    'weon', 'weona', 'weones', 'weonas',
    'hueon', 'hueona', 'hueones', 'hueonas',
    'aweonao', 'aweona', 'aweonaos', 'ahuevao',
    'wea', 'weas', 'huevada', 'huevadas', 'webada', 'webadas',
    'chucha', 'chuchas', 'maraco', 'maraca', 'maracos', 'maracas',
    'pichula', 'pichulas', 'chupapico', 'tula',
    'zorra', 'zorras', 'prostituta', 'prostitutas', 'ramera', 'rameras',
    'pelotudo', 'pelotuda', 'pelotudos', 'pelotudas',
    'boludo', 'boluda', 'boludos', 'boludas',
    'conchudo', 'conchuda', 'conchudos', 'conchudas',
    'pija', 'pijas', 'poronga', 'porongas',
    'ojete', 'pajero', 'pajera', 'pajeros', 'pajeras',
    'mamon', 'mamona', 'mamones', 'mamonas',
    'chupapija', 'chupaverga', 'chupapolla', 'lameculos',
    'cagar', 'cagada', 'cagado', 'cagadas', 'cagados', 'cagon', 'cagona',
    'fuck', 'fucker', 'fuckers', 'fucking', 'fucked', 'motherfucker', 'motherfucking',
    'shit', 'shitty', 'bullshit',
    'bitch', 'bitches',
    'asshole', 'assholes', 'bastard', 'bastards',
    'dickhead', 'cock', 'cunt', 'whore', 'slut',
    'nigger', 'nigga', 'faggot', 'retard', 'retarded'
  ]);

  private static readonly PROFANE_PHRASES = [
    'hijo de puta',
    'hija de puta',
    'hijos de puta',
    'la concha de tu madre',
    'la concha de su madre',
    'concha tu madre',
    'concha de tu madre',
    'vete a la mierda',
    'andate a la mierda',
    'andate a la chucha',
    'vete a la chucha',
    'chupa el pico',
    'chupame el pico',
    'chupame la pija',
    'chupame la verga'
  ];

  get isRegisteredUser(): boolean {
    return this.auth.isLoggedIn() && !this.auth.isGuest();
  }

  get hasUserReviewed(): boolean {
    const username = this.auth.currentUser()?.username;
    if (!username || !this.book?.reviews) return false;
    return this.book.reviews.some((r: any) => r.username === username);
  }

  setRating(rating: number): void {
    this.reviewRating = rating;
  }

  onReviewCommentInput(): void {
    if (this.reviewComment.length > this.maxReviewLength) {
      this.reviewComment = this.reviewComment.slice(0, this.maxReviewLength);
    }
    if (this.reviewErrorMsg) {
      this.reviewErrorMsg = '';
    }
  }

  containsProfanity(text: string): boolean {
    if (!text || !text.trim()) return false;

    const placeholder = '\u0000';
    const noAccents = text
      .toLowerCase()
      .replace(/ñ/g, placeholder)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFC')
      .replace(new RegExp(placeholder, 'g'), 'ñ');

    const leetMap: Record<string, string> = {
      '0': 'o', '1': 'i', '3': 'e', '4': 'a', '@': 'a', '$': 's', '5': 's', '7': 't', '!': 'i'
    };
    const cleanedLeet = noAccents.replace(/[0134@$57!]/g, ch => leetMap[ch] || ch);

    const normalizedSpaces = cleanedLeet.replace(/[^a-zñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const phrase of BookDetailPageComponent.PROFANE_PHRASES) {
      const regex = new RegExp(`\\b${phrase}\\b`, 'i');
      if (regex.test(normalizedSpaces)) return true;
    }

    const compactPunct = cleanedLeet.replace(/([a-zñ])[._*\-~]+(?=[a-zñ])/g, '$1');
    const tokens = [
      ...(cleanedLeet.match(/[a-zñ]+/g) || []),
      ...(compactPunct.match(/[a-zñ]+/g) || [])
    ];

    for (const token of tokens) {
      if (token.length < 3) continue;
      const collapsedAll = token.replace(/(.)\1+/g, '$1');
      const collapsedDigraphSafe = token.replace(/([^rlceos])\1+/g, '$1').replace(/(.)\1{2,}/g, '$1$1');
      if (
        BookDetailPageComponent.PROFANE_WORDS.has(token) ||
        BookDetailPageComponent.PROFANE_WORDS.has(collapsedAll) ||
        BookDetailPageComponent.PROFANE_WORDS.has(collapsedDigraphSafe)
      ) {
        return true;
      }
    }

    return false;
  }

  submitReview(): void {
    if (!this.slug || this.isSubmittingReview) return;

    if (!this.isRegisteredUser) {
      this.reviewErrorMsg = 'Solo los lectores registrados pueden publicar reseñas.';
      return;
    }

    const trimmedComment = this.reviewComment.trim();

    if (trimmedComment.length < this.minReviewLength) {
      this.reviewErrorMsg = `Por favor escribe una reseña de al menos ${this.minReviewLength} caracteres.`;
      return;
    }

    if (trimmedComment.length > this.maxReviewLength) {
      this.reviewErrorMsg = `La reseña no puede superar los ${this.maxReviewLength} caracteres.`;
      return;
    }

    if (this.containsProfanity(trimmedComment)) {
      this.reviewErrorMsg = 'Tu reseña contiene lenguaje inapropiado u obsceno. Por favor, mantén un tono respetuoso para la comunidad.';
      return;
    }

    this.isSubmittingReview = true;
    this.reviewErrorMsg = '';

    const payload = {
      rating: this.reviewRating,
      comment: trimmedComment
    };

    this.api.post<any>(`catalog/books/${this.slug}/add_review/`, payload).subscribe({
      next: (res) => {
        this.isSubmittingReview = false;
        if (!this.book.reviews) this.book.reviews = [];
        this.book.reviews.unshift(res.review);
        this.reviewComment = '';
        this.reviewRating = 5;
        this.notificationService.success('Tu opinión ya está disponible en la sección de reseñas.', '¡Reseña publicada!');
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
