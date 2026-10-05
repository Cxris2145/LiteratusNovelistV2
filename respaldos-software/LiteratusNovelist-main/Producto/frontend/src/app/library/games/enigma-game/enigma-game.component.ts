import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ChatService } from '../../../core/services/chat.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from '../../../core/services/notification.service';
import { userStorageKey } from '../../../core/services/auth.service';
import { Observable, Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { CanComponentDeactivate } from '../../../core/guards/enigma-exit.guard';

export interface EnigmaLetterItem {
  id: string;
  originalChar: string;
  isLetter: boolean;
  isRevealed: boolean;
}

export interface EnigmaWord {
  id: string | number;
  word: string;
  clue: string;
  category: string;
  authorOrOrigin?: string;
  bookSlug?: string;
  fromInventory?: boolean;
}

@Component({
  selector: 'app-enigma-game',
  templateUrl: './enigma-game.component.html',
  styleUrls: ['./enigma-game.component.css']
})
export class EnigmaGameComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  private api = inject(ApiService);
  private chatService = inject(ChatService);
  private snackBar = inject(MatSnackBar);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  // Banco curado de respaldo con obras clásicas universales
  readonly wordsBank: EnigmaWord[] = [
    {
      id: 'cb-1',
      word: 'EL PRINCIPITO',
      clue: 'La historia del pequeño viajero de las estrellas que cuidaba con amor una rosa en el asteroide B-612.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Antoine de Saint-Exupéry'
    },
    {
      id: 'cb-2',
      word: 'PETER PAN',
      clue: 'El niño que rehusaba crecer y lideraba a los niños perdidos en la mágica isla de Nunca Jamás.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'J. M. Barrie'
    },
    {
      id: 'cb-3',
      word: 'DON QUIJOTE',
      clue: 'El soñador caballero andante de la triste figura que confundía molinos de viento con gigantes.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Miguel de Cervantes'
    },
    {
      id: 'cb-4',
      word: 'ALICIA',
      clue: 'La niña curiosa que siguió a un conejo blanco con reloj de bolsillo hasta un mundo subterráneo.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Lewis Carroll'
    },
    {
      id: 'cb-5',
      word: 'LA METAMORFOSIS',
      clue: 'El célebre relato donde Gregorio Samsa despierta una mañana transformado en un misterioso insecto.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Franz Kafka'
    },
    {
      id: 'cb-6',
      word: 'SHERLOCK HOLMES',
      clue: 'El sagaz detective de Baker Street que resolvía los misterios más intrincados con pura deducción lógica.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Arthur Conan Doyle'
    },
    {
      id: 'cb-7',
      word: 'LA ISLA DEL TESORO',
      clue: 'Inolvidable aventura marítima donde Jim Hawkins navega en La Española tras el oro pirata.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Robert Louis Stevenson'
    },
    {
      id: 'cb-8',
      word: 'PINOCHO',
      clue: 'La marioneta de madera esculpida por Geppetto que soñaba de corazón con ser un niño de verdad.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Carlo Collodi'
    },
    {
      id: 'cb-9',
      word: 'JULIO VERNE',
      clue: 'Visionario escritor de prodigiosas aventuras por el centro terrestre y las profundidades oceánicas.',
      category: 'Gran Autor',
      authorOrOrigin: 'Francia'
    },
    {
      id: 'cb-10',
      word: 'FRANKENSTEIN',
      clue: 'La cumbre de la novela gótica donde un científico da vida a una criatura nacida de la ciencia.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Mary Shelley'
    },
    {
      id: 'cb-11',
      word: 'SANCHO PANZA',
      clue: 'El leal y sabio escudero que recorre caminos sobre su asno Rucio recordando refranes populares.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Miguel de Cervantes'
    },
    {
      id: 'cb-12',
      word: 'ROBIN HOOD',
      clue: 'El legendario arquero del bosque de Sherwood que defendía la justicia y a los desfavorecidos.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Leyenda inglesa'
    },
    {
      id: 'cb-13',
      word: 'LA ODISEA',
      clue: 'El milenario poema épico que relata la intrépida travesía de diez años de Ulises de regreso a Ítaca.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Homero'
    },
    {
      id: 'cb-14',
      word: 'MOBY DICK',
      clue: 'La obsesiva expedición del capitán Ahab a través de mares tempestuosos en pos del gran leviatán.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Herman Melville'
    },
    {
      id: 'cb-15',
      word: 'EL MAGO DE OZ',
      clue: 'El camino de baldosas amarillas emprendido por Dorothy en busca de un corazón, cerebro y valor.',
      category: 'Obra Clásica',
      authorOrOrigin: 'L. Frank Baum'
    },
    {
      id: 'cb-16',
      word: 'CANTO DE NAVIDAD',
      clue: 'El relato donde el anciano Scrooge aprende el valor de la compasión gracias a tres espíritus.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Charles Dickens'
    }
  ];

  // Teclado virtual ordenado
  readonly keyboardRows: string[][] = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  readonly maxMistakes = 5;
  readonly rewardAmount = 15;
  readonly maxDailyWins = 1; // 1 enigma por día

  currentWord!: EnigmaWord;
  wordGroups: EnigmaLetterItem[][] = [];
  guessedLetters = new Set<string>();
  mistakesCount = 0;
  gameStatus: 'playing' | 'won' | 'lost' = 'playing';

  userInkBalance = 0;
  isRewardClaimed = false;
  isClaiming = false;
  isLoggedIn = false;
  showRules = false;
  isLoadingEnigma = true;
  hasInventoryBooks = false;

  // Estado del modal de advertencia de salida y penalización
  showExitModal = false;
  isAbandoning = false;
  private hasConfirmedExit = false;
  private exitSubject?: Subject<boolean>;

  todayDateStr = '';
  todayDisplayDate = '';
  nextEnigmaCountdown = '';
  private countdownTimer?: any;
  private normalizedSecretWord = '';

  ngOnInit(): void {
    this.todayDateStr = this.getTodayDateString();
    this.todayDisplayDate = this.getFormattedToday();
    this.checkAuthStatus();
    this.initDailyEnigma();
    this.startCountdownTimer();
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }

  /**
   * Router Guard: CanDeactivate
   * Si el juego está en curso ('playing') y el usuario intenta cambiar de ruta,
   * se abre el modal de advertencia y se bloquea la navegación hasta que decida.
   */
  canDeactivate(): Observable<boolean> | boolean {
    if (this.gameStatus !== 'playing' || this.hasConfirmedExit) {
      return true;
    }

    if (!this.isLoggedIn) {
      return true;
    }

    this.showExitModal = true;
    this.exitSubject = new Subject<boolean>();
    return this.exitSubject.asObservable();
  }

  /**
   * Cancela la salida: mantiene al usuario exactamente donde estaba en la partida.
   */
  cancelExit(): void {
    this.showExitModal = false;
    if (this.exitSubject) {
      this.exitSubject.next(false);
      this.exitSubject.complete();
      this.exitSubject = undefined;
    }
  }

  /**
   * Confirma la salida y ejecuta la penalización en el backend:
   * Registra el enigma como no descubierto (score 0), bloquea nuevos intentos y redirige.
   */
  confirmExitAndPenalize(): void {
    if (this.isAbandoning) return;
    this.isAbandoning = true;

    this.api.post<any>('library/daily-reward/abandon-enigma/', {}).pipe(
      finalize(() => {
        this.isAbandoning = false;
      })
    ).subscribe({
      next: (res) => {
        this.gameStatus = 'lost';
        this.isRewardClaimed = true;
        this.saveDailyState();
        this.hasConfirmedExit = true;
        this.showExitModal = false;

        this.notificationService.warning(
          'Has salido del enigma de hoy. Se ha registrado como no descubierto (0 puntos) y se han inhabilitado nuevos intentos hoy.',
          'Enigma Abandonado'
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
        // En caso de fallo de red, se penaliza localmente para preservar la regla de negocio
        this.gameStatus = 'lost';
        this.isRewardClaimed = true;
        this.saveDailyState();
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

  /**
   * Cierre o recarga de pestaña forzada (F5 o cerrar ventana):
   * Dispara advertencia nativa del navegador y envía señal de abandono al backend de emergencia.
   */
  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.gameStatus === 'playing' && this.isLoggedIn && !this.hasConfirmedExit) {
      const token = localStorage.getItem('access_token');
      const url = '/api/v1/library/daily-reward/abandon-enigma/';

      try {
        if (token) {
          fetch(url, {
            method: 'POST',
            keepalive: true,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ reason: 'beforeunload', token })
          }).catch(() => {});
        } else if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify({ reason: 'beforeunload', token })], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
        }
      } catch (e) {
        // Fallback silencioso
      }

      this.gameStatus = 'lost';
      this.isRewardClaimed = true;
      this.saveDailyState();

      event.preventDefault();
      event.returnValue = '';
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (this.gameStatus !== 'playing') return;
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    const key = this.normalizeText(event.key);
    if (/^[A-ZÑ]$/.test(key)) {
      this.pressLetter(key);
    }
  }

  toggleRules(): void {
    this.showRules = !this.showRules;
  }

  closeRules(): void {
    this.showRules = false;
  }

  checkAuthStatus(): void {
    this.isLoggedIn = !!localStorage.getItem('access_token');
    if (this.isLoggedIn) {
      this.fetchUserBalance();
    }
  }

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

  getTodayDateString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getFormattedToday(): string {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const now = new Date();
    return `${now.getDate()} de ${months[now.getMonth()]}`;
  }

  /**
   * Genera un hash determinista a partir de la fecha para seleccionar
   * un único enigma al día de manera consistente.
   */
  getDailyIndex(dateStr: string, poolLength: number): number {
    if (poolLength <= 1) return 0;
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
      hash = (hash << 5) - hash + dateStr.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % poolLength;
  }

  /**
   * Limpia subtítulos y paréntesis de títulos largos para que sean jugables.
   */
  cleanBookTitle(title: string): string {
    if (!title) return '';
    let clean = title.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
    if (clean.includes(':')) {
      clean = clean.split(':')[0].trim();
    }
    return clean;
  }

  /**
   * Sanitiza la sinopsis para que no revele directamente el título del libro.
   */
  sanitizeClue(synopsis: string, title: string, author: string): string {
    let text = (synopsis || '').trim();
    if (!text) {
      return `Descifra esta destacada obra literaria escrita por ${author || 'un célebre autor'} que forma parte de tu biblioteca.`;
    }
    if (title) {
      const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(escaped, 'gi'), 'esta obra');
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 175) {
      text = text.slice(0, 172) + '...';
    }
    return text;
  }

  /**
   * Inicializa el enigma diario. Si el usuario tiene libros adquiridos en su biblioteca,
   * se construyen los enigmas a partir de ellos.
   */
  initDailyEnigma(): void {
    this.isLoadingEnigma = true;

    // Verificar si ya hay estado guardado para hoy
    const storageKey = userStorageKey(`literatus_daily_enigma_${this.todayDateStr}`);
    const savedRaw = localStorage.getItem(storageKey);
    const savedState = savedRaw ? JSON.parse(savedRaw) : null;

    if (this.isLoggedIn) {
      this.api.get<any>('library/daily-reward/enigma-status/').subscribe({
        next: (status) => {
          if (status) {
            if (status.status === 'unsolved' || (status.attempted && status.score === 0)) {
              this.gameStatus = 'lost';
              this.isRewardClaimed = true;
              this.saveDailyState();
              this.updateWordGroups();
            } else if (status.can_claim === false || status.status === 'solved') {
              this.isRewardClaimed = true;
              this.saveDailyState();
            }
          }
        },
        error: () => {}
      });

      this.api.get<any[]>('library/inventory/').subscribe({
        next: (res: any) => {
          const items: any[] = Array.isArray(res) ? res : (res?.results || []);
          const acquiredPool: EnigmaWord[] = [];

          items.forEach((item, idx) => {
            const rawTitle = item.book_title || item.edition?.book?.title || '';
            const cleanTitle = this.cleanBookTitle(rawTitle);
            const author = item.edition?.book?.author_name || 'Autor de tu biblioteca';
            const synopsis = item.edition?.book?.synopsis || '';
            const slug = item.book_slug || item.edition?.book?.slug || '';

            // Solo incluir títulos jugables (longitud entre 3 y 28 caracteres)
            if (cleanTitle.length >= 3 && cleanTitle.length <= 28) {
              acquiredPool.push({
                id: `inv-${item.id || idx}`,
                word: cleanTitle.toUpperCase(),
                clue: this.sanitizeClue(synopsis, cleanTitle, author),
                category: 'Obra de tu Biblioteca',
                authorOrOrigin: author,
                bookSlug: slug,
                fromInventory: true
              });
            }
          });

          this.hasInventoryBooks = acquiredPool.length > 0;
          const candidatePool = this.hasInventoryBooks ? acquiredPool : this.wordsBank;
          this.applyDailyEnigma(candidatePool, savedState);
        },
        error: () => {
          this.hasInventoryBooks = false;
          this.applyDailyEnigma(this.wordsBank, savedState);
        }
      });
    } else {
      this.hasInventoryBooks = false;
      this.applyDailyEnigma(this.wordsBank, savedState);
    }
  }

  private applyDailyEnigma(pool: EnigmaWord[], savedState: any): void {
    if (savedState && savedState.word && savedState.date === this.todayDateStr) {
      // Restaurar progreso del día
      this.currentWord = savedState.word;
      this.guessedLetters = new Set<string>(savedState.guessedLetters || []);
      this.mistakesCount = savedState.mistakesCount || 0;
      this.gameStatus = savedState.gameStatus || 'playing';
      this.isRewardClaimed = !!savedState.isRewardClaimed;
    } else {
      // Seleccionar el enigma determinista de hoy
      const dailyIndex = this.getDailyIndex(this.todayDateStr, pool.length);
      this.currentWord = pool[dailyIndex];
      this.guessedLetters.clear();
      this.mistakesCount = 0;
      this.gameStatus = 'playing';
      this.isRewardClaimed = false;
      this.saveDailyState();
    }

    this.normalizedSecretWord = this.normalizeText(this.currentWord.word);
    this.updateWordGroups();
    this.isLoadingEnigma = false;
  }

  saveDailyState(): void {
    if (!this.currentWord) return;
    const state = {
      date: this.todayDateStr,
      word: this.currentWord,
      guessedLetters: Array.from(this.guessedLetters),
      mistakesCount: this.mistakesCount,
      gameStatus: this.gameStatus,
      isRewardClaimed: this.isRewardClaimed
    };
    localStorage.setItem(userStorageKey(`literatus_daily_enigma_${this.todayDateStr}`), JSON.stringify(state));
  }

  pressLetter(letter: string): void {
    if (this.gameStatus !== 'playing') return;
    if (this.guessedLetters.has(letter)) return;

    this.guessedLetters.add(letter);

    if (this.normalizedSecretWord.includes(letter)) {
      if (this.isWordCompleted()) {
        this.gameStatus = 'won';
        this.onGameWon();
      }
    } else {
      this.mistakesCount++;
      if (this.mistakesCount >= this.maxMistakes) {
        this.gameStatus = 'lost';
        this.notificationService.warning(`La palabra oculta era: «${this.currentWord.word}». ¡Vuelve a intentarlo mañana!`, 'Tinta Agotada');
      }
    }

    this.saveDailyState();
    this.updateWordGroups();
  }

  isWordCompleted(): boolean {
    for (const char of this.normalizedSecretWord) {
      if (/[A-ZÑ]/.test(char)) {
        if (!this.guessedLetters.has(char)) {
          return false;
        }
      }
    }
    return true;
  }

  onGameWon(): void {
    if (this.isRewardClaimed) return;

    if (!this.isLoggedIn) {
      this.notificationService.info('¡Enigma diario descifrado! Inicia sesión para registrar tu recompensa.', 'Enigma Completado');
      return;
    }

    this.isClaiming = true;
    this.api.post<any>('library/daily-reward/claim-enigma/', {}).subscribe({
      next: (res) => {
        this.isClaiming = false;
        this.isRewardClaimed = true;
        this.saveDailyState();

        const earned = res?.ink_reward || this.rewardAmount;
        if (res && res.ink_balance !== undefined) {
          this.userInkBalance = res.ink_balance;
          this.chatService.updateInkBalance(this.userInkBalance);
        } else {
          this.userInkBalance += earned;
          this.chatService.updateInkBalance(this.userInkBalance);
        }

        this.notificationService.gamify('ink', earned, `¡Has ganado +${earned} Gotas de Tinta y +${res?.xp_reward || 20} XP por descifrar el enigma de hoy!`, 'Enigma Descifrado');
      },
      error: (err) => {
        this.isClaiming = false;
        this.isRewardClaimed = true;
        this.saveDailyState();
        if (err?.error?.error === 'ALREADY_CLAIMED') {
          this.notificationService.info('Ya has reclamado la recompensa del enigma de hoy. ¡Vuelve mañana para un nuevo reto!', 'Enigma Diario');
        }
      }
    });
  }

  startCountdownTimer(): void {
    this.updateCountdown();
    this.countdownTimer = setInterval(() => {
      this.updateCountdown();
    }, 1000);
  }

  updateCountdown(): void {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const diffMs = tomorrow.getTime() - now.getTime();

    if (diffMs <= 0) {
      this.nextEnigmaCountdown = '00h 00m 00s';
      const newTodayStr = this.getTodayDateString();
      if (newTodayStr !== this.todayDateStr) {
        this.todayDateStr = newTodayStr;
        this.todayDisplayDate = this.getFormattedToday();
        this.initDailyEnigma();
      }
      return;
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    this.nextEnigmaCountdown = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  updateWordGroups(): void {
    if (!this.currentWord) {
      this.wordGroups = [];
      return;
    }

    const chars = this.currentWord.word.split('');
    const full: EnigmaLetterItem[] = chars.map((char, index) => {
      const isLetter = /[A-ZÁÉÍÓÚÜÑa-záéíóúüñ]/.test(char);
      if (!isLetter) {
        return {
          id: `sep-${index}-${char}`,
          originalChar: char,
          isLetter: false,
          isRevealed: true
        };
      }
      const normalized = this.normalizeText(char);
      const isRevealed = this.gameStatus === 'lost' || this.guessedLetters.has(normalized);
      return {
        id: `char-${index}-${char}`,
        originalChar: char,
        isLetter: true,
        isRevealed
      };
    });

    const groups: EnigmaLetterItem[][] = [];
    let currentGroup: EnigmaLetterItem[] = [];

    for (const item of full) {
      if (item.originalChar === ' ') {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
      } else {
        currentGroup.push(item);
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    this.wordGroups = groups;
  }

  trackByGroupIndex(index: number): number {
    return index;
  }

  trackByItemId(index: number, item: EnigmaLetterItem): string {
    return item.id;
  }

  getLetterState(letter: string): 'unused' | 'correct' | 'wrong' {
    if (!this.guessedLetters.has(letter)) {
      return 'unused';
    }
    return this.normalizedSecretWord.includes(letter) ? 'correct' : 'wrong';
  }

  get remainingMistakes(): number {
    return Math.max(0, this.maxMistakes - this.mistakesCount);
  }

  normalizeText(text: string): string {
    return text
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, (match, offset, str) => {
        if (match === '\u0303' && offset > 0 && str[offset - 1].toUpperCase() === 'N') {
          return match;
        }
        return '';
      })
      .normalize('NFC');
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
