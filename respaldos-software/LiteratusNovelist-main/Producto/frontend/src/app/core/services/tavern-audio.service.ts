import { Injectable, OnDestroy } from '@angular/core';

/**
 * Servicio de paisaje sonoro ambiental para La Taberna de Tinta.
 * Utiliza Web Audio API de forma procedural para sintetizar el chisporroteo
 * de la leña en la chimenea y el murmullo cálido sin depender de archivos de audio externos.
 */
@Injectable({ providedIn: 'root' })
export class TavernAudioService implements OnDestroy {
  private ctx: AudioContext | null = null;
  private isRunning = false;
  private masterGain: GainNode | null = null;
  private crackleTimer: ReturnType<typeof setInterval> | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;

  private readonly STORAGE_KEY = 'literatus_tavern_ambient_audio';

  get playing(): boolean {
    return this.isRunning;
  }

  toggle(): boolean {
    if (this.isRunning) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  start(): void {
    if (this.isRunning) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioCtxClass();
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      // Fade in suave
      this.masterGain.gain.exponentialRampToValueAtTime(0.4, this.ctx.currentTime + 1.2);
      this.masterGain.connect(this.ctx.destination);

      this.setupHearthRumble();
      this.setupFireCrackles();
      this.setupWarmDrone();

      this.isRunning = true;
      try {
        localStorage.setItem(this.STORAGE_KEY, 'true');
      } catch {
        // Ignorar en navegadores con almacenamiento restringido
      }
    } catch {
      this.isRunning = false;
    }
  }

  stop(): void {
    if (!this.isRunning || !this.ctx || !this.masterGain) return;

    try {
      // Fade out suave
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.5);

      setTimeout(() => {
        this.teardownNodes();
        this.isRunning = false;
        try {
          localStorage.setItem(this.STORAGE_KEY, 'false');
        } catch {
          // Ignorar
        }
      }, 550);
    } catch {
      this.teardownNodes();
      this.isRunning = false;
    }
  }

  private setupHearthRumble(): void {
    if (!this.ctx || !this.masterGain) return;

    // Generador de ruido rosa filtrado: simula el soplido y aire caliente del fuego
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = noiseBuffer;
    this.noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, this.ctx.currentTime);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, this.ctx.currentTime);

    this.noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    this.noiseSource.start();
  }

  private setupFireCrackles(): void {
    if (!this.ctx || !this.masterGain) return;

    // Disparos periódicos y aleatorios de micro-crujidos de madera ardiendo
    this.crackleTimer = setInterval(() => {
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

      // Probabilidad de crujido en este tick
      if (Math.random() < 0.65) {
        this.triggerSingleCrackle();
      }
    }, 120);
  }

  private triggerSingleCrackle(): void {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const crackleLength = 0.008 + Math.random() * 0.024;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * crackleLength), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.28));
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400 + Math.random() * 2200, now);
    filter.Q.setValueAtTime(3 + Math.random() * 4, now);

    const gain = this.ctx.createGain();
    const volume = 0.12 + Math.random() * 0.35;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + crackleLength);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    source.start(now);
  }

  private setupWarmDrone(): void {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const droneGain = this.ctx.createGain();
    droneGain.gain.setValueAtTime(0.04, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);

    // D2 (73.4 Hz) y A2 (110 Hz): quinta justa medieval tenue y cálida
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = 'triangle';
    this.droneOsc1.frequency.setValueAtTime(73.4, now);

    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'sine';
    this.droneOsc2.frequency.setValueAtTime(110.0, now);

    this.droneOsc1.connect(filter);
    this.droneOsc2.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(this.masterGain);

    this.droneOsc1.start(now);
    this.droneOsc2.start(now);
  }

  private teardownNodes(): void {
    if (this.crackleTimer) {
      clearInterval(this.crackleTimer);
      this.crackleTimer = null;
    }

    try { this.noiseSource?.stop(); } catch { /* noop */ }
    try { this.droneOsc1?.stop(); } catch { /* noop */ }
    try { this.droneOsc2?.stop(); } catch { /* noop */ }

    this.noiseSource?.disconnect();
    this.droneOsc1?.disconnect();
    this.droneOsc2?.disconnect();
    this.masterGain?.disconnect();

    this.noiseSource = null;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.masterGain = null;
  }

  ngOnDestroy(): void {
    this.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      try { this.ctx.close(); } catch { /* noop */ }
    }
  }
}
