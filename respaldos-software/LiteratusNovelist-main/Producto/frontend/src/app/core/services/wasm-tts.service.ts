import { Injectable } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WasmTtsService {
  private worker: Worker | null = null;
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  public isInitialized = false;

  private playbackEndedSubject = new Subject<void>();
  public playbackEnded$ = this.playbackEndedSubject.asObservable();

  private statusSubject = new Subject<string>();
  public status$ = this.statusSubject.asObservable();

  private progressSubject = new BehaviorSubject<number>(0);
  public progress$ = this.progressSubject.asObservable();

  private isDownloadingSubject = new BehaviorSubject<boolean>(false);
  public isDownloading$ = this.isDownloadingSubject.asObservable();

  private wordIndexSubject = new BehaviorSubject<number>(-1);
  public currentWordIndex$ = this.wordIndexSubject.asObservable();

  private textQueue: { text: string, baseWordIdx: number, wordCount: number }[] = [];
  private readyAudioQueue: { samples: Float32Array, sampleRate: number, baseWordIdx: number, wordCount: number }[] = [];
  
  public selectedVoiceModel = 'Xenova/piper-es_ES-sharvard-medium';
  private karaokeInterval: any;
  
  private isPlaying = false;
  private isGenerating = false;
  private isPlayingAudio = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('../workers/sherpa-tts.worker', import.meta.url), { type: 'module' });
      
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'INIT_SUCCESS') {
          this.isInitialized = true;
          this.isDownloadingSubject.next(false);
          this.statusSubject.next('Modelo cargado. Listo.');
          this.generateNext();
        } else if (data.type === 'AUDIO_READY') {
          this.isGenerating = false;
          
          if (this.pendingGeneration) {
            this.readyAudioQueue.push({ 
              samples: data.audio, 
              sampleRate: data.sampleRate,
              baseWordIdx: this.pendingGeneration.baseWordIdx,
              wordCount: this.pendingGeneration.wordCount
            });
            this.pendingGeneration = null;
          }
          
          this.playNext(); // Se llamará cuando implementemos la cola completa
          this.generateNext(); 
        } else if (data.type === 'STATUS') {
          this.statusSubject.next(data.message);
          if (data.message.includes('Descargando')) {
            this.isDownloadingSubject.next(true);
          }
        } else if (data.type === 'PROGRESS') {
          if (data.progress && data.progress.progress) {
             this.progressSubject.next(Math.round(data.progress.progress));
          }
        } else if (data.type === 'ERROR') {
          console.error('WasmTTS Chunk Error:', data.error);
          this.statusSubject.next('Error en fragmento, saltando...');
          this.isGenerating = false;
          this.generateNext(); // Saltar al siguiente si hay error
        } else if (data.type === 'INIT_ERROR') {
          console.error('WasmTTS Init Error:', data.error);
          this.statusSubject.next('Error de inicio: ' + data.error);
          this.isDownloadingSubject.next(false);
          this.isPlaying = false;
          this.playbackEndedSubject.next();
        }
      };

      // Inicializar el modelo (descarga/caché)
      this.statusSubject.next('Inicializando motor local (WASM)...');
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      this.worker.postMessage({ type: 'INIT', voiceModel: this.selectedVoiceModel, isMobile: isMobile });
    } else {
      console.error('Web Workers no soportados en este navegador.');
    }
  }

  public setVoice(modelId: string) {
    this.selectedVoiceModel = modelId;
    this.isInitialized = false;
    this.initWorker(); // Reinicia el worker con el nuevo modelo
  }

  public play(text: string, startWordIndex: number = 0) {
    if (!text.trim()) return;
    
    // Convertir el texto en oraciones respetando los índices reales
    const rawTokens = text.match(/[\wáéíóúüñ]+|[^\wáéíóúüñ]+/gi) || [];
    let currentBaseIdx = 0;
    
    let currentChunk = '';
    let currentChunkWordCount = 0;
    let chunkBaseIdx = startWordIndex; // El inicio del primer fragmento
    
    rawTokens.forEach(token => {
      const isWord = /[\wáéíóúüñ]/i.test(token);
      
      if ((currentChunk + token).length > 100 && currentChunk.trim()) {
        this.textQueue.push({ 
          text: currentChunk.trim(), 
          baseWordIdx: chunkBaseIdx, 
          wordCount: currentChunkWordCount 
        });
        currentChunk = '';
        chunkBaseIdx = startWordIndex + currentBaseIdx;
        currentChunkWordCount = 0;
      }
      
      currentChunk += token;
      if (isWord) {
        currentBaseIdx++;
        currentChunkWordCount++;
      }
    });

    if (currentChunk.trim()) {
      this.textQueue.push({ 
        text: currentChunk.trim(), 
        baseWordIdx: chunkBaseIdx, 
        wordCount: currentChunkWordCount 
      });
    }

    console.log(`[WasmTTS] Total de fragmentos generados para este capítulo: ${this.textQueue.length}`);

    this.isPlaying = true;
    if (this.isInitialized) {
      this.generateNext();
    }
  }

  private pendingGeneration: { text: string, baseWordIdx: number, wordCount: number } | null = null;

  private generateNext() {
    if (this.isGenerating || this.textQueue.length === 0) {
      return;
    }

    this.isGenerating = true;
    const chunk = this.textQueue.shift()!;
    this.pendingGeneration = chunk;
    this.worker?.postMessage({ type: 'GENERATE', text: chunk.text });
  }

  private playNext() {
    if (this.isPlayingAudio) {
      return; // Ya hay un audio reproduciéndose
    }

    if (this.readyAudioQueue.length === 0) {
      // Si no hay audios listos, y tampoco hay texto por generar, terminamos
      if (this.textQueue.length === 0 && !this.isGenerating && this.isPlaying) {
        this.isPlaying = false;
        this.playbackEndedSubject.next();
      }
      return;
    }

    this.isPlayingAudio = true;
    const audioData = this.readyAudioQueue.shift()!;
    this.playAudioBuffer(audioData.samples, audioData.sampleRate, audioData.baseWordIdx, audioData.wordCount);
  }

  private playAudioBuffer(samples: Float32Array, sampleRate: number, baseWordIdx: number, wordCount: number) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const buffer = this.audioCtx.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);

      this.currentSource = this.audioCtx.createBufferSource();
      this.currentSource.buffer = buffer;
      this.currentSource.connect(this.audioCtx.destination);
      
      const duration = buffer.duration;
      const timePerWord = duration / Math.max(1, wordCount);
      
      let wordsPlayed = 0;
      this.wordIndexSubject.next(baseWordIdx);
      
      this.stopKaraokeLoop();
      this.karaokeInterval = setInterval(() => {
        wordsPlayed++;
        if (wordsPlayed < wordCount) {
          this.wordIndexSubject.next(baseWordIdx + wordsPlayed);
        }
      }, timePerWord * 1000);

      this.currentSource.onended = () => {
        this.stopKaraokeLoop();
        this.isPlayingAudio = false;
        this.playNext(); // Reproducir el siguiente de la cola
      };

      this.currentSource.start(0);
    } catch (err) {
      console.error('Error al reproducir buffer WasmTTS:', err);
      this.stopKaraokeLoop();
      this.isPlayingAudio = false;
      this.playNext();
    }
  }

  private stopKaraokeLoop() {
    if (this.karaokeInterval) {
      clearInterval(this.karaokeInterval);
      this.karaokeInterval = null;
    }
  }

  public pause() {
    if (this.audioCtx && this.audioCtx.state === 'running') {
      this.audioCtx.suspend();
    }
  }

  public resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public stop() {
    this.textQueue = [];
    this.readyAudioQueue = [];
    this.isPlaying = false;
    this.isGenerating = false;
    this.isPlayingAudio = false;
    this.pendingGeneration = null;
    this.wordIndexSubject.next(-1);
    this.stopKaraokeLoop();
    
    if (this.currentSource) {
      this.currentSource.onended = null;
      try { this.currentSource.stop(); } catch(e) {}
      this.currentSource.disconnect();
      this.currentSource = null;
    }
    this.playbackEndedSubject.next();
  }
}
