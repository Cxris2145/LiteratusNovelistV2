import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ChatService } from '../../../core/services/chat.service';
import { MatSnackBar } from '@angular/material/snack-bar';

export interface EnigmaWord {
  id: number;
  word: string;
  clue: string;
  category: 'Obra Clásica' | 'Personaje Legendario' | 'Gran Autor';
  authorOrOrigin?: string;
}

@Component({
  selector: 'app-enigma-game',
  templateUrl: './enigma-game.component.html',
  styleUrls: ['./enigma-game.component.css']
})
export class EnigmaGameComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private chatService = inject(ChatService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  // Banco curado de enigmas literarios (Obras, personajes y autores universales)
  readonly wordsBank: EnigmaWord[] = [
    {
      id: 1,
      word: 'EL PRINCIPITO',
      clue: 'La historia de un pequeño viajero de las estrellas que cuidaba con amor una rosa en el asteroide B-612.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Antoine de Saint-Exupéry'
    },
    {
      id: 2,
      word: 'PETER PAN',
      clue: 'El niño que rehusaba crecer y lideraba a los niños perdidos en la mágica isla de Nunca Jamás.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'J. M. Barrie'
    },
    {
      id: 3,
      word: 'DON QUIJOTE',
      clue: 'El soñador caballero andante de la triste figura que confundía molinos de viento con gigantes.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Miguel de Cervantes'
    },
    {
      id: 4,
      word: 'ALICIA',
      clue: 'La niña curiosa que siguió a un conejo blanco con reloj de bolsillo hasta un mundo subterráneo.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Lewis Carroll'
    },
    {
      id: 5,
      word: 'LA METAMORFOSIS',
      clue: 'El relato donde Gregorio Samsa despierta una mañana transformado en un misterioso insecto.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Franz Kafka'
    },
    {
      id: 6,
      word: 'SHERLOCK HOLMES',
      clue: 'El sagaz detective de Baker Street que resolvía los enigmas más complejos con lógica y observación.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Arthur Conan Doyle'
    },
    {
      id: 7,
      word: 'LA ISLA DEL TESORO',
      clue: 'Aventura marina en la que Jim Hawkins viaja en la goleta La Española en busca del oro pirata.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Robert Louis Stevenson'
    },
    {
      id: 8,
      word: 'PINOCHO',
      clue: 'La marioneta de madera esculpida por Geppetto que soñaba con ser un niño de verdad.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Carlo Collodi'
    },
    {
      id: 9,
      word: 'JULIO VERNE',
      clue: 'Visionario escritor de aventuras extraordinarias como Viaje al Centro de la Tierra y Veinte Mil Leguas.',
      category: 'Gran Autor',
      authorOrOrigin: 'Francia'
    },
    {
      id: 10,
      word: 'FRANKENSTEIN',
      clue: 'Novela gótica donde un científico da vida a una criatura creada a partir de la ciencia.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Mary Shelley'
    },
    {
      id: 11,
      word: 'SANCHO PANZA',
      clue: 'El leal y sabio escudero que recorre caminos sobre su asno Rucio recordando refranes populares.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Don Quijote de la Mancha'
    },
    {
      id: 12,
      word: 'ROBIN HOOD',
      clue: 'El legendario arquero del bosque de Sherwood que defendía la justicia y a los desfavorecidos.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Leyenda inglesa'
    },
    {
      id: 13,
      word: 'LA ODISEA',
      clue: 'El milenario poema épico que relata la intrépida travesía de diez años de Ulises hacia Ítaca.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Homero'
    },
    {
      id: 14,
      word: 'MOBY DICK',
      clue: 'La intensa expedición marítima del capitán Ahab a través de los océanos persiguiendo a una gran ballena.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Herman Melville'
    },
    {
      id: 15,
      word: 'CAMPANITA',
      clue: 'El hada luminosa y brillante que reparte polvo mágico para que los corazones alegres puedan volar.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Peter Pan'
    },
    {
      id: 16,
      word: 'EL MAGO DE OZ',
      clue: 'El viaje de Dorothy por el camino de baldosas amarillas en busca de un corazón, cerebro y valor.',
      category: 'Obra Clásica',
      authorOrOrigin: 'L. Frank Baum'
    },
    {
      id: 17,
      word: 'MIGUEL DE CERVANTES',
      clue: 'El Príncipe de los Ingenios, considerado la cumbre de la literatura en lengua española.',
      category: 'Gran Autor',
      authorOrOrigin: 'España'
    },
    {
      id: 18,
      word: 'LOS TRES MOSQUETEROS',
      clue: 'La historia de cuatro valientes espadachines unidos por el honor: Uno para todos y todos para uno.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Alexandre Dumas'
    },
    {
      id: 19,
      word: 'EL GATO CON BOTAS',
      clue: 'El astuto felino que con ingenio y elegancia logró convertir a su humilde dueño en marqués.',
      category: 'Personaje Legendario',
      authorOrOrigin: 'Charles Perrault'
    },
    {
      id: 20,
      word: 'CANTO DE NAVIDAD',
      clue: 'El relato donde el anciano Scrooge aprende el valor de la compasión gracias a tres espíritus.',
      category: 'Obra Clásica',
      authorOrOrigin: 'Charles Dickens'
    }
  ];

  // Filas del teclado virtual
  readonly keyboardRows: string[][] = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  readonly maxMistakes = 5;
  readonly rewardAmount = 15;
  readonly maxDailyWins = 3;

  currentWord!: EnigmaWord;
  guessedLetters = new Set<string>();
  mistakesCount = 0;
  gameStatus: 'playing' | 'won' | 'lost' = 'playing';

  userInkBalance = 0;
  dailyWinsCount = 0;
  isRewardClaimed = false;
  isClaiming = false;
  isLoggedIn = false;
  showRules = false;

  toggleRules(): void {
    this.showRules = !this.showRules;
  }

  closeRules(): void {
    this.showRules = false;
  }

  // Letras normalizadas para mapear acentos automáticamente
  private normalizedSecretWord = '';
  private usedWordIds: number[] = [];

  ngOnInit(): void {
    this.checkAuthStatus();
    this.loadDailyWins();
    this.startNewGame();
  }

  ngOnDestroy(): void {}

  // Listener para capturar pulsaciones de teclado físico
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (this.gameStatus !== 'playing') return;
    const key = event.key.toUpperCase();
    if (/^[A-ZÑ]$/.test(key)) {
      this.pressLetter(key);
    }
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

  loadDailyWins(): void {
    const todayKey = `enigma_wins_${new Date().toISOString().slice(0, 10)}`;
    const stored = localStorage.getItem(todayKey);
    this.dailyWinsCount = stored ? parseInt(stored, 10) : 0;
  }

  saveDailyWins(): void {
    const todayKey = `enigma_wins_${new Date().toISOString().slice(0, 10)}`;
    localStorage.setItem(todayKey, this.dailyWinsCount.toString());
  }

  startNewGame(): void {
    // Si ya jugamos todas las palabras, reiniciamos la lista de usadas
    if (this.usedWordIds.length >= this.wordsBank.length) {
      this.usedWordIds = [];
    }

    const availableWords = this.wordsBank.filter(w => !this.usedWordIds.includes(w.id));
    const selected = availableWords[Math.floor(Math.random() * availableWords.length)];
    this.currentWord = selected;
    this.usedWordIds.push(selected.id);

    this.normalizedSecretWord = this.normalizeText(this.currentWord.word);
    this.guessedLetters.clear();
    this.mistakesCount = 0;
    this.gameStatus = 'playing';
    this.isRewardClaimed = false;
  }

  pressLetter(letter: string): void {
    if (this.gameStatus !== 'playing') return;
    if (this.guessedLetters.has(letter)) return;

    this.guessedLetters.add(letter);

    // Comprobar si la letra normalizada está en la palabra
    if (this.normalizedSecretWord.includes(letter)) {
      // Verificar si ya completó todas las letras requeridas
      if (this.isWordCompleted()) {
        this.gameStatus = 'won';
        this.onGameWon();
      }
    } else {
      this.mistakesCount++;
      if (this.mistakesCount >= this.maxMistakes) {
        this.gameStatus = 'lost';
      }
    }
  }

  isWordCompleted(): boolean {
    for (const char of this.normalizedSecretWord) {
      // Ignorar espacios y puntuación
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
      this.snackBar.open('¡Palabra descifrada! Inicia sesión para sumar Tinta a tu biblioteca.', 'Entendido', { duration: 4000 });
      return;
    }

    if (this.dailyWinsCount >= this.maxDailyWins) {
      this.snackBar.open('¡Victoria! Has alcanzado el límite de 3 recompensas de hoy. ¡Vuelve mañana por más tinta!', 'Cerrar', { duration: 4000 });
      return;
    }

    this.isClaiming = true;
    this.api.post<any>('users/me/add_ink/', { amount: this.rewardAmount }).subscribe({
      next: (res) => {
        this.isClaiming = false;
        this.isRewardClaimed = true;
        this.dailyWinsCount++;
        this.saveDailyWins();

        if (res && res.ink_balance !== undefined) {
          this.userInkBalance = res.ink_balance;
          this.chatService.updateInkBalance(this.userInkBalance);
        } else {
          this.userInkBalance += this.rewardAmount;
          this.chatService.updateInkBalance(this.userInkBalance);
        }

        this.snackBar.open(`¡Enigma descifrado! Has ganado +${this.rewardAmount} Gotas de Tinta.`, 'Excelente', { duration: 4000 });
      },
      error: () => {
        this.isClaiming = false;
        this.snackBar.open('Error al sincronizar la Tinta en el servidor.', 'Cerrar', { duration: 3000 });
      }
    });
  }

  // Desglosa la palabra en caracteres manteniendo espacios para la vista
  getWordDisplay(): { originalChar: string; isLetter: boolean; isRevealed: boolean }[] {
    const chars = this.currentWord.word.split('');
    return chars.map(char => {
      const isLetter = /[A-ZÁÉÍÓÚÜÑa-záéíóúüñ]/.test(char);
      if (!isLetter) {
        return { originalChar: char, isLetter: false, isRevealed: true };
      }
      const normalized = this.normalizeText(char);
      const isRevealed = this.gameStatus === 'lost' || this.guessedLetters.has(normalized);
      return { originalChar: char, isLetter: true, isRevealed };
    });
  }

  // Agrupa en palabras para permitir saltos de línea ordenados en pantallas pequeñas
  getWordGroups(): { originalChar: string; isLetter: boolean; isRevealed: boolean }[][] {
    const full = this.getWordDisplay();
    const groups: { originalChar: string; isLetter: boolean; isRevealed: boolean }[][] = [];
    let currentGroup: { originalChar: string; isLetter: boolean; isRevealed: boolean }[] = [];

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
    return groups;
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
      .replace(/[\u0300-\u036f]/g, (match) => {
        // Preservar la virgulilla de la Ñ
        return match === '\u0303' ? '\u0303' : '';
      });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
