/**
 * Marca en el DOM la palabra activa (la que lee la voz o la que se tocó), su oración y su párrafo,
 * y avisa al lienzo que hay foco (rc-has-focus). Va directo a las clases: así cada palabra narrada
 * no pasa por la detección de cambios del capítulo, que tiene miles de palabras.
 */
export class ReaderHighlighter {
  private index = -1;
  private word: Element | null = null;
  private sentence: Element | null = null;
  private block: Element | null = null;

  constructor(private readonly canvas: () => HTMLElement | null) {}

  get current(): number {
    return this.index;
  }

  set(index: number): void {
    this.index = index;
    this.apply();
  }

  /** El capítulo se volvió a pintar: la palabra activa puede ser otro elemento. */
  refresh(): void {
    this.apply();
  }

  private apply(): void {
    const word = this.index >= 0 ? document.getElementById(`word-${this.index}`) : null;
    // El título del capítulo no va en oraciones ni en párrafos: ahí solo se marca la palabra.
    this.word = swap(this.word, word, 'active-word');
    this.sentence = swap(this.sentence, word?.closest('.sentence-wrap') ?? null, 'active-paragraph-text');
    this.block = swap(this.block, word?.closest('p, .chapter-heading') ?? null, 'active-paragraph');
    this.canvas()?.classList.toggle('rc-has-focus', this.index >= 0);
  }
}

function swap(previous: Element | null, next: Element | null, className: string): Element | null {
  if (previous !== next) previous?.classList.remove(className);
  next?.classList.add(className);
  return next;
}
