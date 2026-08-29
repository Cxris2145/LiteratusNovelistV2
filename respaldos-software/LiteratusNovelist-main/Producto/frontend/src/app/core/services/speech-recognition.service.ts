import { Injectable, NgZone } from '@angular/core';
import { Subject, BehaviorSubject, Subscription } from 'rxjs';
import { KokoroTtsService } from './kokoro-tts.service';

// Tipos para la API nativa del navegador
declare var window: any;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

@Injectable({
  providedIn: 'root'
})
export class SpeechRecognitionService {
  private recognition: any;
  private isListeningSubject = new BehaviorSubject<boolean>(false);
  public isListening$ = this.isListeningSubject.asObservable();

  private transcriptSubject = new Subject<string>();
  public transcript$ = this.transcriptSubject.asObservable();

  private partialTranscriptSubject = new BehaviorSubject<string>('');
  public partialTranscript$ = this.partialTranscriptSubject.asObservable();

  private audioLevelSubject = new BehaviorSubject<number>(0);
  public audioLevel$ = this.audioLevelSubject.asObservable();

  private isHybridMode = false;
  private silenceTimer: any;
  private currentTranscript = '';

  // Audio Context variables para el visualizador
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animationFrameId: number = 0;

  private voiceSub: Subscription | null = null;
  private wasListeningBeforeVoice = false;

  constructor(
    private zone: NgZone,
    private kokoroVoice: KokoroTtsService
  ) {
    this.checkPlatform();
    this.initBrowserSpeechRecognition();
    this.setupVoiceSync();
  }

  private checkPlatform() {
    // Detectar si estamos en Capacitor / móvil
    if (window?.Capacitor?.isNativePlatform()) {
      this.isHybridMode = true;
      console.log('Entorno Híbrido/Nativo detectado (Capacitor). Placeholder activado.');
    } else {
      this.isHybridMode = false;
      console.log('Entorno de navegador estándar detectado.');
    }
  }

  private initBrowserSpeechRecognition() {
    if (!SpeechRecognition) {
      console.warn('Speech Recognition API no está soportada en este navegador.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'es-ES'; // Podría ser configurable

    this.recognition.onstart = () => {
      this.zone.run(() => {
        this.isListeningSubject.next(true);
      });
    };

    this.recognition.onresult = (event: any) => {
      this.zone.run(() => {
        // Mute por software: si la IA está procesando o hablando, ignoramos resultados (evita el eco)
        const isBusy = this.kokoroVoice.isProcessing$.value || this.kokoroVoice.isSpeaking$.value;
        if (isBusy) return;

        let interimTranscript = '';
        let finalTranscript = '';

        // BUGFIX: En Android, event.resultIndex puede reiniciarse o enviar todo el historial de nuevo.
        // Si sumamos (+=) al currentTranscript, se produce un crecimiento exponencial ("malo malo malo malo").
        // La solución es reconstruir TODO el texto final desde cero (índice 0) en cada evento.
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            // Reemplazar el interim en lugar de concatenar
            interimTranscript = event.results[i][0].transcript;
          }
        }

        this.currentTranscript = finalTranscript.trim();

        this.partialTranscriptSubject.next((this.currentTranscript + ' ' + interimTranscript).trim());
        this.resetSilenceTimer();
      });
    };

    this.recognition.onerror = (event: any) => {
      console.warn('Reconocimiento de voz:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
         this.stopListening();
      } else if (event.error === 'network') {
         console.error("Falla de red en Web Speech API. Navegadores como Brave pueden bloquear esto por defecto.");
      }
    };

    this.recognition.onend = () => {
      this.zone.run(() => {
        // En modo continuo, si se corta inesperadamente y deberíamos seguir escuchando, reiniciamos.
        if (this.isListeningSubject.value) {
            // Delay corto para evitar DOMException "recognition has already started"
            setTimeout(() => {
              if (this.isListeningSubject.value) {
                try {
                   this.recognition.start();
                } catch(e) {
                   console.warn("No se pudo reiniciar el reconocimiento", e);
                }
              }
            }, 300);
        } else {
           this.isListeningSubject.next(false);
           this.stopAudioVisualizer();
        }
      });
    };
  }

  private setupVoiceSync() {
    // Sincronización: silenciar el micrófono mientras Kokoro procesa o habla
    // Combinamos isProcessing$ e isSpeaking$ para abarcar todo el ciclo
    import('rxjs').then(({ combineLatest }) => {
      this.voiceSub = combineLatest([
        this.kokoroVoice.isProcessing$,
        this.kokoroVoice.isSpeaking$
      ]).subscribe(([isProc, isSpeak]) => {
        const isBusy = isProc || isSpeak;
        if (isBusy) {
          if (this.isListeningSubject.value) {
            this.wasListeningBeforeVoice = true;
            this.pauseListening();
          }
        } else {
          if (this.wasListeningBeforeVoice) {
            this.wasListeningBeforeVoice = false;
            // Mayor delay para asegurar que el eco de los parlantes se disipe
            setTimeout(() => this.resumeListening(), 1500); 
          }
        }
      });
    });
  }

  public toggleListening() {
    if (this.isListeningSubject.value) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  public async startListening() {
    if (this.isHybridMode) {
      this.startNativeListening();
      return;
    }

    if (!this.recognition) return;
    
    this.currentTranscript = '';
    this.partialTranscriptSubject.next('');
    this.isListeningSubject.next(true); // Evitar onend restart bug

    try {
      if (!this.mediaStream) {
        await this.startAudioVisualizer();
      }
      this.recognition.start();
      this.resetSilenceTimer();
    } catch (e) {
      console.warn("Recognition ya había iniciado", e);
    }
  }

  public stopListening() {
    if (this.isHybridMode) {
      this.stopNativeListening();
      return;
    }

    this.isListeningSubject.next(false);
    
    if (this.recognition) {
      this.recognition.stop();
    }
    this.clearSilenceTimer();
    this.stopAudioVisualizer();
    
    if (this.currentTranscript.trim()) {
      this.transcriptSubject.next(this.currentTranscript.trim());
      this.currentTranscript = '';
      this.partialTranscriptSubject.next('');
    }
  }

  private pauseListening() {
     this.isListeningSubject.next(false);
     if (this.recognition) {
         this.recognition.stop();
     }
  }

  private resumeListening() {
      this.startListening();
  }

  private resetSilenceTimer() {
    this.clearSilenceTimer();
    // 2 segundos de pausa envían el mensaje
    this.silenceTimer = setTimeout(() => {
      this.zone.run(() => {
        let textToSend = this.currentTranscript.trim();
        
        // Si hay resultados intermedios atascados, los forzamos a enviarse
        if (!textToSend && this.partialTranscriptSubject.value) {
          textToSend = this.partialTranscriptSubject.value.trim();
        }

        if (textToSend) {
          this.transcriptSubject.next(textToSend);
          this.currentTranscript = '';
          this.partialTranscriptSubject.next('');
          
          // Bugfix Android Chrome: Detener y reiniciar la sesión del Web Speech API
          // limpia el buffer interno y evita el loop repetitivo de "Hola Hola Hola"
          if (this.isListeningSubject.value) {
             this.pauseListening();
             setTimeout(() => {
                const isBusy = this.kokoroVoice.isProcessing$.value || this.kokoroVoice.isSpeaking$.value;
                if (!isBusy && this.isListeningSubject.value === false) {
                   // Solo reactivamos si la IA no empezó a hablar de inmediato
                   this.resumeListening();
                } else if (isBusy) {
                   // Si la IA empezó a responder muy rápido, dejamos que setupVoiceSync lo despierte luego
                   this.wasListeningBeforeVoice = true;
                }
             }, 500);
          }
        }
      });
    }, 2000);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  // --- AUDIO VISUALIZER (Simulado para evitar bugs de red en Chrome) ---
  private async startAudioVisualizer() {
    // Chrome suele arrojar error 'network' si SpeechRecognition y getUserMedia
    // intentan usar el micrófono a la vez. Para la inmersión visual,
    // simulamos las ondas basándonos en el estado de 'isListening'.
    this.updateAudioLevel();
  }

  private stopAudioVisualizer() {
    cancelAnimationFrame(this.animationFrameId);
    this.audioLevelSubject.next(0);
  }

  private updateAudioLevel = () => {
    if (!this.isListeningSubject.value) return;

    // Generar un nivel de audio aleatorio y fluido (simulando voz)
    const baseLevel = Math.random() > 0.5 ? Math.random() * 80 + 20 : Math.random() * 30;
    this.audioLevelSubject.next(Math.min(100, Math.round(baseLevel)));

    // Bajar la velocidad de la animación para que se vea natural
    setTimeout(() => {
      if (this.isListeningSubject.value) {
        this.animationFrameId = requestAnimationFrame(this.updateAudioLevel);
      }
    }, 100);
  }

  // --- NATIVE PLUGINS PLACEHOLDER ---
  private startNativeListening() {
    console.log('Invocando plugin nativo de Speech Recognition (Capacitor)...');
    // Implementación futura:
    // await SpeechRecognitionPlugin.start({...});
  }

  private stopNativeListening() {
    console.log('Deteniendo plugin nativo de Speech Recognition (Capacitor)...');
    // Implementación futura:
    // await SpeechRecognitionPlugin.stop();
  }

  ngOnDestroy() {
    this.stopListening();
    if (this.voiceSub) this.voiceSub.unsubscribe();
  }
}
