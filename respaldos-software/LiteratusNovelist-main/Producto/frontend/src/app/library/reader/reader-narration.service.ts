import { Injectable, OnDestroy, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Observable, Subject, filter, merge } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { AudioService } from '../../core/services/audio.service';
import { NativeTtsService } from '../../core/services/native-tts.service';
import { WasmTtsService } from '../../core/services/wasm-tts.service';
import { environment } from '../../../environments/environment';

/** Voz estándar del navegador, voz neural (Azure), modelo local (WASM) o voz del teléfono (app). */
export type NarrationMode = 'native' | 'pro' | 'wasm' | 'native-android';

/** Voz de Azure que el lector puede elegir (GET library/inventory/narration-voices/). */
export interface NarratorVoice {
  id: string;      // p. ej. 'es-CL-CatalinaNeural'
  name: string;    // 'Catalina'
  detail: string;  // 'Chile · mujer'
}

/** Lo que se narra: el capítulo abierto, desde una palabra. */
export interface NarrationRequest {
  inventoryId: string;
  chapter: { id?: string | number; order?: number } | undefined;
  /** Número del capítulo en el lector (respaldo de `chapter.order` para los MP3 antiguos). */
  chapterNumber: number;
  text: string;
  startWord: number;
  bookSlug: string;
  /** Título, libro y portada para la pantalla bloqueada (Media Session). */
  media: { title: string; artist: string; artwork: string | null };
}

const POLL_MS = 2000;   // el servidor guarda el avance de la voz neural cada segundo
const MAX_POLLS = 300;  // ~10 minutos

/**
 * La narración del lector: qué voz se usa, cómo se reproduce cada una y los avisos mientras el
 * servidor prepara la voz neural. El lector decide desde qué palabra se narra (la página a la
 * vista, la palabra marcada) y sigue `word$` para resaltar y pasar de página.
 *
 * Se provee en ReaderComponent: con el lector se va también cualquier consulta pendiente.
 */
@Injectable()
export class ReaderNarrationService implements OnDestroy {
  private readonly api = inject(ApiService);
  readonly audio = inject(AudioService);
  readonly wasm = inject(WasmTtsService);
  readonly nativeTts = inject(NativeTtsService);

  /** Solo dentro de la app (Capacitor) existe la voz del teléfono; en un navegador no sonaba. */
  readonly isNativeApp = Capacitor.isNativePlatform();
  /** Modelo de la voz local (WASM): MMS en español; Piper no tiene versión web oficial. */
  readonly wasmVoices = [{ id: 'Xenova/mms-tts-spa', name: 'MMS Español (Meta) - Pesado' }];

  mode: NarrationMode = 'pro';
  voices: NarratorVoice[] = [];
  voice = '';
  /** Esperando la voz neural (el servidor la genera la primera vez) o el audio. */
  isLoading = false;
  /** Aviso visible: progreso de la voz neural o por qué no está disponible. */
  notice = '';

  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;
  private readonly cleared$ = new Subject<number>();

  /** Palabra que va leyendo la voz activa; -1 cuando se detiene o el audio no trae tiempos. */
  readonly word$: Observable<number> = merge(
    this.audio.currentWordIndex$.pipe(filter(() => this.mode === 'native' || this.mode === 'pro')),
    this.wasm.currentWordIndex$.pipe(filter(() => this.mode === 'wasm')),
    this.nativeTts.currentWordIndex$.pipe(filter(() => this.mode === 'native-android')),
    this.cleared$,
  );
  /** La voz terminó el capítulo (voz estándar y neural). */
  readonly chapterEnd$ = this.audio.chapterEnd$;

  get isPlaying(): boolean {
    return this.mode === 'native-android' ? this.nativeTts.isSpeaking$.value : this.audio.isPlaying;
  }

  /** Pausada y lista para "Reanudar" (la voz del teléfono no sabe pausar: se detiene). */
  get isPaused(): boolean {
    return this.mode !== 'native-android' && this.audio.isPaused;
  }

  /** Para el botón flotante: sonando, según la voz activa. */
  get playing$(): Observable<boolean> {
    return this.mode === 'native-android' ? this.nativeTts.isSpeaking$ : this.audio.isPlaying$;
  }

  /** Hay narración en curso, en pausa o preparándose (cambiar de capítulo la detiene). */
  get isBusy(): boolean {
    return this.isLoading || this.audio.isPlaying || this.audio.isPaused || this.nativeTts.isSpeaking$.value;
  }

  /** Voz y velocidad elegidas antes; sin elección previa se parte con la voz neural. */
  loadPrefs(): void {
    const savedMode = localStorage.getItem('reader-audio-mode');
    if (savedMode === 'native' || savedMode === 'pro' || savedMode === 'wasm') this.mode = savedMode;

    const savedSpeed = parseFloat(localStorage.getItem('reader-audio-speed') || '');
    if (!isNaN(savedSpeed)) this.audio.setSpeed(savedSpeed);

    this.api.get<{ default: string; voices: NarratorVoice[] }>('library/inventory/narration-voices/').subscribe({
      next: res => {
        this.voices = res.voices || [];
        const saved = localStorage.getItem('reader-narrator-voice');
        this.voice = this.voices.some(v => v.id === saved) ? saved! : res.default;
      },
      error: () => {}, // sin la lista se narra con la voz predeterminada del servidor
    });
  }

  setMode(mode: NarrationMode): void {
    if (this.mode !== mode) {
      this.stop();
      this.mode = mode;
    }
    localStorage.setItem('reader-audio-mode', mode);
  }

  /** Cambia la voz neural. Devuelve true si estaba narrando con ella: hay que retomar con la nueva. */
  setVoice(voiceId: string): boolean {
    if (voiceId === this.voice) return false;
    this.voice = voiceId;
    localStorage.setItem('reader-narrator-voice', voiceId);
    const restart = this.mode === 'pro' && (this.isPlaying || this.isLoading);
    if (restart) this.stop();
    return restart;
  }

  setSpeed(rate: number): void {
    this.audio.setSpeed(rate);
    localStorage.setItem('reader-audio-speed', String(this.audio.playbackRate));
  }

  play(req: NarrationRequest): void {
    this.stop(); // que nunca hablen dos voces a la vez
    if (this.mode === 'native') {
      this.audio.playNative(req.text, req.startWord);
    } else if (this.mode === 'wasm') {
      this.audio.playWasm(req.text, req.startWord);
    } else if (this.mode === 'native-android') {
      this.nativeTts.speak(req.text, req.startWord);
    } else {
      this.playNeural(req);
    }
  }

  pause(): void {
    if (this.mode === 'native-android') this.nativeTts.stop();
    else this.audio.pause();
  }

  /** Sigue donde quedó. La voz del teléfono vuelve a empezar desde `startWord`. */
  resume(text: string, startWord: number): void {
    if (this.mode === 'native-android') this.nativeTts.speak(text, Math.max(0, startWord));
    else this.audio.resume();
  }

  /** Lleva la voz neural a una palabra (tocarla en el texto). */
  seekToWord(wordIdx: number, text: string): void {
    if (this.mode === 'pro') this.audio.seekToWord(wordIdx, text);
  }

  stop(): void {
    this.cancelRequest();
    this.isLoading = false;
    this.notice = '';
    this.audio.stop();
    this.nativeTts.stop();
  }

  ngOnDestroy(): void {
    this.stop();
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
  }

  /**
   * Voz neural: el servidor graba el capítulo una sola vez para todos los lectores. Si todavía
   * no existe, se consulta cada pocos segundos hasta que esté (con el avance en el aviso).
   */
  private playNeural(req: NarrationRequest): void {
    const chapterId = req.chapter?.id;
    if (!chapterId || !req.inventoryId) {
      this.playLegacyRecording(req);
      return;
    }
    const requestId = this.requestId;
    const url = `library/inventory/${req.inventoryId}/chapters/${chapterId}/narration/`;
    const body = this.voice ? { voice: this.voice } : {};
    let polls = 0;
    this.isLoading = true;

    const request = () => {
      this.api.post<any>(url, body).subscribe({
        next: res => {
          if (requestId !== this.requestId) return; // se detuvo o cambió de capítulo mientras tanto
          if (res.status === 'generating') {
            if (++polls > MAX_POLLS) {
              this.isLoading = false;
              this.showNotice('La narración está tardando más de lo normal. Intenta de nuevo en unos minutos.', 7000);
              return;
            }
            this.showNotice(`🎙️ Preparando la narración del capítulo… ${Math.round((res.progress || 0) * 100)}%`);
            this.pollTimer = setTimeout(request, POLL_MS);
            return;
          }
          this.notice = '';
          this.audio.mediaInfo = req.media;
          this.audio.playRecorded(res.audio_url, res.alignment, req.startWord).subscribe({
            next: () => this.isLoading = false,
            error: err => {
              console.error('Error reproduciendo la narración:', err);
              this.fallBackToStandard('No se pudo reproducir la narración. Usa la voz estándar.', 6000);
            },
          });
        },
        error: err => {
          if (requestId !== this.requestId) return;
          this.isLoading = false;
          const reason = err?.error || {};
          if (reason.reason === 'not_configured') {
            this.notice = '';
            this.playLegacyRecording(req);
            return;
          }
          this.fallBackToStandard(reason.message || 'La voz neural no está disponible ahora. Usa la voz estándar.', 7000);
        },
      });
    };
    request();
  }

  /** MP3 antiguos de tres libros; solo se usan si el servidor no tiene la voz neural configurada. */
  private playLegacyRecording(req: NarrationRequest): void {
    const backendUrl = environment.apiUrl.split('/api/v1/')[0];
    // El orden real del capítulo en la base, no su posición en el lector
    const order = String(req.chapter?.order ?? req.chapterNumber).padStart(2, '0');
    const slug = req.bookSlug || '';
    const folder = slug.includes('jekyll') ? 'El_extraño_caso'
      : slug.includes('principito') ? 'principito'
      : slug.includes('principe') ? 'Principe_Feliz'
      : '';
    if (!folder) {
      this.fallBackToStandard('La voz neural no está disponible en este servidor. Usa la voz estándar.', 6000);
      return;
    }
    this.isLoading = true;
    this.audio.mediaInfo = req.media;
    this.audio.playRecorded(`${backendUrl}/media/audio_narrations/${folder}/Capitulo_${order}.mp3`).subscribe({
      next: () => {
        this.isLoading = false;
        this.cleared$.next(-1); // estos MP3 no traen tiempos por palabra: no se resalta nada
      },
      error: () => this.fallBackToStandard('Audio no disponible para este capítulo. Usa la voz estándar.', 6000),
    });
  }

  private fallBackToStandard(message: string, hideAfterMs: number): void {
    this.isLoading = false;
    this.showNotice(message, hideAfterMs);
    this.mode = 'native';
  }

  private showNotice(message: string, hideAfterMs = 0): void {
    this.notice = message;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = hideAfterMs ? setTimeout(() => this.notice = '', hideAfterMs) : null;
  }

  private cancelRequest(): void {
    this.requestId++;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }
}
