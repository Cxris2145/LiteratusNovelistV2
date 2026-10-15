import { Component, inject } from '@angular/core';

import { ReaderComponent } from '../reader.component';
import { ReaderNarrationService } from '../reader-narration.service';

/**
 * Panel "Narración": voz (estándar, neural de Azure, modelo local o la del teléfono), voz del
 * narrador, velocidad y reproducir / pausar / reanudar / reiniciar. Reproducir lo pide al lector,
 * que sabe desde qué palabra narrar (la página a la vista o la palabra marcada).
 */
@Component({
  selector: 'app-reader-narration-sheet',
  templateUrl: './reader-narration-sheet.component.html',
  styleUrl: './reader-narration-sheet.component.css',
})
export class ReaderNarrationSheetComponent {
  readonly reader = inject(ReaderComponent);
  readonly n = inject(ReaderNarrationService);

  /** Cambiar de voz con la narración en curso la retoma con la voz nueva. */
  changeVoice(voiceId: string): void {
    if (this.n.setVoice(voiceId)) this.reader.playAudio();
  }

  changeWasmVoice(modelId: string): void {
    this.n.wasm.setVoice(modelId);
    this.reader.stopAudio(true);
    this.reader.playAudio();
  }
}
