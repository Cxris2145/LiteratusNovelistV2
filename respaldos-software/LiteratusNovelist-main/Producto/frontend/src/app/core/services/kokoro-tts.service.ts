import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AudioCacheService } from './audio-cache.service';

export interface KokoroSentence {
  text: string;
  baseWordIdx: number;
  wordCount: number;
  sentenceIdx: number;
}

@Injectable({ providedIn: 'root' })
export class KokoroTtsService {

  // ── Estado público ────────────────────────────────────────────────────
  isSpeaking$ = new BehaviorSubject<boolean>(false);
  isProcessing$ = new BehaviorSubject<boolean>(false); // Indica si está generando (remoto o local)
  isDownloadingModel$ = new BehaviorSubject<boolean>(false); // Indica si está descargando modelo ONNX
  downloadProgress$ = new BehaviorSubject<number>(0); // 0 a 100
  
  engineMode$ = new BehaviorSubject<'remote' | 'local'>('remote');
  isMuted$ = new BehaviorSubject<boolean>(false); // Global Mute

  currentSentenceIdx$ = new BehaviorSubject<number>(-1);
  currentWordIndex$ = new BehaviorSubject<number>(-1);
  error$ = new BehaviorSubject<string | null>(null);

  // ── Estado interno ────────────────────────────────────────────────────
  remoteVoices = [
    { id: 'ef_dora', name: 'Dora (Femenina España)' },
    { id: 'em_alex', name: 'Alex (Masculino España)' },
    { id: 'em_santa', name: 'Santa (Masculino España)' }
  ];

  localVoices = [
    { id: 'af_bella', name: 'Bella (Femenina USA)' },
    { id: 'af_nicole', name: 'Nicole (Femenina USA)' },
    { id: 'am_adam', name: 'Adam (Masculino USA)' },
    { id: 'bf_emma', name: 'Emma (Femenina UK)' }
  ];

  get kokoroVoices() {
    return this.engineMode$.value === 'remote' ? this.remoteVoices : this.localVoices;
  }

  selectedVoiceId = 'ef_dora';

  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;

  private audioQueue: Array<{ buffer: AudioBuffer; sentence: KokoroSentence }> = [];
  private fetchPromises: Promise<void>[] = [];

  private isStopped = false;
  private isPlayingQueue = false;
  private isPaused = false;
  private avatarId: string | number | null = null;

  // Estado de reproducción para Pause/Resume y Karaoke
  private currentBuffer: AudioBuffer | null = null;
  private currentSentence: KokoroSentence | null = null;
  private playbackStartTime: number = 0; 
  private playbackOffset: number = 0; // Tiempo pausado acumulado
  private karaokeInterval: any = null;
  
  private currentSpeakId = 0;
  private overrideVoiceId: string | null = null;

  // Instancia Local de KokoroTTS (cargada dinámicamente)
  private ttsInstance: any = null;
  private audioCache = inject(AudioCacheService);
  
  constructor() {
    const savedMode = localStorage.getItem('kokoro-engine-mode') as 'remote' | 'local';
    if (savedMode === 'local') {
      // Si el usuario tenía "local" guardado, iniciamos la descarga en background sin bloquear
      this.engineMode$.next('local');
      this.downloadLocalEngine().catch(err => console.error("Fallo auto-load local:", err));
    }

    const savedMute = localStorage.getItem('literatus_tts_muted');
    if (savedMute === 'true') {
      this.isMuted$.next(true);
    }
  }

  toggleMute() {
    const newMute = !this.isMuted$.value;
    this.isMuted$.next(newMute);
    localStorage.setItem('literatus_tts_muted', newMute ? 'true' : 'false');
    if (newMute) {
      this.stop();
    }
  }

  // ── API Pública ───────────────────────────────────────────────────────

  /**
   * Permite cambiar manualmente al modo local y descargarlo
   */
  async downloadLocalEngine(): Promise<void> {
    if (this.ttsInstance) {
      this.engineMode$.next('local');
      localStorage.setItem('kokoro-engine-mode', 'local');
      return;
    }

    this.isDownloadingModel$.next(true);
    this.downloadProgress$.next(0);
    this.error$.next(null);

    try {
      // Import dinámico para no bloat el app si usan 'remote'
      const { KokoroTTS } = await import('kokoro-js');
      
      // Detectar si el navegador soporta WebGPU para aceleración gráfica
      const deviceType = (navigator as any).gpu ? 'webgpu' : 'wasm';
      
      this.ttsInstance = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device: deviceType,
        progress_callback: (info: any) => {
          if (info.status === 'progress' && info.total) {
             const percent = Math.round((info.loaded / info.total) * 100);
             this.downloadProgress$.next(percent);
          } else if (info.status === 'done') {
             this.downloadProgress$.next(100);
          }
        }
      });
      
      this.engineMode$.next('local');
      localStorage.setItem('kokoro-engine-mode', 'local');
      this.selectedVoiceId = 'af_bella'; // Auto-switch a una voz local válida
      
    } catch (err) {
      console.error("[KokoroTTS] Error descargando modelo local:", err);
      this.error$.next("Error al instalar motor local. Volviendo a modo remoto.");
      this.setRemoteEngine();
    } finally {
      this.isDownloadingModel$.next(false);
    }
  }

  setRemoteEngine() {
    this.engineMode$.next('remote');
    localStorage.setItem('kokoro-engine-mode', 'remote');
    this.selectedVoiceId = 'ef_dora'; // Auto-switch a voz remota válida
  }

  async speak(fullText: string, avatarId: string | number | null, startWordIdx: number = 0, voiceId?: string): Promise<void> {
    if (this.isMuted$.value) return;

    this.currentSpeakId++;
    const mySpeakId = this.currentSpeakId;
    
    // Detenemos cualquier audio anterior y limpiamos la cola inmediatamente
    this.stop();
    this.overrideVoiceId = voiceId || null;
    this.isStopped = false;
    this.avatarId = avatarId;
    this.error$.next(null);

    const allSentences = this.buildSentences(fullText);
    if (allSentences.length === 0) return;

    const startIndex = allSentences.findIndex(s => s.baseWordIdx + s.wordCount > startWordIdx);
    const sentences = startIndex >= 0 ? allSentences.slice(startIndex) : allSentences;

    if (sentences.length === 0) return;

    this.isProcessing$.next(true);

    const firstBuffer = await this.fetchAudioBuffer(sentences[0]);
    if (this.isStopped || this.currentSpeakId !== mySpeakId) {
       this.isProcessing$.next(false);
       return;
    }

    this.isProcessing$.next(false);
    this.isSpeaking$.next(true);

    if (firstBuffer) {
      this.audioQueue.push(firstBuffer);
      this.playNextInQueue();
    }

    this.prefetchPipeline(sentences.slice(1), mySpeakId);
  }

  stop(): void {
    this.isStopped = true;
    this.isPlayingQueue = false;
    this.isPaused = false;
    this.audioQueue = [];
    this.fetchPromises = [];
    this.avatarId = null;

    this.stopCurrentAudio();

    this.isSpeaking$.next(false);
    this.isProcessing$.next(false);
    this.currentSentenceIdx$.next(-1);
    this.currentWordIndex$.next(-1);
  }

  pause(): void {
    if (!this.isPlayingQueue || this.isPaused || !this.currentSource || !this.audioCtx) return;
    
    this.isPaused = true;
    this.isSpeaking$.next(false);
    
    this.playbackOffset += this.audioCtx.currentTime - this.playbackStartTime;
    
    try { this.currentSource.stop(); } catch (_) {}
    this.currentSource.onended = null;
    this.currentSource = null;
    
    this.stopKaraokeLoop();
  }

  resume(): void {
    if (!this.isPlayingQueue || !this.isPaused || !this.currentBuffer || !this.audioCtx) return;
    
    this.isPaused = false;
    this.isSpeaking$.next(true);
    
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    this.playbackStartTime = this.audioCtx.currentTime;
    
    this.currentSource = this.audioCtx.createBufferSource();
    this.currentSource.buffer = this.currentBuffer;
    this.currentSource.connect(this.audioCtx.destination);
    
    this.currentSource.onended = () => {
      if (!this.isStopped && !this.isPaused) {
        this.playNextInQueue();
      }
    };

    this.currentSource.start(0, this.playbackOffset);
    this.startKaraokeLoop();
  }

  // ── Lógica interna ────────────────────────────────────────────────────

  setVoice(voiceId: string) {
    this.selectedVoiceId = voiceId;
  }

  private stopCurrentAudio() {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch (_) {}
      this.currentSource.onended = null;
      this.currentSource = null;
    }
    this.currentBuffer = null;
    this.currentSentence = null;
    this.stopKaraokeLoop();
  }

  private async prefetchPipeline(sentences: KokoroSentence[], speakId: number): Promise<void> {
    const BATCH_SIZE = 1; 
    for (let i = 0; i < sentences.length; i += BATCH_SIZE) {
      if (this.isStopped || this.currentSpeakId !== speakId) return;

      const batch = sentences.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map(s => this.fetchAudioBuffer(s))
      );

      for (const result of results) {
        if (this.isStopped || this.currentSpeakId !== speakId) return;
        if (result) {
          this.audioQueue.push(result);
          if (!this.isPlayingQueue) {
            this.playNextInQueue();
          }
        }
      }
    }
  }

  private playNextInQueue(): void {
    if (this.isStopped || this.isPaused) return;

    this.stopCurrentAudio();

    if (this.audioQueue.length === 0) {
      this.isPlayingQueue = false;
      this.isSpeaking$.next(false);
      this.currentSentenceIdx$.next(-1);
      this.currentWordIndex$.next(-1);
      return;
    }

    this.isPlayingQueue = true;
    if (!this.isSpeaking$.value) {
      this.isSpeaking$.next(true);
    }
    const item = this.audioQueue.shift()!;
    
    this.currentBuffer = item.buffer;
    this.currentSentence = item.sentence;
    this.playbackOffset = 0;
    
    this.currentSentenceIdx$.next(item.sentence.sentenceIdx);
    this.currentWordIndex$.next(item.sentence.baseWordIdx);

    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    this.playbackStartTime = this.audioCtx.currentTime;

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.currentBuffer;
    source.connect(this.audioCtx.destination);
    this.currentSource = source;

    source.onended = () => {
      if (!this.isStopped && !this.isPaused) {
        this.playNextInQueue();
      }
    };

    source.start(0);
    this.startKaraokeLoop();
  }

  private startKaraokeLoop() {
    this.stopKaraokeLoop();
    
    this.karaokeInterval = setInterval(() => {
      if (this.isStopped || this.isPaused || !this.currentSentence || !this.currentBuffer || !this.audioCtx) return;
      
      const elapsedTime = (this.audioCtx.currentTime - this.playbackStartTime) + this.playbackOffset;
      const totalTime = this.currentBuffer.duration;
      
      let progress = Math.min(1, elapsedTime / totalTime);
      
      const words = this.currentSentence.text.split(/\s+/).filter(w => w.length > 0);
      const totalChars = words.reduce((sum, w) => sum + w.length, 0);
      
      let accumulatedChars = 0;
      let targetWordLocalIdx = 0;
      
      for (let i = 0; i < words.length; i++) {
         const wordCharWeight = words[i].length / totalChars;
         const wordEndProgress = accumulatedChars / totalChars + wordCharWeight;
         
         if (progress <= wordEndProgress || i === words.length - 1) {
             targetWordLocalIdx = i;
             break;
         }
         accumulatedChars += words[i].length;
      }

      this.currentWordIndex$.next(this.currentSentence.baseWordIdx + targetWordLocalIdx);
      
    }, 50);
  }

  private stopKaraokeLoop() {
    if (this.karaokeInterval) {
      clearInterval(this.karaokeInterval);
      this.karaokeInterval = null;
    }
  }

  private async fetchAudioBuffer(
    sentence: KokoroSentence,
    retries = 3
  ): Promise<{ buffer: AudioBuffer; sentence: KokoroSentence } | null> {
    if (!sentence.text.trim() || this.isStopped) return null;

    const useLocal = this.engineMode$.value === 'local' && this.ttsInstance;
    const hfApiUrl = 'https://josuejheymi-kokoro-api.hf.space/v1/audio/speech';

    for (let attempt = 1; attempt <= retries; attempt++) {
      if (this.isStopped) return null;
      
      try {
        const textToSpeak = sentence.text.replace(/[*_\[\]]/g, '');
        const voiceId = (this.overrideVoiceId || this.selectedVoiceId);
        
        let audioBuffer: AudioBuffer;

        if (!this.audioCtx || this.audioCtx.state === 'closed') {
          this.audioCtx = new AudioContext();
        }

        // 1. Revisar Caché (IndexedDB)
        const cachedArrayBuffer = await this.audioCache.getAudio(voiceId, textToSpeak);
        if (cachedArrayBuffer) {
           audioBuffer = await this.audioCtx.decodeAudioData(cachedArrayBuffer);
           return { buffer: audioBuffer, sentence };
        }

        // 2. Si no hay caché, generarlo (Local o Remoto)
        if (useLocal) {
           // MODO LOCAL ONNX
           const rawAudio = await this.ttsInstance.generate(textToSpeak, {
             voice: voiceId,
             speed: 1.0
           });
           if (this.isStopped) return null;
           
           audioBuffer = this.audioCtx.createBuffer(1, rawAudio.audio.length, rawAudio.sampling_rate);
           audioBuffer.copyToChannel(rawAudio.audio, 0);
           
           // Nota: Caché de rawAudio a ArrayBuffer es complejo (Float32Array a WAV).
           // Por ahora, en local es tan rápido que no es crítico cachear en DB, 
           // pero el modo remoto sí.
        } else {
           // MODO REMOTO HF API
           const response = await fetch(hfApiUrl, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               model: "kokoro",
               input: textToSpeak.replace(/[áÁ]/g, 'a')
                                 .replace(/[éÉ]/g, 'e')
                                 .replace(/[íÍ]/g, 'i')
                                 .replace(/[óÓ]/g, 'o')
                                 .replace(/[úÚüÜ]/g, 'u'), 
               voice: voiceId, 
               response_format: "mp3",
               speed: 1.0
             })
           });

           if (!response.ok) throw new Error(`HF API error: ${response.status}`);
           if (this.isStopped) return null;

           const arrayBuffer = await response.arrayBuffer();
           
           // Guardar copia exacta en caché
           const bufferToCache = arrayBuffer.slice(0);
           this.audioCache.saveAudio(voiceId, textToSpeak, bufferToCache);

           audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        }

        return { buffer: audioBuffer, sentence };
        
      } catch (err) {
        console.warn(`[KokoroTTS] Error en frase ${useLocal ? '(LOCAL)' : '(REMOTO)'} (Intento ${attempt}/${retries}):`, err);
        
        // Fallback automático si estamos en local y falla
        if (useLocal && attempt === retries) {
          console.warn("[KokoroTTS] Falló local. Cambiando temporalmente a Remoto.");
          this.setRemoteEngine();
          // Reintentar esta misma frase en el modo remoto haciendo una recursión
          return this.fetchAudioBuffer(sentence, 2);
        }

        if (attempt === retries) return null;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    return null;
  }

  private buildSentences(text: string): KokoroSentence[] {
    const rawWords = text.split(/\s+/).filter(w => w.length > 0);
    const sentences: KokoroSentence[] = [];
    
    let currentWords: string[] = [];
    let baseIdx = 0;
    let sentenceIdxCounter = 0;
    
    for (let i = 0; i < rawWords.length; i++) {
      currentWords.push(rawWords[i]);
      
      const currentText = currentWords.join(' ');
      const isPunctuation = /[.!?¿¡"]$/.test(rawWords[i]);
      const isTooLong = currentText.length > 150 && /[,;]$/.test(rawWords[i]);
      const isExtremelyLong = currentText.length > 250; 
      
      if (isPunctuation || isTooLong || isExtremelyLong || i === rawWords.length - 1) {
        if (currentWords.length < 4 && i !== rawWords.length - 1 && !isExtremelyLong) {
          continue;
        }
        
        sentences.push({
          text: currentText,
          baseWordIdx: baseIdx,
          wordCount: currentWords.length,
          sentenceIdx: sentenceIdxCounter++
        });
        
        baseIdx += currentWords.length;
        currentWords = [];
      }
    }
    return sentences;
  }
}
