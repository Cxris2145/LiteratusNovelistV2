import { NgZone } from '@angular/core';

import { SpringState, dragAngle, isSettled, shouldCommitFlip, stepSpring } from './reader-book-flip-physics';
import { FoldCorner, Point, foldAt, foldShadow } from './reader-book-fold';

/**
 * La hoja que se pliega de la vista Libro (dos páginas, escritorio).
 *
 * El capítulo es un solo lienzo de columnas que se traslada: solo puede mostrar un pliego seguido.
 * Mientras una hoja gira se ven cuatro páginas que no son seguidas (la que queda, las dos caras de
 * la hoja y la que se destapa), así que durante el giro se arman "fotocopias" de las páginas que
 * faltan: se copian solo los párrafos de esa página en un lienzo igual, desde la misma altura de
 * columna, para que corten las líneas igual que el original. El lienzo real salta al pliego nuevo
 * y queda debajo; al terminar el giro las copias se quitan y solo queda el texto real.
 *
 * La hoja se dobla como el papel (reader-book-fold.ts): el anverso se recorta por el pliegue y el
 * reverso se apoya encima ya girado, con sombra en el pliegue, sobre la página que se destapa y
 * debajo de la solapa. Todo es recorte (clip-path) y matrices 2D: sin capas 3D, cada cuadro es barato.
 *
 * Las copias no tienen id ni reciben toques (la capa es aria-hidden): la voz, la selección, los
 * subrayados y los lectores de pantalla solo ven el texto real.
 */
export interface BookFlipHost {
  shell(): HTMLElement | null;
  layer(): HTMLElement | null;
  canvas(): HTMLElement | null;
  viewport(): HTMLElement | null;
  container(): HTMLElement | null;
  /** Separación entre columnas del lienzo (el lomo). */
  gap(): number;
}

export type BookPageSide = 'left' | 'right';
type Side = BookPageSide;

interface ActiveFlip {
  direction: 1 | -1;
  corner: FoldCorner;
  /** Anverso recortado por el pliegue, y su sombra donde empieza a curvarse. */
  front: HTMLElement;
  frontShade: HTMLElement;
  /** La solapa: lleva la sombra que cae debajo; adentro, el reverso girado y su brillo. */
  flap: HTMLElement;
  back: HTMLElement;
  backShade: HTMLElement;
  /** Lo que la hoja destapa, con la sombra del pliegue encima. */
  under: HTMLElement;
  underShade: HTMLElement;
  state: SpringState;
  target: number;
  dragging: boolean;
  /** Esquina levantada al pasar el mouse: todavía no se movió el lienzo. */
  peel: boolean;
  samples: { a: number; t: number }[];
  onDone: ((committed: boolean) => void) | null;
}

const PEEL_ANGLE = 13;

export class ReaderBookFlip {
  private active: ActiveFlip | null = null;
  private frozen: { direction: 1 | -1; fixed: HTMLElement; front: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;
  private raf: number | null = null;
  private safety: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: BookFlipHost, private readonly zone: NgZone) {}

  /** Hay una hoja girando, levantada o un capítulo esperando para girar. */
  get busy(): boolean { return !!this.active || !!this.frozen; }
  get isPeeling(): boolean { return !!this.active?.peel; }
  get isDragging(): boolean { return !!this.active?.dragging; }
  /** Sentido del giro que espera a que se pinte el capítulo siguiente o anterior (0 = ninguno). */
  get frozenDirection(): 0 | 1 | -1 { return this.frozen?.direction ?? 0; }

  // ── Giro completo dentro del capítulo ──────────────────────────────────────

  /**
   * Da vuelta una hoja hacia `direction`. `move` lleva el lienzo real al pliego nuevo (sin animar)
   * y actualiza la vista; se llama en medio, después de copiar las páginas que se van.
   */
  turn(direction: 1 | -1, spread: number, move: () => void, corner: FoldCorner = 'bottom'): boolean {
    const peeled = this.active?.peel && this.active.direction === direction ? this.active : null;
    if (!peeled) this.finishNow();
    const staticSide: Side = direction === 1 ? 'left' : 'right';
    const leafSide: Side = direction === 1 ? 'right' : 'left';
    const fixed = this.capturePage(spread, staticSide);
    const front = peeled ? null : this.capturePage(spread, leafSide);
    if (!fixed || (!peeled && !front)) return false;
    move();
    const back = this.capturePage(spread + direction, staticSide);
    if (!back) {
      this.finishNow();
      return false;
    }
    if (peeled) {
      // La esquina ya estaba levantada: la hoja sigue desde ahí, sin volver a empezar.
      this.promotePeel(peeled, fixed, back);
    } else {
      this.startLeaf(direction, fixed, front!, back, { x: 0, v: 0 }, corner);
    }
    this.active!.target = 180;
    this.active!.onDone = null;
    this.loop();
    return true;
  }

  // ── Arrastrar la hoja con el mouse o el dedo ───────────────────────────────

  /** `corner`: la esquina más cercana a donde se agarró (arriba o abajo). */
  beginDrag(direction: 1 | -1, spread: number, move: () => void, revert: () => void, corner: FoldCorner = 'bottom'): boolean {
    const started = this.turn(direction, spread, move, corner);
    if (!started || !this.active) return false;
    this.cancelLoop();
    const a = this.active;
    a.dragging = true;
    a.state = { x: a.state.x, v: 0 };
    a.samples = [];
    a.onDone = committed => { if (!committed) revert(); };
    this.render(a);
    return true;
  }

  /** Mueve la hoja mientras se arrastra (dx: desplazamiento desde que se agarró). */
  dragTo(dx: number, spreadWidth: number, timeStamp: number): void {
    const a = this.active;
    if (!a?.dragging) return;
    const angle = dragAngle(dx, spreadWidth, a.direction);
    a.state = { x: angle, v: 0 };
    a.samples.push({ a: angle, t: timeStamp });
    if (a.samples.length > 6) a.samples.shift();
    this.render(a);
  }

  /** Al soltar: termina el giro o vuelve, con la velocidad que traía. */
  endDrag(): void {
    const a = this.active;
    if (!a?.dragging) return;
    const first = a.samples[0];
    const last = a.samples[a.samples.length - 1];
    const velocity = first && last && last.t - first.t > 0 ? ((last.a - first.a) / (last.t - first.t)) * 1000 : 0;
    a.dragging = false;
    a.target = shouldCommitFlip(a.state.x, velocity) ? 180 : 0;
    a.state = { x: a.state.x, v: velocity };
    this.loop();
  }

  // ── Esquina que se levanta al acercar el mouse ─────────────────────────────

  peel(direction: 1 | -1, spread: number): void {
    if (this.active || this.frozen) return;
    const leafSide: Side = direction === 1 ? 'right' : 'left';
    const front = this.capturePage(spread, leafSide);
    if (!front) return;
    const back = this.blankPage();
    this.startLeaf(direction, null, front, back, { x: 0, v: 0 }, 'bottom');
    // Debajo de la esquina todavía está la misma página: se ve papel, como el margen de la siguiente.
    this.active!.under.classList.add('is-peel');
    this.active!.peel = true;
    this.active!.target = PEEL_ANGLE;
    this.loop();
  }

  unpeel(): void {
    const a = this.active;
    if (!a?.peel) return;
    a.target = 0;
    this.loop();
  }

  // ── Giro entre capítulos ───────────────────────────────────────────────────

  /**
   * El pliego que se ve se congela (copias de sus dos páginas) mientras el capítulo vecino se
   * pinta debajo; `resumeFrozen` da vuelta la hoja cuando su primera (o última) página está lista.
   */
  freeze(direction: 1 | -1, spread: number): boolean {
    this.finishNow();
    const fixed = this.capturePage(spread, direction === 1 ? 'left' : 'right');
    const front = this.capturePage(spread, direction === 1 ? 'right' : 'left');
    const layer = this.host.layer();
    if (!fixed || !front || !layer) return false;
    this.place(fixed, direction === 1 ? 'left' : 'right');
    this.place(front, direction === 1 ? 'right' : 'left');
    layer.append(fixed, front);
    this.host.container()?.classList.add('is-flipping');
    // Si el capítulo no llega (error de red, otro salto), el libro no queda congelado.
    const timer = setTimeout(() => this.cancelFrozen(), 3500);
    this.frozen = { direction, fixed, front, timer };
    return true;
  }

  resumeFrozen(newSpread: number): void {
    const f = this.frozen;
    if (!f) return;
    clearTimeout(f.timer);
    this.frozen = null;
    const back = this.capturePage(newSpread, f.direction === 1 ? 'left' : 'right');
    this.host.layer()?.replaceChildren();
    if (!back) {
      this.host.container()?.classList.remove('is-flipping');
      return;
    }
    this.startLeaf(f.direction, f.fixed, f.front, back, { x: 0, v: 0 }, 'bottom');
    this.active!.target = 180;
    this.loop();
  }

  cancelFrozen(): void {
    if (!this.frozen) return;
    clearTimeout(this.frozen.timer);
    this.frozen = null;
    if (!this.active) {
      this.host.layer()?.replaceChildren();
      this.host.container()?.classList.remove('is-flipping');
    }
  }

  /** Termina de inmediato lo que esté girando (otra acción no espera a la animación). */
  finishNow(): void {
    this.cancelFrozen();
    const a = this.active;
    if (!a) return;
    this.cancelLoop();
    if (a.peel) a.target = 0;
    a.state = { x: a.target, v: 0 };
    this.complete();
  }

  destroy(): void {
    this.finishNow();
    this.cancelLoop();
  }

  // ── Armado de la hoja ──────────────────────────────────────────────────────

  private startLeaf(direction: 1 | -1, fixed: HTMLElement | null, front: HTMLElement, back: HTMLElement,
                    state: SpringState, corner: FoldCorner): void {
    const layer = this.host.layer()!;
    const width = this.bookWidth();
    const leafSide: Side = direction === 1 ? 'right' : 'left';
    layer.replaceChildren();

    if (fixed) {
      this.place(fixed, leafSide === 'right' ? 'left' : 'right');
      layer.appendChild(fixed);
    }
    // Lo que se destapa: la página real de abajo (el lienzo ya saltó al pliego nuevo) con la sombra
    // que la curva del pliegue proyecta sobre ella.
    const under = this.make('div', 'rd-fold-under');
    const underShade = this.make('div', 'rd-fold-strip');
    underShade.style.background = 'linear-gradient(to right, rgba(0,0,0,.44), rgba(0,0,0,.16) 30%, transparent)';
    under.appendChild(underShade);

    const frontFace = this.make('div', 'rd-flip-face');
    frontFace.style.left = leafSide === 'right' ? `${width / 2}px` : '0px';
    frontFace.style.width = `${width / 2}px`;
    front.style.left = '0px';
    // El anverso se oscurece donde empieza a levantarse, junto al pliegue.
    const frontShade = this.make('div', 'rd-fold-strip');
    frontShade.style.background = 'linear-gradient(to left, rgba(0,0,0,.26), rgba(0,0,0,.08) 45%, transparent)';
    frontFace.append(front, frontShade);

    const flap = this.make('div', 'rd-fold-flap');
    const backFace = this.make('div', 'rd-flip-face is-back');
    backFace.style.left = leafSide === 'right' ? '0px' : `${width / 2}px`;
    backFace.style.width = `${width / 2}px`;
    back.style.left = '0px';
    // La curva de la solapa: oscura en el pliegue, un brillo donde la hoja da a la luz y se apaga.
    const backShade = this.make('div', 'rd-fold-strip is-curl');
    backFace.append(back, backShade);
    flap.appendChild(backFace);

    layer.append(under, frontFace, flap);
    this.host.container()?.classList.add('is-flipping');

    this.active = {
      direction, corner, front: frontFace, frontShade, flap, back: backFace, backShade, under, underShade,
      state, target: 180, dragging: false, peel: false, samples: [], onDone: null,
    };
    this.render(this.active);
  }

  /** La esquina levantada pasa a ser un giro completo: se agrega la página que queda y el reverso. */
  private promotePeel(a: ActiveFlip, fixed: HTMLElement, back: HTMLElement): void {
    const layer = this.host.layer()!;
    this.place(fixed, a.direction === 1 ? 'left' : 'right');
    layer.insertBefore(fixed, layer.firstChild);
    back.style.left = '0px';
    a.back.replaceChildren(back, a.backShade);
    a.under.classList.remove('is-peel'); // el lienzo ya saltó: debajo está la página siguiente
    a.peel = false;
  }

  private render(a: ActiveFlip): void {
    const width = this.bookWidth();
    const height = this.host.shell()?.clientHeight ?? 0;
    const w = width / 2;
    const progress = Math.min(180, Math.max(0, a.state.x)) / 180;
    const fold = foldAt(progress, a.direction, a.corner, w, height);
    const shadow = foldShadow(progress);
    const folded = fold.uncovered.length > 2;

    this.clip(a.front, fold.front, -fold.leafLeft);
    a.back.style.visibility = a.under.style.visibility = folded ? '' : 'hidden';
    if (!folded) return;
    const [ma, mb, mc, md, me, mf] = fold.backMatrix;
    a.back.style.transform = `matrix(${ma},${mb},${mc},${md},${me},${mf})`;
    this.clip(a.back, fold.backClip, 0);
    this.clip(a.under, fold.uncovered, 0);
    // La solapa flota sobre el papel: su sombra crece mientras está en el aire.
    const blur = 4 + 14 * shadow;
    a.flap.style.filter = shadow > 0.02
      ? `drop-shadow(0 ${(2 * shadow).toFixed(1)}px ${blur.toFixed(1)}px color-mix(in srgb, var(--book-cast) ${Math.round(85 * shadow)}%, transparent))`
      : '';

    // Franjas de sombra pegadas al pliegue, del ancho que permite lo que ya se dobló.
    const span = 3 * Math.hypot(w, height);
    const { crease, normal, reach } = fold;
    this.strip(a.underShade, crease, normal, Math.min(reach * 0.5, w * 0.24), span, 1, 0, shadow);
    this.strip(a.frontShade, crease, normal, Math.min(reach * 0.32, w * 0.14), span, -1, -fold.leafLeft, shadow);
    // En el reverso el pliegue está reflejado en el lomo: x → 2w - x, y la normal cambia de lado en x.
    this.strip(a.backShade, { x: 2 * w - crease.x - fold.backLeft, y: crease.y }, { x: -normal.x, y: normal.y },
      Math.min(reach * 0.6, w * 0.5), span, 1, 0, shadow);
  }

  /** Recorta un elemento con un polígono en coordenadas del libro (desplazado `dx` a las suyas). */
  private clip(el: HTMLElement, polygon: Point[], dx: number): void {
    if (polygon.length < 3) {
      el.style.clipPath = 'inset(50%)';
      return;
    }
    el.style.clipPath = `polygon(${polygon.map(q => `${(q.x + dx).toFixed(2)}px ${q.y.toFixed(2)}px`).join(',')})`;
  }

  /**
   * Franja de sombra alineada con el pliegue: nace en la línea y se abre `size` px hacia el lado
   * `side` (1 = hacia donde apunta la normal, -1 = el otro). El degradé va de la línea hacia afuera.
   */
  private strip(el: HTMLElement, at: Point, normal: Point, size: number, span: number, side: 1 | -1, dx: number, opacity: number): void {
    const angle = Math.atan2(normal.y, normal.x);
    el.style.width = `${Math.max(0, size).toFixed(1)}px`;
    el.style.height = `${span.toFixed(0)}px`;
    el.style.transform = `translate(${(at.x + dx).toFixed(2)}px, ${at.y.toFixed(2)}px) rotate(${angle.toFixed(5)}rad)`
      + ` translate(${side === 1 ? 0 : (-size).toFixed(2)}px, ${(-span / 2).toFixed(0)}px)`;
    el.style.opacity = opacity.toFixed(3);
  }

  private loop(): void {
    if (!this.active) return;
    // Si el navegador deja de pintar (pestaña oculta), el libro no queda a medio girar.
    clearTimeout(this.safety!);
    this.safety = setTimeout(() => this.finishNow(), 1800);
    if (this.raf !== null) return; // ya está girando: sigue hacia el destino nuevo
    let last = performance.now();
    const tick = (now: number) => {
      this.raf = null;
      const a = this.active;
      if (!a || a.dragging) return;
      const dt = Math.min(0.064, Math.max(0, (now - last) / 1000));
      last = now;
      a.state = stepSpring(a.state, a.target, dt);
      if (isSettled(a.state, a.target)) {
        a.state = { x: a.target, v: 0 };
        this.render(a);
        if (a.peel && a.target > 0) {
          clearTimeout(this.safety!); // levantada y quieta: espera al mouse
          return;
        }
        this.complete();
        return;
      }
      this.render(a);
      this.raf = requestAnimationFrame(tick);
    };
    this.zone.runOutsideAngular(() => { this.raf = requestAnimationFrame(tick); });
  }

  private cancelLoop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    clearTimeout(this.safety!);
  }

  private complete(): void {
    const a = this.active;
    this.active = null;
    this.cancelLoop();
    this.host.layer()?.replaceChildren();
    if (!this.frozen) this.host.container()?.classList.remove('is-flipping');
    if (a?.onDone) {
      const committed = a.target >= 180;
      const done = a.onDone;
      this.zone.run(() => done(committed));
    }
  }

  // ── Fotocopias de páginas ──────────────────────────────────────────────────

  /** Copia de una página del pliego `spread` (la cara de adentro de la tapa: reader-book-cover.ts). */
  copyPage(spread: number, side: Side): HTMLElement | null {
    return this.capturePage(spread, side);
  }

  /**
   * Ancho del libro abierto. Se mide en el papel y no en la capa: la capa vacía está oculta
   * (display: none) y mediría 0 justo cuando se arma la hoja.
   */
  private bookWidth(): number {
    return this.host.shell()?.clientWidth ?? 0;
  }

  private place(page: HTMLElement, side: Side): void {
    page.style.left = side === 'left' ? '0px' : `${this.bookWidth() / 2}px`;
  }

  private blankPage(): HTMLElement {
    const page = this.make('div', 'rd-flip-page');
    page.style.width = `${this.bookWidth() / 2}px`;
    return page;
  }

  /**
   * Copia de una página del pliego `spread` tal como se ve: papel, sombra del lomo, cabecera,
   * folios y el texto de esa columna. Sin posición horizontal (la pone quien la usa).
   */
  private capturePage(spread: number, side: Side): HTMLElement | null {
    const shell = this.host.shell();
    const canvas = this.host.canvas();
    const viewport = this.host.viewport();
    const layer = this.host.layer();
    if (!shell || !canvas || !viewport || !layer) return null;
    const width = shell.clientWidth;
    const height = shell.clientHeight;
    if (!width || !height) return null;
    const gap = this.host.gap();
    const stride = (viewport.clientWidth + gap) / 2;
    const firstPage = spread * 2;
    const page = firstPage + (side === 'right' ? 1 : 0);

    const sheetWindow = this.make('div', 'rd-flip-page');
    sheetWindow.style.width = `${width / 2}px`;
    const sheet = this.make('div', 'rd-snap');
    sheet.style.left = side === 'left' ? '0px' : `${-width / 2}px`;
    sheet.style.right = 'auto';
    sheet.style.width = `${width}px`;
    sheet.style.height = `${height}px`;
    sheetWindow.appendChild(sheet);

    for (const selector of ['.rd-book-gutter', '.rd-running-head', '.rd-page-footer']) {
      const el = shell.querySelector(`:scope > ${selector}`);
      if (el) sheet.appendChild(el.cloneNode(true));
    }

    const textWindow = this.make('div', 'reader-viewport reading-canvas-shell rd-paged rd-snap-viewport');
    textWindow.style.cssText = `position:absolute;left:${viewport.offsetLeft}px;top:${viewport.offsetTop}px;`
      + `width:${viewport.clientWidth}px;height:${viewport.clientHeight}px;overflow:hidden;`;
    const text = canvas.cloneNode(false) as HTMLElement;
    text.removeAttribute('id');
    text.style.transition = 'none';
    text.classList.remove('is-dragging');

    const found = this.blocksForPage(canvas, page, stride);
    let startColumn = page;
    if (found) {
      startColumn = found.column;
      // Un relleno hasta la altura donde empezaba el primer párrafo: desde ahí el texto corta igual.
      const spacer = document.createElement(found.paragraphBefore ? 'p' : 'div');
      spacer.style.cssText = `display:block;margin:0;padding:0;border:0;height:${Math.max(0, found.spacer)}px;`
        + 'min-height:0;text-indent:0;font-size:0;line-height:0;';
      text.appendChild(spacer);
      found.blocks.forEach((block, i) => {
        const copy = block.cloneNode(true) as HTMLElement;
        copy.removeAttribute('id');
        copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        if (i === 0 && found.marginTop !== null) copy.style.marginTop = `${found.marginTop}px`;
        text.appendChild(copy);
      });
    }
    text.style.transform = `translateX(${-(firstPage - startColumn) * stride}px)`;
    textWindow.appendChild(text);
    sheet.appendChild(textWindow);
    return sheetWindow;
  }

  /**
   * Bloques del lienzo que se ven en la página `page` (columna), la columna y la altura donde
   * empieza el primero, y si antes hay otro párrafo (para que la capitular no se repita).
   */
  private blocksForPage(canvas: HTMLElement, page: number, stride: number):
    { blocks: HTMLElement[]; column: number; spacer: number; marginTop: number | null; paragraphBefore: boolean } | null {
    const rect = canvas.getBoundingClientRect();
    const columnOf = (r: DOMRect) => Math.floor(((r.left + r.right) / 2 - rect.left) / stride);
    const blocks: HTMLElement[] = [];
    let start: HTMLElement | null = null;
    let startRect: DOMRect | null = null;
    for (const child of Array.from(canvas.children) as HTMLElement[]) {
      const rects = child.getClientRects();
      if (!rects.length) continue;
      const firstColumn = columnOf(rects[0]);
      if (firstColumn > page) break;
      const lastColumn = columnOf(rects[rects.length - 1]);
      if (lastColumn < page) continue;
      if (!start) {
        start = child;
        startRect = rects[0];
      }
      blocks.push(child);
    }
    if (!start || !startRect) return null;
    const y = startRect.top - rect.top;
    const margin = parseFloat(getComputedStyle(start).marginTop) || 0;
    const firstParagraph = canvas.querySelector(':scope > p');
    const paragraphBefore = !!firstParagraph && firstParagraph !== start
      && !!(firstParagraph.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      blocks,
      column: columnOf(startRect),
      spacer: y - margin >= 0 ? y - margin : 0,
      marginTop: y - margin >= 0 ? null : Math.max(0, y),
      paragraphBefore,
    };
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
