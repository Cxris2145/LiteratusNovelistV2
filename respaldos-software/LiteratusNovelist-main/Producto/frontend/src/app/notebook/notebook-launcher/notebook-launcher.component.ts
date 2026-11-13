import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';

import { NotebookService } from '../notebook.service';

/**
 * Botón flotante del cuaderno (sobre la burbuja del asistente). Abre el cuaderno; en el lector,
 * directo en la pestaña de ese libro. Si ya está abierto lo minimiza, y si está minimizado lo trae.
 * Es liviano: la ventana con el editor se descarga recién al abrirla.
 */
@Component({
  selector: 'app-notebook-launcher',
  standalone: true,
  imports: [AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notebook.visibility$ | async; as visibility) {
      <button type="button" class="nb-launcher" [class.on]="visibility === 'open'" (click)="notebook.toggle()"
              [attr.aria-pressed]="visibility === 'open'"
              [attr.aria-label]="visibility === 'open' ? 'Minimizar el cuaderno' : 'Abrir el cuaderno'"
              [title]="visibility === 'open' ? 'Minimizar el cuaderno' : 'Cuaderno: apuntes, dibujos y lo que guardas de cada libro'">
        <span class="material-symbols-rounded" aria-hidden="true">stylus_note</span>
      </button>
    }
  `,
  styles: [`
    .nb-launcher {
      position: fixed;
      right: 32px;
      bottom: calc(100px + env(safe-area-inset-bottom, 0px));
      z-index: 3000;
      /* styles.css lo pone en none mientras hay un chat a la vista. */
      display: var(--floating-btn-display, grid);
      place-items: center;
      width: 48px;
      height: 48px;
      padding: 0;
      border: 1px solid color-mix(in srgb, var(--color-500, #5e80b3) 45%, transparent);
      border-radius: 14px;
      background: linear-gradient(135deg, var(--color-surface, #14291f) 0%, var(--color-bg-primary, #0a1914) 100%);
      color: var(--color-text-primary, #f1f5f9);
      box-shadow: 0 8px 22px rgba(8, 14, 26, 0.25);
      cursor: pointer;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .nb-launcher .material-symbols-rounded { font-size: 24px; }
    .nb-launcher.on { border-color: var(--color-500, #5e80b3); background: var(--color-surface-elevated, #1f2937); }
    .nb-launcher:focus-visible { outline: 2px solid var(--color-focus, #c2d2ea); outline-offset: 2px; }
    @media (hover: hover) and (pointer: fine) {
      .nb-launcher:hover { transform: translateY(-2px); border-color: var(--color-500, #5e80b3); }
    }
    /* Con el panel del asistente abierto, el botón quedaría encima de su caja de texto y del
       micrófono: se esconde hasta que el panel se cierra o se minimiza. */
    :host-context(body:has(.lit-panel)) .nb-launcher { display: var(--senda-notebook-display, none); }
    /* En La Taberna (escritorio) va junto al asistente, bajo la columna de amigos. */
    @media (min-width: 701px) {
      body:where(:not(.reader-open)):has(app-tavern-hall) :host .nb-launcher { right: 84px; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
    }
    /* El panel del asistente queda a la izquierda de la columna. */
    @media (min-width: 768px) {
      body:where(:not(.reader-open)):has(app-learning-path) :host .nb-launcher {
        right: var(--senda-tools-edge, 32px);
        bottom: calc(24px + var(--senda-tools-size, 48px) + 12px + env(safe-area-inset-bottom, 0px));
      }
    }
    @media (max-width: 768px) {
      /* En vista móvil, el cuaderno se unifica en el Speed Dial del Asistente */
      :host, .nb-launcher {
        display: none !important;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .nb-launcher { transition: none; }
      .nb-launcher:hover { transform: none; }
    }
  `],
})
export class NotebookLauncherComponent {
  readonly notebook = inject(NotebookService);
}
