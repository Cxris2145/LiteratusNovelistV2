import { Component, HostListener, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UserVocabularyCard, VocabularyService } from '../../core/services/vocabulary.service';

@Component({
  selector: 'app-flashcards',
  templateUrl: './flashcards.component.html',
  styleUrls: ['./flashcards.component.css']
})
export class FlashcardsComponent implements OnInit {
  private vocabularyService = inject(VocabularyService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  cards: UserVocabularyCard[] = [];
  currentIndex = 0;
  isFlipped = false;
  isLoading = true;
  isToggling = false;
  errorMsg = '';

  // Filtros
  selectedBookId = '';
  filterMode: 'unlearned' | 'all' | 'learned' = 'unlearned';
  uniqueBooks: { id: string; title: string }[] = [];

  // Métricas
  totalCount = 0;
  learnedCount = 0;
  unlearnedCount = 0;

  // Estado de reproducción de voz
  isSpeaking = false;

  get currentCard(): UserVocabularyCard | null {
    if (!this.cards || this.cards.length === 0) return null;
    return this.cards[this.currentIndex] || null;
  }

  get progressPercentage(): number {
    if (this.cards.length === 0) return 0;
    return Math.round(((this.currentIndex + 1) / this.cards.length) * 100);
  }

  get masteryPercentage(): number {
    if (this.totalCount === 0) return 0;
    return Math.round((this.learnedCount / this.totalCount) * 100);
  }

  ngOnInit(): void {
    // Si viene con book_id en query params, usarlo
    this.route.queryParams.subscribe(params => {
      if (params['book_id']) {
        this.selectedBookId = params['book_id'];
      }
      this.loadCards();
    });
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    // Evitar capturar teclas si el usuario está en un input
    const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (event.code === 'Space' || event.key === ' ' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.flipCard();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.nextCard();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prevCard();
    } else if (event.key === 'l' || event.key === 'L') {
      if (this.currentCard) {
        this.toggleLearnedStatus();
      }
    }
  }

  loadCards(): void {
    this.isLoading = true;
    this.errorMsg = '';

    // Cargar todo el vocabulario del usuario para estadísticas y libros
    this.vocabularyService.getVocabulary().subscribe({
      next: (allWords) => {
        this.totalCount = allWords.length;
        this.learnedCount = allWords.filter(w => w.is_learned).length;
        this.unlearnedCount = allWords.filter(w => !w.is_learned).length;

        // Extraer libros únicos
        const bookMap = new Map<string, string>();
        for (const item of allWords) {
          if (item.book_id && item.book_title) {
            bookMap.set(item.book_id, item.book_title);
          }
        }
        this.uniqueBooks = Array.from(bookMap.entries()).map(([id, title]) => ({ id, title }));

        // Cargar tarjetas según filtro actual
        this.applyFilter(allWords);
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg = err?.error?.message || 'No se pudieron cargar las tarjetas de vocabulario.';
      }
    });
  }

  private applyFilter(sourceWords?: UserVocabularyCard[]): void {
    let list = sourceWords ? [...sourceWords] : [...this.cards];

    if (this.selectedBookId) {
      list = list.filter(c => c.book_id === this.selectedBookId);
    }

    if (this.filterMode === 'unlearned') {
      list = list.filter(c => !c.is_learned);
    } else if (this.filterMode === 'learned') {
      list = list.filter(c => c.is_learned);
    }

    this.cards = list;
    this.currentIndex = 0;
    this.isFlipped = false;
  }

  onFilterChange(mode: 'unlearned' | 'all' | 'learned'): void {
    this.filterMode = mode;
    this.loadCards();
  }

  onBookChange(bookId: string): void {
    this.selectedBookId = bookId;
    this.loadCards();
  }

  flipCard(): void {
    if (!this.currentCard) return;
    this.isFlipped = !this.isFlipped;
  }

  nextCard(): void {
    if (this.currentIndex < this.cards.length - 1) {
      this.currentIndex++;
      this.isFlipped = false;
    }
  }

  prevCard(): void {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.isFlipped = false;
    }
  }

  shuffleCards(): void {
    if (this.cards.length <= 1) return;
    const shuffled = [...this.cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    this.cards = shuffled;
    this.currentIndex = 0;
    this.isFlipped = false;
  }

  toggleLearnedStatus(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    const card = this.currentCard;
    if (!card || this.isToggling) return;

    this.isToggling = true;
    const newStatus = !card.is_learned;

    this.vocabularyService.toggleLearned(card.id, newStatus).subscribe({
      next: (updated) => {
        card.is_learned = updated.is_learned;
        if (updated.is_learned) {
          this.learnedCount++;
          this.unlearnedCount = Math.max(0, this.unlearnedCount - 1);
        } else {
          this.learnedCount = Math.max(0, this.learnedCount - 1);
          this.unlearnedCount++;
        }
        this.isToggling = false;
      },
      error: () => {
        this.isToggling = false;
      }
    });
  }

  deleteCurrentCard(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    const card = this.currentCard;
    if (!card) return;

    if (!confirm(`¿Eliminar «${card.word}» de tus tarjetas de vocabulario?`)) return;

    this.vocabularyService.deleteWord(card.id).subscribe({
      next: () => {
        this.cards = this.cards.filter(c => c.id !== card.id);
        this.totalCount = Math.max(0, this.totalCount - 1);
        if (card.is_learned) {
          this.learnedCount = Math.max(0, this.learnedCount - 1);
        } else {
          this.unlearnedCount = Math.max(0, this.unlearnedCount - 1);
        }
        if (this.currentIndex >= this.cards.length && this.currentIndex > 0) {
          this.currentIndex--;
        }
        this.isFlipped = false;
      }
    });
  }

  speakWord(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    const card = this.currentCard;
    if (!card || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(card.word);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9;

    this.isSpeaking = true;
    utterance.onend = () => {
      this.isSpeaking = false;
    };
    utterance.onerror = () => {
      this.isSpeaking = false;
    };

    window.speechSynthesis.speak(utterance);
  }

  goToLibrary(): void {
    this.router.navigate(['/library']);
  }
}
