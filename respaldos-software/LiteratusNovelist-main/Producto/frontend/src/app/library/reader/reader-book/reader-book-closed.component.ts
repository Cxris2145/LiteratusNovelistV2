import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Vista Libro con el libro cerrado: la tapa (la portada real) antes de la primera página y la
 * contratapa (sinopsis) después de la última. Tocarla abre el libro; las flechas y el teclado
 * los maneja el lector (turnSpreadNext / turnSpreadPrev).
 */
@Component({
  selector: 'app-reader-book-closed',
  templateUrl: './reader-book-closed.component.html',
  styleUrl: './reader-book-closed.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReaderBookClosedComponent {
  @Input({ required: true }) side!: 'front' | 'back';
  @Input() cover: string | null = null;
  @Input() title = '';
  @Input() author = '';
  @Input() synopsis = '';
  /** Abrir el libro: desde la tapa, en la primera página; desde la contratapa, en la última. */
  @Output() readonly open = new EventEmitter<void>();
  /** Tocar fuera del libro muestra u oculta las barras, como en las páginas. */
  @Output() readonly toggleChrome = new EventEmitter<void>();

  coverFailed = false;

  onStageClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.rbc-book')) return;
    this.toggleChrome.emit();
  }
}
