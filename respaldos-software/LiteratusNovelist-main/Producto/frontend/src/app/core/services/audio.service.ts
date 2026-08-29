import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { WasmTtsService } from './wasm-tts.service';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export interface AudioAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface SpanishVoice {
  name: string;
  lang: string;
  voice: SpeechSynthesisVoice;
}

export interface TextChunk {
  text: string;
  startCharIndex: number;
  wordOffset: number;
}

@Injectable({ providedIn: 'root' })
export class AudioService {
  private api = inject(ApiService);

  // ── Streams públicos ────────────────────────────────────────────
  private isPlayingSubject   = new BehaviorSubject<boolean>(false);
  isPlaying$ = this.isPlayingSubject.asObservable();
  get isPlaying(): boolean { return this.isPlayingSubject.getValue(); }

  private isPausedSubject    = new BehaviorSubject<boolean>(false);
  isPaused$ = this.isPausedSubject.asObservable();
  get isPaused(): boolean { return this.isPausedSubject.getValue(); }

  private wordIndexSubject   = new BehaviorSubject<number>(-1);
  currentWordIndex$ = this.wordIndexSubject.asObservable();

  /** Emite `true` cuando un capítulo termina de forma natural (no por stop) */
  chapterEnd$ = new Subject<void>();

  // ── Config ──────────────────────────────────────────────────────
  voices: SpanishVoice[] = [];
  selectedVoiceIndex: number = 0;
  playbackRate: number = 1.0;

  // ── Internos ────────────────────────────────────────────────────
  private utterance:   SpeechSynthesisUtterance | null = null;
  private proAudio:    HTMLAudioElement | null = null;
  private proAlign:    AudioAlignment | null = null;
  private currentMode: 'native' | 'pro' | 'wasm' = 'native';
  private lastCharIndex: number = 0;  // Para reanudar desde posición
  private currentText:   string = '';
  private nativeFallbackInterval: any = null;
  private textChunks: TextChunk[] = [];
  private currentChunkIndex: number = 0;
  private wasmTts = inject(WasmTtsService);

  constructor() {
    if (window.speechSynthesis) {
      this.loadVoices();
      window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }

    this.wasmTts.playbackEnded$.subscribe(() => {
      if (this.currentMode === 'wasm') {
        this.isPlayingSubject.next(false);
        this.wordIndexSubject.next(-1);
        this.chapterEnd$.next();
      }
    });
  }

  // ── Voces ────────────────────────────────────────────────────────
  private loadVoices() {
    if (!window.speechSynthesis) {
      this.voices = [];
      return;
    }
    const all = window.speechSynthesis.getVoices();
    let spanish = all.filter(v => v.lang.startsWith('es'));
    if (spanish.length === 0) spanish = all; // fallback

    this.voices = spanish.map(v => ({ name: v.name, lang: v.lang, voice: v }));

    // Auto-seleccionar Microsoft Laura o primera disponible
    const best = this.voices.findIndex(v =>
      v.name.toLowerCase().includes('laura')
    );
    this.selectedVoiceIndex = best >= 0 ? best : 0;
  }

  get selectedVoice(): SpeechSynthesisVoice | null {
    return this.voices[this.selectedVoiceIndex]?.voice ?? null;
  }

  setVoiceByIndex(index: number) {
    this.selectedVoiceIndex = index;
    // Si está reproduciendo, reiniciar desde la posición actual
    if (this.isPlayingSubject.getValue() && this.currentMode === 'native') {
      this.playNativeFrom(this.lastCharIndex);
    }
  }

  setSpeed(rate: number) {
    this.playbackRate = Math.min(2.0, Math.max(0.5, rate));
    // Aplicar en tiempo real
    if (this.currentMode === 'pro' && this.proAudio) {
      this.proAudio.playbackRate = this.playbackRate;
    }
    if (this.currentMode === 'native' && this.isPlayingSubject.getValue()) {
      // SpeechSynthesis no permite cambiar rate en vuelo → reiniciar desde posición guardada
      this.playNativeFrom(this.lastCharIndex);
    }
  }

  // ── MODO NATIVO ──────────────────────────────────────────────────
  playNative(text: string, startWordIndex: number = 0) {
    this.currentText = text;
    this.textChunks = this.buildChunks(text);

    if (startWordIndex > 0) {
      let startCharIdx = 0;
      for (const chunk of this.textChunks) {
        const wordsInChunk = chunk.text.split(/\s+/).filter(w => w.length > 0).length;
        if (startWordIndex >= chunk.wordOffset && startWordIndex < chunk.wordOffset + wordsInChunk) {
           const words = chunk.text.split(/(\s+)/);
           let localCharIdx = 0;
           let localWordCount = 0;
           const targetLocalWord = startWordIndex - chunk.wordOffset;
           for (let i = 0; i < words.length; i++) {
             if (words[i].trim().length > 0) {
               if (localWordCount === targetLocalWord) break;
               localWordCount++;
             }
             localCharIdx += words[i].length;
           }
           startCharIdx = chunk.startCharIndex + localCharIdx;
           break;
        }
      }
      this.lastCharIndex = startCharIdx;
      this.playNativeFrom(startCharIdx);
    } else {
      this.lastCharIndex = 0;
      this.playNativeFrom(0);
    }
  }

  private buildChunks(text: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    const regex = /([.?!,;:]\s+)/;
    const parts = text.split(regex);
    
    let currentChunkText = '';
    let startChar = 0;
    let wordOffset = 0;
    
    for (let i = 0; i < parts.length; i++) {
       currentChunkText += parts[i];
       const isDelimiter = regex.test(parts[i]);
       const isLast = i === parts.length - 1;
       
       if ((isDelimiter && currentChunkText.trim().length > 0) || isLast || currentChunkText.length > 150) {
          if (currentChunkText.trim().length === 0) continue;
          
          chunks.push({
            text: currentChunkText,
            startCharIndex: startChar,
            wordOffset: wordOffset
          });
          startChar += currentChunkText.length;
          wordOffset += currentChunkText.split(/\s+/).filter(w => w.length > 0).length;
          currentChunkText = '';
       }
    }
    
    if (currentChunkText.trim().length > 0) {
        chunks.push({
          text: currentChunkText,
          startCharIndex: startChar,
          wordOffset: wordOffset
        });
    }
    return chunks;
  }

  private playNativeFrom(fromChar: number) {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.clearNativeInterval();
    this.currentMode = 'native';

    this.currentChunkIndex = 0;
    for (let i = 0; i < this.textChunks.length; i++) {
       const chunk = this.textChunks[i];
       if (fromChar >= chunk.startCharIndex && fromChar < chunk.startCharIndex + chunk.text.length) {
          this.currentChunkIndex = i;
          break;
       }
    }

    if (this.currentChunkIndex >= this.textChunks.length) {
       this.handleChapterEnd();
       return;
    }

    this.playCurrentChunk(fromChar);
  }

  private playCurrentChunk(startCharOffsetForChunk: number = -1) {
    if (this.currentChunkIndex >= this.textChunks.length) {
      this.handleChapterEnd();
      return;
    }

    const chunk = this.textChunks[this.currentChunkIndex];
    let textToSpeak = chunk.text;
    let localFromChar = 0;

    if (startCharOffsetForChunk !== -1) {
       localFromChar = Math.max(0, startCharOffsetForChunk - chunk.startCharIndex);
       textToSpeak = chunk.text.substring(localFromChar);
    }

    const baseWordOffset = chunk.wordOffset + (localFromChar > 0 ? chunk.text.substring(0, localFromChar).split(/\s+/).filter(w => w.length > 0).length : 0);

    if (typeof SpeechSynthesisUtterance !== 'undefined') {
      let boundaryFired = false;
      let simulatedIdx = 0;

      this.utterance = new SpeechSynthesisUtterance(textToSpeak);
      this.utterance.lang  = this.selectedVoice?.lang ?? 'es-ES';
      this.utterance.rate  = this.playbackRate;
      if (this.selectedVoice) this.utterance.voice = this.selectedVoice;

      this.utterance.onboundary = (event: SpeechSynthesisEvent) => {
        boundaryFired = true;
        this.clearNativeInterval();
        
        this.lastCharIndex = chunk.startCharIndex + localFromChar + event.charIndex;

        const before = textToSpeak.substring(0, event.charIndex);
        const localIdx = before.split(/\s+/).filter(w => w.length > 0).length;
        this.wordIndexSubject.next(baseWordOffset + localIdx);
      };

      this.utterance.onstart = () => {
        this.isPlayingSubject.next(true);
        setTimeout(() => {
          if (!boundaryFired && !this.nativeFallbackInterval) {
            const currentWords = textToSpeak.split(/\s+/).filter(w => w.length > 0);
            const msPerWord = 1000 / (2.5 * this.playbackRate);
            this.nativeFallbackInterval = setInterval(() => {
              if (!this.isPausedSubject.getValue()) {
                if (simulatedIdx < currentWords.length) {
                  this.wordIndexSubject.next(baseWordOffset + simulatedIdx);
                  this.lastCharIndex = chunk.startCharIndex + localFromChar + (simulatedIdx * 5);
                  simulatedIdx++;
                }
              }
            }, msPerWord);
          }
        }, 500);
      };

      this.utterance.onend = () => {
        this.clearNativeInterval();
        if (this.isPausedSubject.getValue() || !this.isPlayingSubject.getValue()) {
           return; 
        }

        this.currentChunkIndex++;
        if (this.currentChunkIndex < this.textChunks.length) {
           this.playCurrentChunk(-1);
        } else {
           this.handleChapterEnd();
        }
      };

      this.utterance.onerror = (e) => {
        this.clearNativeInterval();
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('Speech synthesis error on chunk:', e);
          if (this.isPlayingSubject.getValue()) {
             this.currentChunkIndex++;
             this.playCurrentChunk(-1);
          }
        }
      };

      window.speechSynthesis.speak(this.utterance);
      
      // Fallback Chrome Android bug
      if (window.speechSynthesis.paused) {
         window.speechSynthesis.resume();
      }
    } else {
      // Fallback for native Android where Web Speech API doesn't exist
      console.warn("SpeechSynthesisUtterance not available. Please use Native mode.");
    }
  }

  private handleChapterEnd() {
     this.isPlayingSubject.next(false);
     this.wordIndexSubject.next(-1);
     this.lastCharIndex = 0;
     this.chapterEnd$.next();
  }

  private clearNativeInterval() {
     if (this.nativeFallbackInterval) {
        clearInterval(this.nativeFallbackInterval);
        this.nativeFallbackInterval = null;
     }
  }

  // ── MODO GRABADO (Reemplaza a PRO) ────────────────────────────────
  playRecorded(audioUrl: string, alignment?: AudioAlignment): Observable<any> {
    this.cancelAll();
    this.currentMode = 'pro'; 
    this.currentText = '';

    return new Observable(observer => {
      console.log('AudioService: Cargando audio desde:', audioUrl);
      this.proAudio = new Audio();
      this.proAudio.crossOrigin = 'anonymous';
      this.proAudio.src = audioUrl;
      this.proAudio.playbackRate = this.playbackRate;
      this.proAlign = alignment || null;

      this.proAudio.ontimeupdate = () => {
        if (this.proAudio && this.proAlign) {
          const currentTime = this.proAudio.currentTime;
          const starts = this.proAlign.character_start_times_seconds;
          
          // Encontrar el último carácter que haya empezado antes de currentTime
          let lastCharIdx = -1;
          for (let i = 0; i < starts.length; i++) {
            if (starts[i] <= currentTime) {
              lastCharIdx = i;
            } else {
              break;
            }
          }

          if (lastCharIdx !== -1) {
            // Mapear de carácter a palabra
            // El texto completo se puede reconstruir de proAlign.characters
            const fullText = this.proAlign.characters.join('');
            const textBefore = fullText.substring(0, lastCharIdx + 1);
            // Contar palabras (separadas por espacio)
            const wordIdx = textBefore.trim().split(/\s+/).length - 1;
            this.wordIndexSubject.next(wordIdx);
          }
        }
      };

      this.proAudio.oncanplaythrough = () => {
        console.log('AudioService: Audio listo para reproducir');
      };

      this.proAudio.onended = () => {
        this.isPlayingSubject.next(false);
        this.wordIndexSubject.next(-1);
        this.chapterEnd$.next();
      };

      this.proAudio.onerror = (e) => {
        console.error('AudioService Error:', this.proAudio?.error);
        observer.error(e);
      };

      this.proAudio.play().then(() => {
        this.isPlayingSubject.next(true);
        observer.next({ success: true });
        observer.complete();
      }).catch(err => {
        console.error('AudioService Play Exception:', err);
        observer.error(err);
      });
    });
  }

  seekToWord(wordIndex: number, fullText: string) {
    if (!this.proAudio || !this.proAlign) return;
    
    // Encontrar el índice del carácter donde empieza la palabra N
    const words = fullText.split(/\s+/);
    let charIdx = 0;
    for (let i = 0; i < wordIndex && i < words.length; i++) {
      charIdx += words[i].length + 1; // +1 por el espacio
    }

    const seekTime = this.proAlign.character_start_times_seconds[charIdx] ?? 0;
    this.proAudio.currentTime = seekTime;
    
    if (this.isPausedSubject.getValue()) {
      this.resume();
    }
  }

  // ── MODO WASM (Local Avanzado) ──────────────────────────────────
  playWasm(text: string) {
    this.cancelAll();
    this.currentMode = 'wasm';
    this.currentText = text;
    this.isPlayingSubject.next(true);
    this.wasmTts.play(text);
  }

  // ── Controles ────────────────────────────────────────────────────
  pause() {
    this.isPlayingSubject.next(false);
    this.isPausedSubject.next(true);  // ← marcar como PAUSADO (no detenido)

    if (this.currentMode === 'native') {
      // En navegadores como Chrome/Android, pause() y resume() nativos tienen bugs severos.
      // Es más seguro cancelar la cola por completo y luego reiniciar desde el índice guardado.
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      this.clearNativeInterval();
    } else if (this.currentMode === 'wasm') {
      this.wasmTts.pause();
    } else if (this.proAudio) {
      this.proAudio.pause();
    }
  }

  resume() {
    if (this.currentMode === 'native') {
      // Reanudar iniciando una nueva síntesis desde la última palabra conocida.
      this.playNativeFrom(this.lastCharIndex);
    } else if (this.currentMode === 'wasm') {
      this.wasmTts.resume();
    } else if (this.proAudio) {
      this.proAudio.play();
    }
    this.isPlayingSubject.next(true);
    this.isPausedSubject.next(false);
  }

  stop() {
    this.cancelAll();
    this.wordIndexSubject.next(-1);
    this.lastCharIndex = 0;
    this.isPausedSubject.next(false); // ← al detener, resetear estado
  }

  private cancelAll() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.clearNativeInterval();
    if (this.proAudio) {
      this.proAudio.pause();
      this.proAudio = null;
    }
    this.wasmTts.stop();
    this.isPlayingSubject.next(false);
  }
}
