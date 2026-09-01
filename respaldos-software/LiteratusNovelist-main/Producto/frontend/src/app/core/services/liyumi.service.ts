import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type LiyumiState = 'idle' | 'speaking' | 'waving' | 'thinking';

export interface LiyumiMessage {
  text: string;
  duration?: number; // ms antes de desaparecer (0 = persistente)
}

@Injectable({ providedIn: 'root' })
export class LiyumiService {
  private _state$ = new BehaviorSubject<LiyumiState>('idle');
  private _message$ = new BehaviorSubject<LiyumiMessage | null>(null);
  private _isTalking$ = new BehaviorSubject<boolean>(false);
  private _isOpen$ = new BehaviorSubject<boolean>(false);
  private _messageTimer: any;

  readonly state$ = this._state$.asObservable();
  readonly message$ = this._message$.asObservable();
  readonly isTalking$ = this._isTalking$.asObservable();
  readonly isOpen$ = this._isOpen$.asObservable();

  setState(state: LiyumiState): void {
    this._state$.next(state);
  }

  speak(message: LiyumiMessage): void {
    clearTimeout(this._messageTimer);
    this._state$.next('speaking');
    this._isTalking$.next(true);
    this._message$.next(message);

    if (message.duration && message.duration > 0) {
      this._messageTimer = setTimeout(() => {
        this._isTalking$.next(false);
        this._state$.next('idle');
        this._message$.next(null);
      }, message.duration);
    }
  }

  stopSpeaking(): void {
    clearTimeout(this._messageTimer);
    this._isTalking$.next(false);
    this._state$.next('idle');
  }

  wave(message?: string): void {
    this._state$.next('waving');
    if (message) {
      this._message$.next({ text: message, duration: 4000 });
    }
    setTimeout(() => {
      this._state$.next('idle');
    }, 4000);
  }

  toggleOpen(): void {
    this._isOpen$.next(!this._isOpen$.value);
  }

  open(): void {
    this._isOpen$.next(true);
  }

  close(): void {
    this._isOpen$.next(false);
  }

  clearMessage(): void {
    clearTimeout(this._messageTimer);
    this._message$.next(null);
    this._isTalking$.next(false);
    this._state$.next('idle');
  }
}
