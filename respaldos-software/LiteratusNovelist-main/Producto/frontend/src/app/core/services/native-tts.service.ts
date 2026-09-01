import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BehaviorSubject } from 'rxjs';

export interface NativeTtsPlugin {
  speak(options: { text: string }): Promise<void>;
  stop(): Promise<void>;
  setVoice(options: { voiceId: string }): Promise<void>;
  getVoices(): Promise<{ count: number }>;
  addListener(eventName: 'statusChanged', listenerFunc: (info: { status: string }) => void): any;
  addListener(eventName: 'speakingChanged', listenerFunc: (info: { isSpeaking: boolean }) => void): any;
}

const NativeTts = registerPlugin<NativeTtsPlugin>('NativeTts');

@Injectable({
  providedIn: 'root'
})
export class NativeTtsService {
  public isReady$ = new BehaviorSubject<boolean>(false);
  public isSpeaking$ = new BehaviorSubject<boolean>(false);
  public status$ = new BehaviorSubject<string>('NotLoaded');
  public currentWordIndex$ = new BehaviorSubject<number>(-1);

  private simulationInterval: any = null;
  private currentWordsCount: number = 0;
  private simulatedIdx: number = 0;
  private baseWordOffset: number = 0;

  constructor() {
    this.initListeners();
  }

  private initListeners() {
    if (!Capacitor.isNativePlatform()) return;

    NativeTts.addListener('statusChanged', (info) => {
      this.status$.next(info.status);
      if (info.status === 'Ready') {
        this.isReady$.next(true);
      }
    });

    NativeTts.addListener('speakingChanged', (info) => {
      this.isSpeaking$.next(info.isSpeaking);
      if (!info.isSpeaking) {
        this.clearSimulation();
      }
    });
  }

  async speak(fullText: string, startWordIndex: number = 0) {
    if (!Capacitor.isNativePlatform()) return;
    this.clearSimulation();
    const words = fullText.split(/\s+/).filter(w => w.length > 0);
    
    // Si queremos empezar desde una palabra en particular:
    let textToSpeak = fullText;
    this.baseWordOffset = startWordIndex;
    this.simulatedIdx = 0;
    this.currentWordsCount = words.length - startWordIndex;
    
    if (startWordIndex > 0 && startWordIndex < words.length) {
      // Reconstruimos el texto restante
      const remainingWords = words.slice(startWordIndex);
      textToSpeak = remainingWords.join(' ');
    }
    
    this.currentWordIndex$.next(startWordIndex);
    
    // Iniciar simulación de resaltado (~2.5 palabras por segundo)
    const msPerWord = 1000 / 2.5; 
    this.simulationInterval = setInterval(() => {
      if (this.isSpeaking$.getValue()) {
        if (this.simulatedIdx < this.currentWordsCount) {
          this.currentWordIndex$.next(this.baseWordOffset + this.simulatedIdx);
          this.simulatedIdx++;
        } else {
          this.clearSimulation();
        }
      }
    }, msPerWord);

    await NativeTts.speak({ text: textToSpeak });
  }

  async stop() {
    if (!Capacitor.isNativePlatform()) return;
    this.clearSimulation();
    this.currentWordIndex$.next(-1);
    await NativeTts.stop();
  }

  async setVoice(voiceId: string) {
    if (!Capacitor.isNativePlatform()) return;
    await NativeTts.setVoice({ voiceId });
  }

  private clearSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }
}
