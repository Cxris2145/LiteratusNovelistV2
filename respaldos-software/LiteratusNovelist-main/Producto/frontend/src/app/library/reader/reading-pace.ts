import { ReaderSettingsService } from './reader-settings.service';

/**
 * Ritmo de lectura y tiempo que falta del capítulo. Con el ritmo automático, las palabras por
 * minuto se calibran con el avance real entre páginas o párrafos (media móvil suave); si pasan
 * más de 25 s sin avanzar se considera una pausa y no cuenta.
 */
export class ReadingPace {
  /** "Te quedan 15 minutos para terminar este capítulo" */
  text = '';
  /** "15 min restantes" */
  short = '';
  /** Ritmo y palabras restantes, para el `title` de la pastilla. */
  tooltip = '';
  minutes = 0;

  private lastActivityTs = 0;
  private startTs = 0;
  private startWord = 0;

  constructor(private readonly settings: ReaderSettingsService) {}

  /** Capítulo nuevo: el ritmo se mide desde aquí. */
  start(progress: number, totalWords: number): void {
    this.startTs = this.lastActivityTs = Date.now();
    this.startWord = Math.round(totalWords * clamp01(progress));
    this.update(progress, totalWords);
  }

  /** El lector avanzó hasta `progress` (fracción del capítulo). */
  track(progress: number, totalWords: number): void {
    const s = this.settings.value;
    if (!s.wpmAuto || totalWords <= 0) return;
    const now = Date.now();
    const currentWord = Math.round(totalWords * clamp01(progress));

    if (this.lastActivityTs > 0 && now - this.lastActivityTs > 25000) { // pausa: se vuelve a medir desde aquí
      this.startTs = now;
      this.startWord = currentWord;
    }
    this.lastActivityTs = now;

    const words = currentWord - this.startWord;
    const seconds = (now - this.startTs) / 1000;
    // Se calibra tras al menos 15 s de lectura sostenida y 25 palabras.
    if (seconds >= 15 && words >= 25) {
      const measured = Math.round((words / seconds) * 60);
      if (measured >= 90 && measured <= 450) {
        // 85 % de inercia + 15 % de la medición nueva
        const wpm = Math.max(90, Math.min(450, Math.round(s.wpm * 0.85 + measured * 0.15)));
        this.settings.update({ wpm });
      }
      this.startTs = now;
      this.startWord = currentWord;
    }
  }

  update(progress: number, totalWords: number): void {
    progress = clamp01(progress || 0);
    if (totalWords <= 0) {
      this.text = this.short = '';
      this.minutes = 0;
      return;
    }
    const { wpm, wpmAuto } = this.settings.value;
    const remainingWords = Math.max(0, Math.round(totalWords * (1 - progress)));
    this.minutes = Math.ceil(remainingWords / Math.max(80, wpm || 200));

    if (progress >= 0.98 || remainingWords <= 20) {
      this.text = 'Capítulo completado';
      this.short = 'Completado';
    } else if (this.minutes <= 1) {
      this.text = 'Te queda 1 minuto para terminar este capítulo';
      this.short = '1 min restante';
    } else {
      this.text = `Te quedan ${this.minutes} minutos para terminar este capítulo`;
      this.short = `${this.minutes} min restantes`;
    }
    this.tooltip = `Ritmo: ${wpm} palabras/min (${wpmAuto ? 'adaptado automáticamente' : 'fijo'}). `
      + `Te quedan aprox. ${remainingWords.toLocaleString()} palabras de este capítulo.`;
  }
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
