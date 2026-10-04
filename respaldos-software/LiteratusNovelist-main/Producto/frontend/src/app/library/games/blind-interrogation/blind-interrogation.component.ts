import { Component, OnInit, OnDestroy, HostListener, inject, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ChatService } from '../../../core/services/chat.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Observable, Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { CanComponentDeactivate } from '../../../core/guards/enigma-exit.guard';

export interface InterrogationSuspect {
  id: string;
  name: string;
  book_title: string;
  book_id?: number | string | null;
  author_name: string;
  image: string;
  is_discarded: boolean;
  is_in_library?: boolean;
}

export interface InterrogationMessage {
  role: 'user' | 'character' | 'clue';
  content: string;
}

export interface InterrogationSessionData {
  id: string;
  status: 'playing' | 'won' | 'lost' | 'abandoned';
  questions_allowed: number;
  questions_used: number;
  questions_left: number;
  extra_questions_bought: number;
  clues_bought: number;
  discarded_avatar_ids: string[];
  dialogue_history: InterrogationMessage[];
  suspects: InterrogationSuspect[];
  is_secret_in_library?: boolean;
  owned_suspects_count?: number;
  catalog_suspects_count?: number;
  ink_earned: number;
  xp_earned: number;
  is_official_daily: boolean;
  secret_avatar?: {
    id: string;
    name: string;
    book_title: string;
    book_id?: number | string | null;
    author_name: string;
    image: string;
    description: string;
    is_in_library?: boolean;
  };
}

@Component({
  selector: 'app-blind-interrogation',
  templateUrl: './blind-interrogation.component.html',
  styleUrls: ['./blind-interrogation.component.css']
})
export class BlindInterrogationComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  @ViewChild('chatScrollContainer') chatScrollContainer?: ElementRef<HTMLDivElement>;

  private api = inject(ApiService);
  private chatService = inject(ChatService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  session: InterrogationSessionData | null = null;
  isLoading = true;
  isSendingQuestion = false;
  isBuyingPerk = false;
  isSubmittingGuess = false;

  currentQuestion = '';
  selectedSuspectId: string | null = null;
  showGuessModal = false;
  showRulesModal = false;

  userInkBalance = 0;
  dailyCompleted = false;

  // Intercepción y advertencia de abandono
  showExitModal = false;
  isAbandoning = false;
  private hasConfirmedExit = false;
  private exitSubject?: Subject<boolean>;

  ngOnInit(): void {
    this.fetchUserBalance();
    this.initGame();
  }

  ngOnDestroy(): void {}

  fetchUserBalance(): void {
    this.api.get<any>('users/profile/').subscribe({
      next: (res) => {
        if (res && res.ink_balance !== undefined) {
          this.userInkBalance = res.ink_balance;
          this.chatService.updateInkBalance(this.userInkBalance);
        }
      },
      error: () => {}
    });
  }

  initGame(): void {
    this.isLoading = true;
    this.api.get<any>('ai/games/interrogation/status/').subscribe({
      next: (res) => {
        if (res) {
          this.userInkBalance = res.user_ink || this.userInkBalance;
          this.dailyCompleted = !!res.daily_completed;

          if (res.has_active_session && res.active_session) {
            this.session = res.active_session;
            this.isLoading = false;
            this.scrollToBottom();
          } else {
            // Iniciar nueva partida automáticamente
            this.startNewGame();
          }
        } else {
          this.startNewGame();
        }
      },
      error: () => {
        this.startNewGame();
      }
    });
  }

  startNewGame(): void {
    this.isLoading = true;
    this.api.post<InterrogationSessionData>('ai/games/interrogation/start/', {}).subscribe({
      next: (data) => {
        this.session = data;
        this.isLoading = false;
        this.showGuessModal = false;
        this.selectedSuspectId = null;
        this.scrollToBottom();
      },
      error: (err) => {
        this.isLoading = false;
        this.notificationService.error(
          err?.error?.error || 'No se pudo iniciar el interrogatorio. Inténtalo más tarde.',
          'Error al iniciar'
        );
      }
    });
  }

  sendQuestion(): void {
    if (!this.session || this.session.status !== 'playing') return;
    const text = this.currentQuestion.trim();
    if (!text || this.isSendingQuestion) return;

    if (this.session.questions_left <= 0) {
      this.notificationService.warning(
        'Has agotado tus preguntas base. Adquiere una pregunta extra con 3 Gotas de Tinta o adivina la identidad.',
        'Preguntas agotadas'
      );
      return;
    }

    this.isSendingQuestion = true;
    this.currentQuestion = '';

    // Añadir mensaje del usuario inmediatamente al feed visual
    this.session.dialogue_history.push({ role: 'user', content: text });
    this.scrollToBottom();

    this.api.post<any>('ai/games/interrogation/ask/', {
      session_id: this.session.id,
      question: text
    }).pipe(
      finalize(() => {
        this.isSendingQuestion = false;
      })
    ).subscribe({
      next: (res) => {
        if (this.session) {
          this.session.questions_used = res.questions_used;
          this.session.questions_allowed = res.questions_allowed;
          this.session.questions_left = res.questions_left;
          this.session.dialogue_history.push({ role: 'character', content: res.reply });
          this.scrollToBottom();
        }
      },
      error: (err) => {
        this.notificationService.error(
          err?.error?.message || 'Hubo un error al transmitir tu pregunta a la sombra.',
          'Voz inaudible'
        );
      }
    });
  }

  // --- PERKS DE TINTA ---

  buyExtraQuestion(): void {
    if (!this.session || this.session.status !== 'playing' || this.isBuyingPerk) return;
    if (this.userInkBalance < 3) {
      this.notificationService.warning('Necesitas 3 Gotas de Tinta para obtener una pregunta extra.', 'Tinta insuficiente');
      return;
    }
    if (this.session.extra_questions_bought >= 2) {
      this.notificationService.info('Has alcanzado el límite máximo de preguntas adicionales (2).', 'Límite alcanzado');
      return;
    }

    this.isBuyingPerk = true;
    this.api.post<any>('ai/games/interrogation/buy-perk/', {
      session_id: this.session.id,
      perk: 'extra_question'
    }).pipe(
      finalize(() => {
        this.isBuyingPerk = false;
      })
    ).subscribe({
      next: (res) => {
        this.session = res.session;
        this.userInkBalance = res.new_ink_balance;
        this.chatService.updateInkBalance(this.userInkBalance);
        this.notificationService.info('+1 Pregunta extra añadida a tu interrogatorio (-3 Tinta).', 'Pluma Recargada');
      },
      error: (err) => {
        this.notificationService.error(err?.error?.message || 'No se pudo adquirir la pregunta extra.', 'Error');
      }
    });
  }

  buyClue(): void {
    if (!this.session || this.session.status !== 'playing' || this.isBuyingPerk) return;
    if (this.userInkBalance < 5) {
      this.notificationService.warning('Necesitas 5 Gotas de Tinta para solicitar una confidencia del tintero.', 'Tinta insuficiente');
      return;
    }
    if (this.session.clues_bought >= 1) {
      this.notificationService.info('Ya has solicitado la pista íntima para este interrogatorio.', 'Pista ya obtenida');
      return;
    }

    this.isBuyingPerk = true;
    this.api.post<any>('ai/games/interrogation/buy-perk/', {
      session_id: this.session.id,
      perk: 'clue'
    }).pipe(
      finalize(() => {
        this.isBuyingPerk = false;
      })
    ).subscribe({
      next: (res) => {
        this.session = res.session;
        this.userInkBalance = res.new_ink_balance;
        this.chatService.updateInkBalance(this.userInkBalance);
        this.notificationService.info('La sombra ha susurrado una confidencia íntima (-5 Tinta).', 'Pista Revelada');
        this.scrollToBottom();
      },
      error: (err) => {
        this.notificationService.error(err?.error?.message || 'No se pudo obtener la pista.', 'Error');
      }
    });
  }

  buyDiscardTwo(): void {
    if (!this.session || this.session.status !== 'playing' || this.isBuyingPerk) return;
    if (this.userInkBalance < 4) {
      this.notificationService.warning('Necesitas 4 Gotas de Tinta para descartar 2 sospechosos.', 'Tinta insuficiente');
      return;
    }
    if (this.session.discarded_avatar_ids && this.session.discarded_avatar_ids.length > 0) {
      this.notificationService.info('Ya has utilizado el descarte 50/50 en esta sesión.', 'Ventaja ya usada');
      return;
    }

    this.isBuyingPerk = true;
    this.api.post<any>('ai/games/interrogation/buy-perk/', {
      session_id: this.session.id,
      perk: 'discard_two'
    }).pipe(
      finalize(() => {
        this.isBuyingPerk = false;
      })
    ).subscribe({
      next: (res) => {
        this.session = res.session;
        this.userInkBalance = res.new_ink_balance;
        this.chatService.updateInkBalance(this.userInkBalance);
        this.notificationService.info('Dos sospechosos inocentes han sido descartados (-4 Tinta).', 'Deducción 50/50');
      },
      error: (err) => {
        this.notificationService.error(err?.error?.message || 'No se pudo realizar el descarte.', 'Error');
      }
    });
  }

  // --- ADIVINAR / VEREDICTO ---

  openGuessModal(): void {
    this.showGuessModal = true;
  }

  closeGuessModal(): void {
    this.showGuessModal = false;
  }

  selectSuspect(id: string): void {
    if (!this.session) return;
    const suspect = this.session.suspects.find(s => s.id === id);
    if (suspect && suspect.is_discarded) return;
    this.selectedSuspectId = id;
  }

  selectSuspectAndOpenGuess(id: string): void {
    if (!this.session) return;
    const suspect = this.session.suspects.find(s => s.id === id);
    if (suspect && suspect.is_discarded) return;
    this.selectedSuspectId = id;
    this.openGuessModal();
  }

  submitGuess(): void {
    if (!this.session || !this.selectedSuspectId || this.isSubmittingGuess) return;

    this.isSubmittingGuess = true;
    this.api.post<any>('ai/games/interrogation/guess/', {
      session_id: this.session.id,
      avatar_id: this.selectedSuspectId
    }).pipe(
      finalize(() => {
        this.isSubmittingGuess = false;
      })
    ).subscribe({
      next: (res) => {
        this.session = res.session;
        this.userInkBalance = res.new_ink_balance;
        this.chatService.updateInkBalance(this.userInkBalance);
        this.showGuessModal = false;

        if (res.won) {
          this.notificationService.gamify(
            'ink',
            res.ink_earned,
            `¡Deducción magistral! Descubriste a «${res.session.secret_avatar.name}». +${res.ink_earned} Gotas y +${res.xp_earned} XP.`,
            'Identidad Revelada'
          );
        } else {
          this.notificationService.warning(
            `No era el personaje correcto. La sombra era «${res.session.secret_avatar.name}» de «${res.session.secret_avatar.book_title}». (+${res.xp_earned} XP).`,
            'Caso No Resuelto'
          );
        }
      },
      error: (err) => {
        this.notificationService.error(err?.error?.message || 'Error al validar veredicto.', 'Error');
      }
    });
  }

  // --- REGLAS & MODAL ---

  openRules(): void {
    this.showRulesModal = true;
  }

  closeRules(): void {
    this.showRulesModal = false;
  }

  // --- CAN DEACTIVATE & INTERCEPCIÓN DE SALIDA ---

  canDeactivate(): Observable<boolean> | boolean {
    if (!this.session || this.session.status !== 'playing' || this.hasConfirmedExit) {
      return true;
    }
    this.showExitModal = true;
    this.exitSubject = new Subject<boolean>();
    return this.exitSubject.asObservable();
  }

  cancelExit(): void {
    this.showExitModal = false;
    if (this.exitSubject) {
      this.exitSubject.next(false);
      this.exitSubject.complete();
      this.exitSubject = undefined;
    }
  }

  confirmExitAndPenalize(): void {
    if (this.isAbandoning || !this.session) return;
    this.isAbandoning = true;

    this.api.post<any>('ai/games/interrogation/abandon/', {
      session_id: this.session.id
    }).pipe(
      finalize(() => {
        this.isAbandoning = false;
      })
    ).subscribe({
      next: () => {
        this.hasConfirmedExit = true;
        this.showExitModal = false;
        this.notificationService.warning(
          'Has abandonado el interrogatorio a ciegas. La sesión se registró con 0 puntos.',
          'Partida Abandonada'
        );
        if (this.exitSubject) {
          this.exitSubject.next(true);
          this.exitSubject.complete();
          this.exitSubject = undefined;
        } else {
          this.router.navigate(['/home']);
        }
      },
      error: () => {
        this.hasConfirmedExit = true;
        this.showExitModal = false;
        if (this.exitSubject) {
          this.exitSubject.next(true);
          this.exitSubject.complete();
          this.exitSubject = undefined;
        } else {
          this.router.navigate(['/home']);
        }
      }
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.session && this.session.status === 'playing' && !this.hasConfirmedExit) {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          fetch('/api/v1/ai/games/interrogation/abandon/', {
            method: 'POST',
            keepalive: true,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ session_id: this.session.id, reason: 'beforeunload' })
          }).catch(() => {});
        } catch (e) {}
      }
      event.preventDefault();
      event.returnValue = '';
    }
  }

  scrollToBottom(): void {
    setTimeout(() => {
      if (this.chatScrollContainer?.nativeElement) {
        const el = this.chatScrollContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 100);
  }
}
