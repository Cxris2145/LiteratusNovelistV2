import { Directive, EmbeddedViewRef, EventEmitter, Input, OnChanges, Output, TemplateRef, ViewContainerRef, inject } from '@angular/core';

/**
 * Pinta su plantilla y la deja fuera de la detección de cambios: solo se vuelve a revisar cuando
 * cambia alguna de sus dependencias. El capítulo tiene miles de palabras; así cada pasada del lector
 * (un toque, una palabra narrada, un giro de página) ya no las recorre todas.
 *
 *   <ng-template [rdFrozen]="[bloques, título, …]" (rdFrozenRefreshed)="…">…</ng-template>
 *
 * La plantilla sigue declarada en el lector, así que sus elementos conservan los estilos del lector.
 */
@Directive({ selector: '[rdFrozen]' })
export class ReaderFrozenDirective implements OnChanges {
  private readonly template = inject(TemplateRef);
  private readonly container = inject(ViewContainerRef);
  private view: EmbeddedViewRef<unknown> | null = null;

  /** Lo que lee la plantilla. Un arreglo literal en la plantilla solo cambia si cambia un elemento. */
  @Input({ required: true }) rdFrozen!: readonly unknown[];

  /** Se volvió a pintar (para lo que se marca directo en el DOM, como la palabra activa). */
  @Output() readonly rdFrozenRefreshed = new EventEmitter<void>();

  ngOnChanges(): void {
    if (!this.view) {
      this.view = this.container.createEmbeddedView(this.template);
      this.view.detach();
    }
    this.view.detectChanges();
    this.rdFrozenRefreshed.emit();
  }
}
