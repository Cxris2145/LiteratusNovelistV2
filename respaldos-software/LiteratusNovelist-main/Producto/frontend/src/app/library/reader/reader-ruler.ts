export type ReaderRulerColumn = 'left' | 'right' | 'full';

interface ReaderRulerLine {
  top: number;
  bottom: number;
  center: number;
}

/** El componente aporta su estado actual mediante getters; la regla solo mueve DOM. */
export interface ReaderRulerHost {
  readonly canvas: HTMLElement | null;
  readonly viewport?: HTMLElement | null;
  readonly active: boolean;
  readonly paged: boolean;
  readonly columns: number;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly linesPerPage: number;
  readonly currentWordIndex: number;
  readonly currentSpreadIndex: number;
  readonly totalSpreads: number;
  readonly totalChapterPages?: number;
  next(): void;
  previous(): void;
  rulerElement?(): HTMLElement | null;
}

/** Regla por renglón, independiente de Angular y de la paginación del componente. */
export class ReaderRulerController {
  y = -1000;
  column: ReaderRulerColumn = 'full';
  private lines: ReaderRulerLine[] = [];
  private lineIndex = -1;
  private frame: number | null = null;
  private pointer: { x: number; y: number } | null = null;

  constructor(private readonly host: ReaderRulerHost) {}

  apply(): void {
    this.invalidate();
    if (!this.host.active) {
      this.setTop(-1000);
      return;
    }
    const canvas = this.host.canvas;
    if (!canvas) return;
    this.rebuildLines(canvas);
    if (this.host.paged && this.lines.length) {
      this.lineIndex = 0;
      this.setTop(this.lines[0].center, this.host.columns > 1 ? 'left' : 'full');
    }
  }

  /** Agrupa los eventos del ratón en un solo cálculo por cuadro. */
  readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.host.active) return;
    this.pointer = { x: event.clientX, y: event.clientY };
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const canvas = this.host.canvas;
      if (!canvas || !this.pointer || !this.host.active) return;
      if (!this.lines.length) this.rebuildLines(canvas);
      if (!this.lines.length) return;
      const bounds = (this.host.viewport ?? canvas).getBoundingClientRect();
      const relativeY = this.pointer.y - bounds.top;
      const column = this.columnAt(this.pointer.x, bounds);
      this.lineIndex = this.host.paged
        ? this.pagedLineIndex(relativeY, canvas)
        : this.closestLine(relativeY);
      if (this.lineIndex >= 0) this.setTop(this.lines[this.lineIndex].center, column);
    });
  };

  readonly handleMouseLeave = (): void => {
    if (this.host.currentWordIndex >= 0) return;
    this.lineIndex = -1;
    this.setTop(-1000);
  };

  /** Recorre las páginas de una o dos columnas, sin entrar en una página vacía final. */
  moveByLine(direction: 1 | -1): void {
    const canvas = this.host.canvas;
    if (!canvas) return;
    if (!this.lines.length) this.rebuildLines(canvas);
    if (!this.lines.length) return;
    if (!this.host.paged) {
      this.lineIndex = this.lineIndex < 0
        ? this.closestLine((this.host.viewport ?? canvas).clientHeight / 2)
        : Math.max(0, Math.min(this.lines.length - 1, this.lineIndex + direction));
      this.setTop(this.lines[this.lineIndex].center, 'full');
      return;
    }

    const columns = Math.max(1, this.host.columns);
    const lineCount = this.lines.length;
    const pages = this.host.totalChapterPages ?? this.host.totalSpreads * columns;
    let columnIndex = this.column === 'right' && columns > 1 ? 1 : 0;
    let index = this.lineIndex < 0 ? 0 : this.lineIndex + direction;
    if (index >= this.lines.length) {
      const currentPage = this.host.currentSpreadIndex * columns + columnIndex;
      if (currentPage + 1 < pages) {
        columnIndex += 1;
        if (columnIndex >= columns) {
          this.host.next();
          columnIndex = 0;
        }
        index = 0;
      } else {
        index = lineCount - 1;
      }
    } else if (index < 0) {
      if (columnIndex > 0) {
        columnIndex -= 1;
        index = lineCount - 1;
      } else if (this.host.currentSpreadIndex > 0) {
        this.host.previous();
        columnIndex = columns - 1;
        index = lineCount - 1;
      } else {
        index = 0;
      }
    }
    // Pasar de página invalida las líneas; reconstruirlas antes de aplicarlas.
    if (!this.lines.length) this.rebuildLines(canvas);
    this.lineIndex = Math.min(index, this.lines.length - 1);
    this.setTop(this.lines[this.lineIndex].center, columns > 1 ? columnIndex ? 'right' : 'left' : 'full');
  }

  /** Centra el siguiente renglón en desplazamiento; en páginas sigue el orden del texto. */
  step(direction: 1 | -1): void {
    const canvas = this.host.canvas;
    if (!canvas) return;
    if (!this.host.active) {
      canvas.scrollBy({ top: direction * 80, behavior: 'smooth' });
      return;
    }
    if (this.host.paged) {
      this.moveByLine(direction);
      return;
    }
    if (!this.lines.length) this.rebuildLines(canvas);
    if (!this.lines.length) return;
    const current = this.lineIndex < 0 ? this.closestLine(Math.max(0, this.y)) : this.lineIndex;
    const index = this.y < 0 ? 0 : Math.max(0, Math.min(this.lines.length - 1, current + direction));
    this.lineIndex = index;
    const documentY = canvas.scrollTop + this.lines[index].center;
    const maxScroll = Math.max(0, canvas.scrollHeight - canvas.clientHeight);
    const scrollTop = Math.max(0, Math.min(documentY - canvas.clientHeight / 2, maxScroll));
    this.setTop(documentY - scrollTop, 'full');
    if (Math.abs(canvas.scrollTop - scrollTop) > 1) canvas.scrollTo({ top: scrollTop, behavior: 'smooth' });
  }

  /** La narración sigue la palabra visible sin conocer el caché interno de líneas. */
  followElement(word: HTMLElement): void {
    const canvas = this.host.canvas;
    if (!canvas || !this.host.active) return;
    const bounds = (this.host.viewport ?? canvas).getBoundingClientRect();
    const rect = word.getBoundingClientRect();
    const centerY = (rect.top + rect.bottom) / 2 - bounds.top;
    const column = this.columnAt((rect.left + rect.right) / 2, bounds);
    if (this.host.paged) {
      if (!this.lines.length) this.rebuildLines(canvas);
      this.lineIndex = this.pagedLineIndex(centerY, canvas);
      this.setTop(this.lines[this.lineIndex].center, column);
    } else {
      this.setTop(centerY, column);
    }
  }

  setTop(center: number, column: ReaderRulerColumn = this.column): void {
    this.y = center;
    this.column = column;
    const element = this.host.rulerElement?.()
      ?? this.host.canvas?.parentElement?.querySelector<HTMLElement>('.reading-ruler');
    if (!element) return;
    element.style.top = `${center}px`;
    element.classList.remove('col-left', 'col-right', 'col-full');
    element.classList.add(`col-${column}`);
  }

  invalidate(): void {
    this.lines = [];
    this.lineIndex = -1;
  }

  destroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.pointer = null;
    this.invalidate();
  }

  private rebuildLines(canvas: HTMLElement): void {
    const linePixels = Math.round(this.host.fontSize * this.host.lineHeight) || 32;
    if (this.host.paged) {
      const padding = parseFloat(getComputedStyle(canvas).paddingTop) || 0;
      this.lines = Array.from({ length: Math.max(1, this.host.linesPerPage) }, (_, index) => {
        const top = padding + index * linePixels;
        return { top, bottom: top + linePixels, center: top + linePixels / 2 };
      });
    } else {
      const bounds = (this.host.viewport ?? canvas).getBoundingClientRect();
      const words: ReaderRulerLine[] = [];
      canvas.querySelectorAll<HTMLElement>('.word').forEach(word => {
        const rect = word.getBoundingClientRect();
        if (rect.bottom < bounds.top || rect.top > bounds.bottom || rect.right < bounds.left || rect.left > bounds.right) return;
        words.push({ top: rect.top - bounds.top, bottom: rect.bottom - bounds.top, center: (rect.top + rect.bottom) / 2 - bounds.top });
      });
      words.sort((a, b) => a.center - b.center);
      this.lines = [];
      const threshold = Math.max(7, Math.round(linePixels * 0.35));
      for (const word of words) {
        const previous = this.lines[this.lines.length - 1];
        if (previous && Math.abs(word.center - previous.center) <= threshold) {
          previous.top = Math.min(previous.top, word.top);
          previous.bottom = Math.max(previous.bottom, word.bottom);
          previous.center = (previous.top + previous.bottom) / 2;
        } else {
          this.lines.push({ ...word });
        }
      }
    }
    this.lineIndex = -1;
  }

  private closestLine(relativeY: number): number {
    let closest = -1;
    let distance = Infinity;
    this.lines.forEach((line, index) => {
      const next = Math.abs(line.center - relativeY);
      if (next < distance) { closest = index; distance = next; }
    });
    return closest;
  }

  private pagedLineIndex(relativeY: number, canvas: HTMLElement): number {
    const padding = parseFloat(getComputedStyle(canvas).paddingTop) || 0;
    const linePixels = Math.round(this.host.fontSize * this.host.lineHeight) || 32;
    return Math.max(0, Math.min(this.lines.length - 1, Math.floor((relativeY - padding) / linePixels)));
  }

  private columnAt(clientX: number, bounds: DOMRect): ReaderRulerColumn {
    return this.host.paged && this.host.columns > 1
      ? clientX >= bounds.left + bounds.width / 2 ? 'right' : 'left'
      : 'full';
  }
}
