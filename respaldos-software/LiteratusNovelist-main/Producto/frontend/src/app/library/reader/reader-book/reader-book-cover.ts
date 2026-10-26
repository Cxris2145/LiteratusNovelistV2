import { NgZone } from '@angular/core';

/**
 * La tapa dura que se abre y se cierra en la vista Libro (dos páginas, escritorio).
 *
 * La tapa no se pliega como una hoja: es cartón y gira rígida sobre el lomo. Al abrir, el libro
 * cerrado viaja desde el centro hasta su página del libro abierto (la derecha si es la tapa, la
 * izquierda si es la contratapa) y gira hasta apoyarse del otro lado. Su cara de adentro es una
 * copia de la página donde se apoya, así que al terminar el libro abierto ya está debajo, igual.
 * Cerrar es la misma coreografía al revés.
 *
 * Mientras tanto, dos máscaras con el fondo del escenario tapan las mitades del libro abierto que
 * todavía no tienen que verse: la que está debajo del libro cerrado hasta que llega, y la otra hasta
 * que la tapa se apoya. Todo está en una capa dentro del papel (.rd-shell) para que las copias de
 * páginas usen las mismas reglas que el texto real.
 */
export interface BookCoverHost {
  /** Capa sobre el papel donde gira la tapa. */
  layer(): HTMLElement | null;
  shell(): HTMLElement | null;
  /** El libro cerrado (.rbc-book de app-reader-book-closed), o null si no está. */
  closedBook(): HTMLElement | null;
}

export type BookCoverSide = 'front' | 'back';

/** Dónde estaba el libro cerrado y cómo se veía, tomado antes de quitarlo. */
export interface ClosedBookSnapshot {
  rect: DOMRect;
  face: HTMLElement;
}

const OPEN_MS = 1100;
const CLOSE_MS = 980;
/** Hasta aquí (fracción de la animación) el libro cerrado viaja a su página; después la tapa gira. */
const ARRIVE = 0.3;
/** Margen que cubren las máscaras alrededor del papel: tapa, cantos y su sombra. */
const MASK_MARGIN = 96;

const ARRIVE_EASING = 'cubic-bezier(.3, 0, .2, 1)';
const SWING_EASING = 'cubic-bezier(.45, 0, .2, 1)';

export class ReaderBookCover {
  private running: { animations: Animation[]; finish: () => void } | null = null;

  constructor(private readonly host: BookCoverHost, private readonly zone: NgZone) {}

  get busy(): boolean { return !!this.running; }

  /** Antes de quitar el libro cerrado: dónde está y una copia de su tapa. */
  snapshot(): ClosedBookSnapshot | null {
    const book = this.host.closedBook();
    const rect = book?.getBoundingClientRect();
    if (!book || !rect?.width || !rect.height) return null;
    return { rect, face: this.faceFrom(book) };
  }

  /**
   * Abre el libro desde la tapa (`front`) o la contratapa (`back`). `inner` es la copia de la página
   * donde se apoya la tapa: la izquierda del primer pliego, o la derecha del último.
   */
  open(side: BookCoverSide, closed: ClosedBookSnapshot, inner: HTMLElement, onDone?: () => void): boolean {
    return this.play(side, closed, inner, false, onDone);
  }

  /** Cierra el libro: el libro cerrado ya está puesto (oculto) para saber dónde termina. */
  close(side: BookCoverSide, inner: HTMLElement, onDone?: () => void): boolean {
    const closed = this.snapshot();
    if (!closed) return false;
    return this.play(side, closed, inner, true, onDone);
  }

  /** Termina de inmediato (otra acción no espera a la animación). */
  finishNow(): void {
    const run = this.running;
    if (!run) return;
    run.animations.forEach(animation => animation.cancel());
    run.finish();
  }

  destroy(): void {
    this.finishNow();
  }

  private play(side: BookCoverSide, closed: ClosedBookSnapshot, inner: HTMLElement, reverse: boolean, onDone?: () => void): boolean {
    this.finishNow();
    const layer = this.host.layer();
    const shell = this.host.shell();
    if (!layer || !shell) return false;
    const box = shell.getBoundingClientRect();
    const width = shell.clientWidth;
    const height = shell.clientHeight;
    if (!width || !height) return false;
    const w = width / 2;
    const front = side === 'front';

    // ── La tapa: una hoja rígida del tamaño de una página, que gira sobre el lomo ──
    layer.replaceChildren();
    layer.style.perspective = `${Math.round(Math.max(1800, width * 2.2))}px`;
    layer.style.perspectiveOrigin = `${w}px 50%`;
    const leaf = this.make('div', 'rd-cover-leaf');
    const leafLeft = front ? w : 0;
    const originX = front ? 0 : w;
    leaf.style.left = `${leafLeft}px`;
    leaf.style.width = `${w}px`;
    leaf.style.transformOrigin = `${originX}px 50%`;

    const outer = this.make('div', 'rd-cover-face');
    const outerShade = this.make('div', 'rd-cover-shade');
    outer.append(closed.face, outerShade);
    const innerFace = this.make('div', 'rd-cover-face is-inner');
    const innerShade = this.make('div', 'rd-cover-shade');
    inner.style.left = '0px';
    innerFace.append(inner, innerShade);
    leaf.append(outer, innerFace);

    // ── Máscaras: la mitad debajo del libro cerrado (near) y donde se apoya la tapa (far) ──
    const near = this.mask(front ? w : -MASK_MARGIN, w + MASK_MARGIN, height);
    const far = this.mask(front ? -MASK_MARGIN : w, w + MASK_MARGIN, height);
    layer.append(near, far, leaf);

    // ── Del libro cerrado a su página: traslado y escala (el giro va aparte, sobre el lomo) ──
    const k = {
      left: closed.rect.left - box.left,
      top: closed.rect.top - box.top,
      width: closed.rect.width,
      height: closed.rect.height,
    };
    const sx = k.width / w;
    const sy = k.height / height;
    const tx = k.left - leafLeft - originX + sx * originX;
    const ty = k.top + k.height / 2 - height / 2;
    const swing = front ? -180 : 180;
    const lift = front ? -7 : 7;
    const at = (x: number, y: number, scaleX: number, scaleY: number, deg: number) =>
      `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)}) rotateY(${deg}deg)`;

    // Los cuadros se escriben para abrir; cerrar los recorre al revés.
    const timing: KeyframeAnimationOptions = {
      duration: reverse ? CLOSE_MS : OPEN_MS,
      direction: reverse ? 'reverse' : 'normal',
      fill: 'both',
    };
    // Instante en que la tapa queda de canto (90°): con la curva del giro, a mitad de su tramo.
    const edgeOn = ARRIVE + (1 - ARRIVE) * 0.5;
    const animations = [
      leaf.animate([
        { offset: 0, transform: at(tx, ty, sx, sy, 0), easing: ARRIVE_EASING },
        { offset: ARRIVE, transform: at(0, 0, 1, 1, lift), easing: SWING_EASING },
        { offset: 1, transform: at(0, 0, 1, 1, swing) },
      ], timing),
      // La cara de afuera se apaga al quedar de canto a la luz; la de adentro se aclara al apoyarse.
      outerShade.animate([
        { offset: 0, opacity: 0 },
        { offset: ARRIVE, opacity: 0, easing: SWING_EASING },
        { offset: edgeOn, opacity: 0.42 },
        { offset: 1, opacity: 0.42 },
      ], timing),
      innerShade.animate([
        { offset: 0, opacity: 0.38 },
        { offset: edgeOn, opacity: 0.38, easing: 'cubic-bezier(.2, 0, .3, 1)' },
        { offset: 1, opacity: 0 },
      ], timing),
      // El libro abierto aparece alrededor de la tapa cuando llega a su lugar...
      near.animate([
        { offset: 0, opacity: 1 },
        { offset: ARRIVE * 0.35, opacity: 1, easing: 'ease-out' },
        { offset: ARRIVE, opacity: 0 },
        { offset: 1, opacity: 0 },
      ], timing),
      // ...y la otra mitad (su tapa y cantos) justo cuando la tapa termina de apoyarse.
      far.animate([
        { offset: 0, opacity: 1 },
        { offset: 0.84, opacity: 1, easing: 'ease-out' },
        { offset: 1, opacity: 0 },
      ], timing),
    ];

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (this.running?.finish === finish) this.running = null;
      layer.replaceChildren();
      layer.style.perspective = '';
      layer.style.perspectiveOrigin = '';
      if (onDone) this.zone.run(onDone);
    };
    this.running = { animations, finish };
    Promise.all(animations.map(animation => animation.finished)).then(finish, () => { /* cancelada: ya terminó */ });
    return true;
  }

  /** Copia de la tapa del libro cerrado que ocupa toda la hoja (sin su animación ni su hover). */
  private faceFrom(book: HTMLElement): HTMLElement {
    const face = book.cloneNode(true) as HTMLElement;
    face.removeAttribute('aria-label');
    face.setAttribute('tabindex', '-1');
    face.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;max-width:none;aspect-ratio:auto;'
      + 'margin:0;animation:none;transition:none;transform:none;';
    return face;
  }

  private mask(left: number, width: number, height: number): HTMLElement {
    const mask = this.make('div', 'rd-cover-mask');
    mask.style.left = `${left}px`;
    mask.style.width = `${width}px`;
    mask.style.top = `${-MASK_MARGIN}px`;
    mask.style.height = `${height + 2 * MASK_MARGIN}px`;
    return mask;
  }

  /** Elemento con el atributo de estilos del lector, para que le apliquen sus reglas. */
  private make(tag: string, className: string): HTMLElement {
    const el = document.createElement(tag);
    el.className = className;
    const attr = this.host.layer()?.getAttributeNames().find(name => name.startsWith('_ngcontent'));
    if (attr) el.setAttribute(attr, '');
    return el;
  }
}
