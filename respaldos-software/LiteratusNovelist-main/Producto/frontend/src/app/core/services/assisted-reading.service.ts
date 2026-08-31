import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AssistedReadingService {
  // === ESTADO (BehaviorSubject) ===
  enabled$ = new BehaviorSubject<boolean>(false);
  mode$ = new BehaviorSubject<'word' | 'line' | 'sentence' | 'paragraph'>('sentence');
  focusMode$ = new BehaviorSubject<boolean>(false);
  cleanMode$ = new BehaviorSubject<boolean>(false);
  textSplitting$ = new BehaviorSubject<boolean>(false);
  readingGuide$ = new BehaviorSubject<boolean>(false);
  autoAdvance$ = new BehaviorSubject<boolean>(false);
  autoAdvanceSpeed$ = new BehaviorSubject<number>(1); // 0.5, 0.75, 1, 1.25, 1.5, 2
  highlightColor$ = new BehaviorSubject<string>('yellow'); // yellow, blue, green, orange, gray
  highlightIntensity$ = new BehaviorSubject<'soft' | 'medium' | 'high'>('medium');
  textSize$ = new BehaviorSubject<'small' | 'normal' | 'large' | 'xlarge'>('normal');
  lineSpacing$ = new BehaviorSubject<'normal' | 'wide' | 'xwide'>('normal');
  letterSpacing$ = new BehaviorSubject<'normal' | 'wide'>('normal');
  readingWidth$ = new BehaviorSubject<'narrow' | 'normal' | 'wide'>('normal');
  fontOverride$ = new BehaviorSubject<'default' | 'opendyslexic'>('default');

  // Posición actual
  currentSentenceIndex$ = new BehaviorSubject<number>(-1);
  currentWordIndex$ = new BehaviorSubject<number>(-1);
  currentBlockIndex$ = new BehaviorSubject<number>(-1);

  // Temporizador de avance automático
  private autoAdvanceTimer: any = null;
  private isAutoAdvancePaused = false;

  // Referencias a los bloques parseados
  private parsedBlocks: any[] = [];
  private totalSentences = 0;
  private totalWords = 0;
  private sentenceToBlockMap: Map<number, number> = new Map();
  private wordToSentenceMap: Map<number, number> = new Map();
  private wordToBlockMap: Map<number, number> = new Map();

  // Para autoguardado de preferencias
  private savePreferencesSubject = new Subject<void>();

  constructor() {
    this.loadPreferences();

    // Configurar autoguardado con debounce de 300ms
    this.savePreferencesSubject.pipe(
      debounceTime(300)
    ).subscribe(() => {
      this.executeSavePreferences();
    });

    // Suscribirse a cambios en configuraciones para autoguardar
    this.enabled$.subscribe(() => this.savePreferences());
    this.mode$.subscribe(() => this.savePreferences());
    this.focusMode$.subscribe(() => this.savePreferences());
    this.cleanMode$.subscribe(() => this.savePreferences());
    this.textSplitting$.subscribe(() => this.savePreferences());
    this.readingGuide$.subscribe(() => this.savePreferences());
    this.autoAdvanceSpeed$.subscribe(() => this.savePreferences());
    this.highlightColor$.subscribe(() => this.savePreferences());
    this.highlightIntensity$.subscribe(() => this.savePreferences());
    this.textSize$.subscribe(() => this.savePreferences());
    this.lineSpacing$.subscribe(() => this.savePreferences());
    this.letterSpacing$.subscribe(() => this.savePreferences());
    this.readingWidth$.subscribe(() => this.savePreferences());
    this.fontOverride$.subscribe(() => this.savePreferences());
  }

  /**
   * Establece los bloques parseados del capítulo y construye los mapas de índices.
   * Utiliza la estructura real de parsedBlocks del ReaderComponent:
   *   block.sentences[].tokens[] donde cada token tiene { isWord, idx, text, ... }
   */
  setParsedBlocks(blocks: any[]) {
    this.parsedBlocks = blocks;
    this.totalSentences = 0;
    this.totalWords = 0;
    this.sentenceToBlockMap.clear();
    this.wordToSentenceMap.clear();
    this.wordToBlockMap.clear();

    blocks.forEach((block, blockIndex) => {
      if (block.tag === 'img-block') return; // Ignorar bloques de imagen
      if (block.sentences) {
        block.sentences.forEach((sentence: any) => {
          const sentenceIndex = this.totalSentences++;
          this.sentenceToBlockMap.set(sentenceIndex, blockIndex);

          if (sentence.tokens) {
            sentence.tokens.forEach((token: any) => {
              if (token.isWord && token.idx >= 0) {
                this.wordToSentenceMap.set(token.idx, sentenceIndex);
                this.wordToBlockMap.set(token.idx, blockIndex);
                this.totalWords = Math.max(this.totalWords, token.idx + 1);
              }
            });
          }
        });
      }
    });
  }

  /**
   * Avanza al siguiente elemento según el modo actual.
   */
  advance() {
    const mode = this.mode$.value;
    
    if (mode === 'word') {
      const nextWord = this.currentWordIndex$.value + 1;
      if (nextWord < this.totalWords) {
        this.currentWordIndex$.next(nextWord);
        const sentenceIdx = this.wordToSentenceMap.get(nextWord);
        if (sentenceIdx !== undefined) {
          this.currentSentenceIndex$.next(sentenceIdx);
        }
        const blockIdx = this.wordToBlockMap.get(nextWord);
        if (blockIdx !== undefined) {
          this.currentBlockIndex$.next(blockIdx);
        }
      } else {
        this.stopAutoAdvance();
      }
    } else if (mode === 'sentence' || mode === 'line') {
      const nextSentence = this.currentSentenceIndex$.value + 1;
      if (nextSentence < this.totalSentences) {
        this.currentSentenceIndex$.next(nextSentence);
        const blockIdx = this.sentenceToBlockMap.get(nextSentence);
        if (blockIdx !== undefined) {
          this.currentBlockIndex$.next(blockIdx);
        }
        
        // Encontrar la primera palabra de esta oración
        let firstWordOfSentence = -1;
        for (const [wordIdx, sentIdx] of this.wordToSentenceMap.entries()) {
          if (sentIdx === nextSentence) {
            firstWordOfSentence = wordIdx;
            break;
          }
        }
        if (firstWordOfSentence !== -1) {
          this.currentWordIndex$.next(firstWordOfSentence);
        }
      } else {
        this.stopAutoAdvance();
      }
    } else if (mode === 'paragraph') {
      const nextBlock = this.currentBlockIndex$.value + 1;
      if (nextBlock < this.parsedBlocks.length) {
        this.currentBlockIndex$.next(nextBlock);
        
        let firstSentenceOfBlock = -1;
        for (const [sentIdx, blockIdx] of this.sentenceToBlockMap.entries()) {
          if (blockIdx === nextBlock) {
            firstSentenceOfBlock = sentIdx;
            break;
          }
        }
        if (firstSentenceOfBlock !== -1) {
          this.currentSentenceIndex$.next(firstSentenceOfBlock);
          
          let firstWordOfSentence = -1;
          for (const [wordIdx, sentIdx] of this.wordToSentenceMap.entries()) {
            if (sentIdx === firstSentenceOfBlock) {
              firstWordOfSentence = wordIdx;
              break;
            }
          }
          if (firstWordOfSentence !== -1) {
            this.currentWordIndex$.next(firstWordOfSentence);
          }
        }
      } else {
        this.stopAutoAdvance();
      }
    }
  }

  /**
   * Retrocede al elemento anterior según el modo actual.
   */
  retreat() {
    const mode = this.mode$.value;
    
    if (mode === 'word') {
      const prevWord = Math.max(0, this.currentWordIndex$.value - 1);
      this.currentWordIndex$.next(prevWord);
      const sentenceIdx = this.wordToSentenceMap.get(prevWord);
      if (sentenceIdx !== undefined) {
        this.currentSentenceIndex$.next(sentenceIdx);
      }
      const blockIdx = this.wordToBlockMap.get(prevWord);
      if (blockIdx !== undefined) {
        this.currentBlockIndex$.next(blockIdx);
      }
    } else if (mode === 'sentence' || mode === 'line') {
      const prevSentence = Math.max(0, this.currentSentenceIndex$.value - 1);
      this.currentSentenceIndex$.next(prevSentence);
      const blockIdx = this.sentenceToBlockMap.get(prevSentence);
      if (blockIdx !== undefined) {
        this.currentBlockIndex$.next(blockIdx);
      }
      
      let firstWordOfSentence = -1;
      for (const [wordIdx, sentIdx] of this.wordToSentenceMap.entries()) {
        if (sentIdx === prevSentence) {
          firstWordOfSentence = wordIdx;
          break;
        }
      }
      if (firstWordOfSentence !== -1) {
        this.currentWordIndex$.next(firstWordOfSentence);
      }
    } else if (mode === 'paragraph') {
      const prevBlock = Math.max(0, this.currentBlockIndex$.value - 1);
      this.currentBlockIndex$.next(prevBlock);
      
      let firstSentenceOfBlock = -1;
      for (const [sentIdx, blockIdx] of this.sentenceToBlockMap.entries()) {
        if (blockIdx === prevBlock) {
          firstSentenceOfBlock = sentIdx;
          break;
        }
      }
      if (firstSentenceOfBlock !== -1) {
        this.currentSentenceIndex$.next(firstSentenceOfBlock);
        
        let firstWordOfSentence = -1;
        for (const [wordIdx, sentIdx] of this.wordToSentenceMap.entries()) {
          if (sentIdx === firstSentenceOfBlock) {
            firstWordOfSentence = wordIdx;
            break;
          }
        }
        if (firstWordOfSentence !== -1) {
          this.currentWordIndex$.next(firstWordOfSentence);
        }
      }
    }
  }

  /**
   * Salta a una oración específica y actualiza todos los índices.
   */
  goToIndex(sentenceIndex: number) {
    if (sentenceIndex >= 0 && sentenceIndex < this.totalSentences) {
      this.currentSentenceIndex$.next(sentenceIndex);
      
      const blockIdx = this.sentenceToBlockMap.get(sentenceIndex);
      if (blockIdx !== undefined) {
        this.currentBlockIndex$.next(blockIdx);
      }
      
      let firstWordOfSentence = -1;
      for (const [wordIdx, sentIdx] of this.wordToSentenceMap.entries()) {
        if (sentIdx === sentenceIndex) {
          firstWordOfSentence = wordIdx;
          break;
        }
      }
      if (firstWordOfSentence !== -1) {
        this.currentWordIndex$.next(firstWordOfSentence);
      }
    }
  }

  /**
   * Sincroniza la posición con el audio en base al índice de la palabra actual dictada.
   */
  syncWithAudio(wordIndex: number) {
    if (wordIndex >= 0 && wordIndex < this.totalWords) {
      this.currentWordIndex$.next(wordIndex);
      
      const sentenceIdx = this.wordToSentenceMap.get(wordIndex);
      if (sentenceIdx !== undefined) {
        this.currentSentenceIndex$.next(sentenceIdx);
      }
      
      const blockIdx = this.wordToBlockMap.get(wordIndex);
      if (blockIdx !== undefined) {
        this.currentBlockIndex$.next(blockIdx);
      }
    }
  }

  /**
   * Inicia el temporizador de avance automático.
   */
  startAutoAdvance() {
    this.stopAutoAdvance();
    this.isAutoAdvancePaused = false;
    this.autoAdvance$.next(true);
    
    this.scheduleNextAdvance();
  }
  
  private scheduleNextAdvance() {
    if (this.isAutoAdvancePaused || !this.autoAdvance$.value) return;
    
    const mode = this.mode$.value;
    const speedFactor = this.autoAdvanceSpeed$.value;
    
    let baseTime = 3500;
    if (mode === 'word') baseTime = 300;
    else if (mode === 'line') baseTime = 2500;
    else if (mode === 'paragraph') baseTime = 5000;
    
    const interval = baseTime / speedFactor;
    
    this.autoAdvanceTimer = setTimeout(() => {
      if (!this.isAutoAdvancePaused && this.autoAdvance$.value) {
        this.advance();
        this.scheduleNextAdvance();
      }
    }, interval);
  }

  /**
   * Detiene el avance automático.
   */
  stopAutoAdvance() {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    this.autoAdvance$.next(false);
    this.isAutoAdvancePaused = false;
  }

  /**
   * Pausa el avance automático.
   */
  pauseAutoAdvance() {
    this.isAutoAdvancePaused = true;
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
    }
  }

  /**
   * Reanuda el avance automático.
   */
  resumeAutoAdvance() {
    this.isAutoAdvancePaused = false;
    if (this.autoAdvance$.value) {
      this.scheduleNextAdvance();
    }
  }

  /**
   * Alterna un valor booleano en el estado de configuración.
   */
  toggle(prop: string) {
    switch (prop) {
      case 'enabled':
        this.enabled$.next(!this.enabled$.value);
        break;
      case 'focusMode':
        this.focusMode$.next(!this.focusMode$.value);
        break;
      case 'cleanMode':
        this.cleanMode$.next(!this.cleanMode$.value);
        break;
      case 'textSplitting':
        this.textSplitting$.next(!this.textSplitting$.value);
        break;
      case 'readingGuide':
        this.readingGuide$.next(!this.readingGuide$.value);
        break;
      case 'autoAdvance':
        if (this.autoAdvance$.value) {
          this.stopAutoAdvance();
        } else {
          this.startAutoAdvance();
        }
        break;
    }
  }

  /**
   * Dispara la guardada de preferencias usando un mecanismo de debounce.
   */
  savePreferences() {
    this.savePreferencesSubject.next();
  }

  /**
   * Guarda las preferencias de lectura asistida en el localStorage.
   */
  private executeSavePreferences() {
    const prefs = {
      enabled: this.enabled$.value,
      mode: this.mode$.value,
      focusMode: this.focusMode$.value,
      cleanMode: this.cleanMode$.value,
      textSplitting: this.textSplitting$.value,
      readingGuide: this.readingGuide$.value,
      autoAdvanceSpeed: this.autoAdvanceSpeed$.value,
      highlightColor: this.highlightColor$.value,
      highlightIntensity: this.highlightIntensity$.value,
      textSize: this.textSize$.value,
      lineSpacing: this.lineSpacing$.value,
      letterSpacing: this.letterSpacing$.value,
      readingWidth: this.readingWidth$.value,
      fontOverride: this.fontOverride$.value
    };
    localStorage.setItem('ar-prefs', JSON.stringify(prefs));
  }

  /**
   * Carga las preferencias de lectura asistida desde el localStorage.
   */
  loadPreferences() {
    const prefsJson = localStorage.getItem('ar-prefs');
    if (prefsJson) {
      try {
        const prefs = JSON.parse(prefsJson);
        if (prefs.enabled !== undefined) this.enabled$.next(prefs.enabled);
        if (prefs.mode !== undefined) this.mode$.next(prefs.mode);
        if (prefs.focusMode !== undefined) this.focusMode$.next(prefs.focusMode);
        if (prefs.cleanMode !== undefined) this.cleanMode$.next(prefs.cleanMode);
        if (prefs.textSplitting !== undefined) this.textSplitting$.next(prefs.textSplitting);
        if (prefs.readingGuide !== undefined) this.readingGuide$.next(prefs.readingGuide);
        if (prefs.autoAdvanceSpeed !== undefined) this.autoAdvanceSpeed$.next(prefs.autoAdvanceSpeed);
        if (prefs.highlightColor !== undefined) this.highlightColor$.next(prefs.highlightColor);
        if (prefs.highlightIntensity !== undefined) this.highlightIntensity$.next(prefs.highlightIntensity);
        if (prefs.textSize !== undefined) this.textSize$.next(prefs.textSize);
        if (prefs.lineSpacing !== undefined) this.lineSpacing$.next(prefs.lineSpacing);
        if (prefs.letterSpacing !== undefined) this.letterSpacing$.next(prefs.letterSpacing);
        if (prefs.readingWidth !== undefined) this.readingWidth$.next(prefs.readingWidth);
        if (prefs.fontOverride !== undefined) this.fontOverride$.next(prefs.fontOverride);
      } catch (e) {
        console.error('Error loading assisted reading preferences', e);
      }
    }
  }

  /**
   * Guarda el estado de progreso (índices) para un libro/inventario específico.
   */
  saveBookState(inventoryId: string) {
    if (!inventoryId) return;
    
    const state = {
      currentSentenceIndex: this.currentSentenceIndex$.value,
      currentWordIndex: this.currentWordIndex$.value,
      currentBlockIndex: this.currentBlockIndex$.value
    };
    
    localStorage.setItem(`ar-state-${inventoryId}`, JSON.stringify(state));
  }

  /**
   * Carga el estado de progreso (índices) para un libro/inventario específico.
   */
  loadBookState(inventoryId: string) {
    if (!inventoryId) return;
    
    const stateJson = localStorage.getItem(`ar-state-${inventoryId}`);
    if (stateJson) {
      try {
        const state = JSON.parse(stateJson);
        if (state.currentSentenceIndex !== undefined) this.currentSentenceIndex$.next(state.currentSentenceIndex);
        if (state.currentWordIndex !== undefined) this.currentWordIndex$.next(state.currentWordIndex);
        if (state.currentBlockIndex !== undefined) this.currentBlockIndex$.next(state.currentBlockIndex);
      } catch (e) {
        console.error('Error loading assisted reading book state', e);
      }
    } else {
      this.reset();
    }
  }

  /**
   * Resetea los índices de progreso actuales a -1 y detiene el avance automático.
   */
  reset() {
    this.currentSentenceIndex$.next(-1);
    this.currentWordIndex$.next(-1);
    this.currentBlockIndex$.next(-1);
    this.stopAutoAdvance();
  }

  /**
   * Devuelve las variables CSS de estilos basándose en las preferencias actuales.
   */
  getHighlightCssVars(): any {
    const colorMap: Record<string, { r: number; g: number; b: number }> = {
      yellow: { r: 234, g: 179, b: 8 },
      blue: { r: 59, g: 130, b: 246 },
      green: { r: 34, g: 197, b: 94 },
      orange: { r: 249, g: 115, b: 22 },
      gray: { r: 156, g: 163, b: 175 }
    };
    
    const intensityMap: Record<string, { norm: number; strong: number }> = {
      soft: { norm: 0.15, strong: 0.25 },
      medium: { norm: 0.25, strong: 0.4 },
      high: { norm: 0.35, strong: 0.55 }
    };

    const textSizeMap: Record<string, string> = {
      small: '15px',
      normal: '18px',
      large: '22px',
      xlarge: '28px'
    };

    const lineSpacingMap: Record<string, string> = {
      normal: '1.7',
      wide: '2.2',
      xwide: '2.8'
    };

    const letterSpacingMap: Record<string, string> = {
      normal: '0',
      wide: '0.05em'
    };

    const readingWidthMap: Record<string, string> = {
      narrow: '550px',
      normal: '750px',
      wide: '950px'
    };

    const colorKey = this.highlightColor$.value;
    const intensityKey = this.highlightIntensity$.value;
    const color = colorMap[colorKey] || colorMap['yellow'];
    const intensity = intensityMap[intensityKey] || intensityMap['medium'];

    return {
      '--ar-highlight': `rgba(${color.r}, ${color.g}, ${color.b}, ${intensity.norm})`,
      '--ar-highlight-strong': `rgba(${color.r}, ${color.g}, ${color.b}, ${intensity.strong})`,
      '--ar-dim-opacity': '0.35',
      '--ar-line-spacing': lineSpacingMap[this.lineSpacing$.value] || '1.7',
      '--ar-letter-spacing': letterSpacingMap[this.letterSpacing$.value] || '0',
      '--ar-reading-width': readingWidthMap[this.readingWidth$.value] || '750px',
      '--ar-text-size': textSizeMap[this.textSize$.value] || '18px'
    };
  }

  /**
   * Limpia los recursos (como temporizadores).
   */
  destroy() {
    this.stopAutoAdvance();
  }
}
