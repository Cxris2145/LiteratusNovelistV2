import { NgZone } from '@angular/core';

import {
  Affine, FoldCorner, LeafSize, Vec, compose, constrainCorner, dragCorner, dragGain, foldFor, invert, reflection,
  restCorner, rotation, scale, toCss, translate, turnedCorner,
} from './reader-book-fold';
import {
  PEEL_RESPONSE, RELEASE_RESPONSE, TURN_RESPONSE, TURN_RESPONSE_COMPACT, capVelocity, foldShading, isSettled,
  launchVelocity, shouldCommitTurn, stepSpring, turnLift,
} from './reader-book-flip-physics';

/**
 * La hoja que se da vuelta en la vista Libro: se dobla desde una esquina, como al tirar de ella con
 * la mano. La parte doblada muestra el reverso; la curva del papel junto al pliegue tiene brillo y
 * sombra, y la hoja levantada sombrea la página de abajo. Todo se mueve con transform (sin repintar
 * el texto en cada cuadro): el pliegue es una recta, cada lado se recorta con una caja girada sobre
 * ella y la solapa es la página reflejada sobre esa recta (geometría en reader-book-fold.ts).
 *
 * El capítulo es un solo lienzo de columnas que se traslada: solo puede mostrar un pliego seguido.
 * Mientras una hoja gira se ven páginas que no son seguidas (la que queda, las dos caras de la hoja
 * y la que se destapa), así que durante el giro se arman "fotocopias" de las páginas que faltan: se
 * copian solo los párrafos de esa página en un lienzo igual, desde la misma altura de columna, para
 * que corten las líneas igual que el original. El lienzo real salta al pliego nuevo y queda debajo;
 * al terminar el giro las copias se quitan y solo queda el texto real.
 *
 * Con dos páginas (escritorio) la hoja gira sobre el lomo del medio y su reverso es la página que
 * cae del otro lado. Con una sola (celular) el lomo está a la izquierda: hacia adelante la hoja se va
 * por el lomo; hacia atrás la anterior entra desde ahí y se asienta. Su reverso es la misma página
 * vista al trasluz, como el papel de verdad.
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
  /** Páginas a la vista: 2 (libro abierto) o 1 (libro delgado). */
  columns(): 1 | 2;
  /** Pliego desde el que se puede dar vuelta hacia adelante dentro del capítulo (null si ahora no). */
  forwardSpread(): number | null;
}

/** path: giro por clic (la esquina se levanta y baja sola); spring: resorte libre; drag: sigue al dedo. */
type Motion = 'path' | 'spring' | 'drag' | 'rest';

interface TurnElements {
  frame: HTMLElement;
  front: HTMLElement;
  under: HTMLElement;
  cast: HTMLElement;
  drop: HTMLElement;
  flap: HTMLElement;
  dim: HTMLElement;
  curl: HTMLElement;
  /** Medio lado de las cajas que recortan cada lado del pliegue (cubren todo el libro). */
  reach: number;
  /** Ancho de las franjas de sombra sin escalar. */
  band: number;
}

interface ActiveTurn {
  direction: 1 | -1;
  /** Una sola página hacia atrás: la hoja entra desde el lomo y se asienta, en vez de irse. */
  incoming: boolean;
  /** La hoja está a la derecha (1) o a la izquierda (-1) del lomo. */
  side: 1 | -1;
  spineX: number;
  leaf: LeafSize;
  corner: FoldCorner;
  /** El reverso es la misma página al trasluz (una sola página). */
  ghost: boolean;
  /** Ya está la copia de la página que queda quieta del otro lado del lomo (dos páginas). */
  hasFixed: boolean;
  /** Esquina en coordenadas de la hoja (reader-book-fold.ts) y su velocidad en px/s. */
  pos: Vec;
  vel: Vec;
  target: Vec;
  /** Desde dónde partió el giro por clic (para levantar la esquina a mitad de camino). */
  pathFrom: number;
  motion: Motion;
  response: number;
  peel: boolean;
  drag: { origin: Vec; grab: Vec; gain: number; samples: { p: Vec; t: number }[] } | null;
  /** Esquina superior izquierda del libro en la ventana (no se mueve durante el giro). */
  box: { left: number; top: number };
  els: TurnElements;
  onDone: ((committed: boolean) => void) | null;
  /** Se puede agarrar en vuelo y devolver (no los giros entre capítulos). */
  revertible: boolean;
}

/** Cuánto pasa la solapa sobre el pliegue para tapar la costura entre los dos recortes (px). */
const SEAM = 1;

interface TurnParts {
  fixed?: HTMLElement | null;
  front?: HTMLElement | null;
  under?: HTMLElement | null;
  back: HTMLElement;
}

export class ReaderBookFlip {
  private active: ActiveTurn | null = null;
  private frozen: { direction: 1 | -1; columns: 1 | 2; fixed: HTMLElement | null; front: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;
  private raf: number | null = null;
  private safety: ReturnType<typeof setTimeout> | null = null;
  /** La próxima hoja hacia adelante, armada y oculta, y para qué pliego y maqueta vale. */
  private ready: { key: string; turn: ActiveTurn } | null = null;
  private cancelIdle: (() => void) | null = null;

  constructor(private readonly host: BookFlipHost, private readonly zone: NgZone) {}

  /** Hay una hoja girando, levantada o un capítulo esperando para girar. */
  get busy(): boolean { return !!this.active || !!this.frozen; }
  get isPeeling(): boolean { return !!this.active?.peel; }
  get isDragging(): boolean { return this.active?.motion === 'drag'; }
  /** Una hoja va en el aire y se puede agarrar con el dedo o el mouse para seguirla o devolverla. */
  get canGrab(): boolean {
    const a = this.active;
    return !!a && !a.peel && a.revertible && a.motion !== 'drag' && !this.frozen;
  }
  /** Sentido de la hoja en el aire (0 = ninguna). */
  get turnDirection(): 0 | 1 | -1 { return this.active && !this.active.peel ? this.active.direction : 0; }
  /** Sentido del giro que espera a que se pinte el capítulo siguiente o anterior (0 = ninguno). */
  get frozenDirection(): 0 | 1 | -1 { return this.frozen?.direction ?? 0; }

  // ── Giro dentro del capítulo ────────────────────────────────────────────────

  /**
   * Da vuelta una hoja hacia `direction`. `move` lleva el lienzo real al pliego nuevo (sin animar)
   * y actualiza la vista; se llama en medio, después de copiar las páginas que se van.
   */
  turn(direction: 1 | -1, spread: number, move: () => void, corner: FoldCorner = 'bottom'): boolean {
    const columns = this.host.columns();
    // Hoja ya armada: la esquina levantada por el mouse o la que se armó de antemano (prewarm).
    let armed = this.active?.peel && this.active.direction === direction ? this.active : null;
    if (!armed) {
      this.finishNow();
      armed = direction === 1 ? this.adoptReady(spread) : null;
      if (armed) {
        armed.corner = corner;
        armed.pos = restCorner(armed.leaf, corner);
        armed.target = armed.pos;
      }
    }
    const fail = () => { if (armed) this.finishNow(); return false; };
    const incoming = columns === 1 && direction === -1;
    let fixed: HTMLElement | null = null;
    let front: HTMLElement | null = null;
    let under: HTMLElement | null = null;
    if (columns === 2) {
      fixed = armed?.hasFixed ? null : this.capturePage(spread, direction === 1 ? 0 : 1);
      front = armed ? null : this.capturePage(spread, direction === 1 ? 1 : 0);
      if ((!fixed && !armed?.hasFixed) || (!armed && !front)) return fail();
    } else if (incoming) {
      under = this.capturePage(spread, 0);
      if (!under) return false;
    } else if (!armed) {
      front = this.capturePage(spread, 0);
      if (!front) return false;
    }
    move();
    let back: HTMLElement | null = null;
    if (columns === 2) back = this.capturePage(spread + direction, direction === 1 ? 0 : 1);
    else if (incoming) back = this.ghostOf(this.capturePage(spread - 1, 0));
    else if (!armed) back = this.ghostOf(front!.cloneNode(true) as HTMLElement);
    if (!back && !(armed && columns === 1)) {
      this.finishNow();
      return false;
    }
    if (armed) {
      // La hoja sigue desde donde está (levantada o en reposo), sin volver a armarse.
      this.promotePeel(armed, fixed, back);
    } else {
      this.start(direction, incoming, corner, { fixed, front, under, back: back! });
    }
    const a = this.active!;
    a.onDone = null;
    a.revertible = true;
    this.launch(a);
    return true;
  }

  // ── Arrastrar la hoja con el mouse o el dedo ───────────────────────────────

  /** Empieza a doblar la hoja desde el punto donde se agarró (coordenadas de la ventana). */
  beginDrag(direction: 1 | -1, spread: number, move: () => void, revert: () => void, clientX: number, clientY: number): boolean {
    const shell = this.host.shell()?.getBoundingClientRect();
    const corner: FoldCorner = shell && clientY < shell.top + shell.height * 0.42 ? 'top' : 'bottom';
    if (!this.turn(direction, spread, move, this.active?.peel ? this.active.corner : corner) || !this.active) return false;
    this.takeHold(this.active, clientX, clientY, revert);
    return true;
  }

  /** Agarra la hoja que va en el aire (para seguirla o devolverla). `revert` deshace su pliego. */
  grab(clientX: number, clientY: number, revert: () => void): boolean {
    if (!this.canGrab) return false;
    this.takeHold(this.active!, clientX, clientY, revert);
    return true;
  }

  /** Mueve la hoja mientras se arrastra. */
  dragTo(clientX: number, clientY: number, timeStamp: number): void {
    const a = this.active;
    if (a?.motion !== 'drag' || !a.drag) return;
    const finger = this.toLeaf(a, clientX, clientY);
    const delta = { x: finger.x - a.drag.grab.x, y: finger.y - a.drag.grab.y };
    a.pos = dragCorner(a.drag.origin, delta, a.drag.gain, a.leaf, a.corner);
    a.drag.samples.push({ p: a.pos, t: timeStamp });
    if (a.drag.samples.length > 8) a.drag.samples.shift();
    this.render(a);
  }

  /** Al soltar: termina el giro o vuelve, con la velocidad que traía. */
  endDrag(): void {
    const a = this.active;
    if (a?.motion !== 'drag' || !a.drag) return;
    const samples = a.drag.samples;
    const last = samples[samples.length - 1];
    // Velocidad de los últimos 100 ms: una pausa antes de soltar la deja en cero.
    const first = last ? samples.find(s => s.t >= last.t - 100) ?? last : undefined;
    const dt = first && last ? (last.t - first.t) / 1000 : 0;
    const velocity = dt > 0 ? { x: (last!.p.x - first!.p.x) / dt, y: (last!.p.y - first!.p.y) / dt } : { x: 0, y: 0 };
    const rest = this.restPos(a);
    const commit = this.commitPos(a);
    const travel = commit.x - rest.x;
    const progress = (a.pos.x - rest.x) / travel;
    const committed = shouldCommitTurn(progress, velocity.x * Math.sign(travel), Math.abs(travel));
    a.drag = null;
    a.target = committed ? commit : rest;
    a.response = RELEASE_RESPONSE;
    a.vel = {
      x: capVelocity(velocity.x, a.pos.x, a.target.x, a.response),
      y: capVelocity(velocity.y, a.pos.y, a.target.y, a.response),
    };
    a.motion = 'spring';
    this.loop();
  }

  // ── Esquina que se levanta al acercar el mouse ─────────────────────────────

  /** Levanta la esquina hacia el mouse (o la sigue si ya está levantada). */
  peel(direction: 1 | -1, spread: number, clientX: number, clientY: number): void {
    const columns = this.host.columns();
    if (columns === 1 && direction === -1) return; // la hoja anterior no está a la vista
    let a = this.active;
    if (a && (!a.peel || a.direction !== direction)) return;
    if (this.frozen) return;
    if (!a) {
      a = direction === 1 ? this.adoptReady(spread) : null;
      if (!a) {
        const front = this.capturePage(spread, columns === 2 && direction === 1 ? 1 : 0);
        if (!front) return;
        // El reverso de una esquina es margen: papel en blanco (con una sola página, la misma al trasluz).
        const back = columns === 2 ? this.blankPage() : this.ghostOf(front.cloneNode(true) as HTMLElement)!;
        this.start(direction, false, 'bottom', { front, back });
        a = this.active!;
      }
      a.peel = true;
    }
    const rest = restCorner(a.leaf, a.corner);
    const mouse = this.toLeaf(a, clientX, clientY);
    // Tira hacia el mouse, poco: invita a agarrarla sin taparle el texto a nadie.
    const reach = Math.min(64, a.leaf.w * 0.12);
    let dx = (mouse.x - rest.x) * 0.5;
    let dy = (mouse.y - rest.y) * 0.5;
    const length = Math.hypot(dx, dy);
    if (length > reach) { dx *= reach / length; dy *= reach / length; }
    a.target = constrainCorner({ x: rest.x + Math.min(dx, -14), y: rest.y + Math.min(dy, -9) }, a.leaf, a.corner);
    a.response = PEEL_RESPONSE;
    if (a.motion !== 'drag') a.motion = 'spring';
    this.loop();
  }

  unpeel(): void {
    const a = this.active;
    if (!a?.peel || a.motion === 'drag') return;
    a.target = this.restPos(a);
    a.motion = 'spring';
    this.loop();
  }

  // ── Giro entre capítulos ───────────────────────────────────────────────────

  /**
   * El pliego que se ve se congela (copias de sus páginas) mientras el capítulo vecino se pinta
   * debajo; `resumeFrozen` da vuelta la hoja cuando su primera (o última) página está lista.
   */
  freeze(direction: 1 | -1, spread: number): boolean {
    this.finishNow();
    this.dropReady();
    const columns = this.host.columns();
    const layer = this.host.layer();
    const fixed = columns === 2 ? this.capturePage(spread, direction === 1 ? 0 : 1) : null;
    const front = this.capturePage(spread, columns === 2 && direction === 1 ? 1 : 0);
    if (!layer || !front || (columns === 2 && !fixed)) return false;
    const width = this.bookWidth() / columns;
    const spine = columns === 2 ? width : 0;
    if (fixed) {
      fixed.style.left = `${direction === 1 ? spine - width : spine}px`;
      layer.appendChild(fixed);
    }
    front.style.left = `${columns === 1 ? 0 : direction === 1 ? spine : spine - width}px`;
    layer.appendChild(front);
    layer.classList.toggle('is-single', columns === 1);
    this.host.container()?.classList.add('is-flipping');
    // Si el capítulo no llega (error de red, otro salto), el libro no queda congelado.
    const timer = setTimeout(() => this.cancelFrozen(), 3500);
    this.frozen = { direction, columns, fixed, front, timer };
    return true;
  }

  resumeFrozen(newSpread: number): void {
    const f = this.frozen;
    if (!f) return;
    clearTimeout(f.timer);
    this.frozen = null;
    const columns = this.host.columns();
    let parts: TurnParts | null = null;
    if (columns !== f.columns) {
      parts = null; // cambió el ancho mientras cargaba: sin giro
    } else if (columns === 2) {
      const back = this.capturePage(newSpread, f.direction === 1 ? 0 : 1);
      if (back) parts = { fixed: f.fixed, front: f.front, back };
    } else if (f.direction === 1) {
      parts = { front: f.front, back: this.ghostOf(f.front.cloneNode(true) as HTMLElement)! };
    } else {
      const back = this.ghostOf(this.capturePage(newSpread, 0));
      if (back) parts = { under: f.front, back };
    }
    this.host.layer()?.replaceChildren();
    if (!parts) {
      this.host.container()?.classList.remove('is-flipping');
      return;
    }
    this.start(f.direction, columns === 1 && f.direction === -1, 'bottom', parts);
    this.active!.revertible = false;
    this.launch(this.active!);
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
    if (a.peel) a.target = this.restPos(a);
    else if (a.motion === 'drag') {
      // Soltada a la fuerza (cambio de tamaño, de letra…): queda del lado en que más estaba.
      const rest = this.restPos(a);
      const commit = this.commitPos(a);
      a.target = (a.pos.x - rest.x) / (commit.x - rest.x) >= 0.5 ? commit : rest;
    }
    a.pos = { ...a.target };
    this.complete();
  }

  destroy(): void {
    this.finishNow();
    this.dropReady();
    this.cancelLoop();
  }

  // ── La próxima hoja, armada de antemano ────────────────────────────────────
  // Maquetar las copias de una página cuesta (el texto lleva guiones y cortes de línea cuidados):
  // en un teléfono lento, varios cuadros justo cuando la hoja tiene que empezar a moverse. Por eso,
  // con el libro quieto, se arma oculta la hoja que se daría vuelta hacia adelante; el giro la toma
  // tal cual y solo copia lo que depende del pliego nuevo.

  /** Arma la próxima hoja cuando el navegador esté libre (si cambió algo, la rehace). */
  prewarmSoon(): void {
    this.cancelPrewarm();
    if (this.active || this.frozen) return;
    this.zone.runOutsideAngular(() => {
      const idle = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
      if (idle) {
        const id = idle(() => this.prewarm(), { timeout: 700 });
        this.cancelIdle = () => (window as any).cancelIdleCallback?.(id);
      } else {
        const id = setTimeout(() => this.prewarm(), 250);
        this.cancelIdle = () => clearTimeout(id);
      }
    });
  }

  /** Cambió el texto (subrayados, letra, capítulo…): la hoja armada ya no sirve. */
  invalidate(): void {
    this.dropReady();
    this.prewarmSoon();
  }

  private prewarm(): void {
    this.cancelIdle = null;
    if (this.active || this.frozen) return;
    const spread = this.host.forwardSpread();
    if (spread === null) {
      this.dropReady(); // último pliego, voz andando…: la que haya quedado ya no sirve
      return;
    }
    const key = this.readyKey(spread);
    if (!key || this.ready?.key === key) return;
    const columns = this.host.columns();
    const fixed = columns === 2 ? this.capturePage(spread, 0) : null;
    const front = this.capturePage(spread, columns === 2 ? 1 : 0);
    if (!front || (columns === 2 && !fixed)) return;
    const back = columns === 2 ? this.blankPage() : this.ghostOf(front.cloneNode(true) as HTMLElement)!;
    const layer = this.host.layer()!;
    const turn = this.build(1, false, 'bottom', { fixed, front, back });
    layer.classList.add('is-ready');
    this.render(turn);
    layer.getBoundingClientRect(); // se maqueta ahora, con el libro quieto, y no al empezar a girar
    this.ready = { key, turn };
  }

  /** Toma la hoja armada si sigue sirviendo para este pliego. */
  private adoptReady(spread: number): ActiveTurn | null {
    const ready = this.ready;
    this.ready = null;
    this.cancelPrewarm();
    const layer = this.host.layer();
    layer?.classList.remove('is-ready');
    if (!ready) return null;
    const shell = this.host.shell();
    if (!shell || ready.key !== this.readyKey(spread)) {
      if (!this.active && !this.frozen) layer?.replaceChildren();
      return null;
    }
    const rect = shell.getBoundingClientRect();
    ready.turn.box = { left: rect.left, top: rect.top };
    this.active = ready.turn;
    this.host.container()?.classList.add('is-flipping');
    return ready.turn;
  }

  private dropReady(): void {
    this.cancelPrewarm();
    if (!this.ready) return;
    this.ready = null;
    const layer = this.host.layer();
    layer?.classList.remove('is-ready');
    if (!this.active && !this.frozen) layer?.replaceChildren();
  }

  private cancelPrewarm(): void {
    this.cancelIdle?.();
    this.cancelIdle = null;
  }

  /** Lo que tiene que seguir igual para que la hoja armada valga: pliego, tamaño y maqueta del texto. */
  private readyKey(spread: number): string {
    const shell = this.host.shell();
    const canvas = this.host.canvas();
    if (!shell || !canvas) return '';
    return [spread, this.host.columns(), shell.clientWidth, shell.clientHeight, canvas.scrollWidth, canvas.childElementCount].join('|');
  }

  // ── Armado de la hoja ──────────────────────────────────────────────────────

  private start(direction: 1 | -1, incoming: boolean, corner: FoldCorner, parts: TurnParts): void {
    this.active = this.build(direction, incoming, corner, parts);
    this.host.container()?.classList.add('is-flipping');
    this.render(this.active);
  }

  /** Arma la hoja en la capa (sin mostrarla ni moverla). */
  private build(direction: 1 | -1, incoming: boolean, corner: FoldCorner, parts: TurnParts): ActiveTurn {
    const layer = this.host.layer()!;
    const shell = this.host.shell()!;
    const columns = this.host.columns();
    const width = this.bookWidth();
    const height = shell.clientHeight;
    const leaf: LeafSize = { w: width / columns, h: height };
    const spineX = columns === 2 ? width / 2 : 0;
    const side: 1 | -1 = columns === 1 || direction === 1 ? 1 : -1;
    const reach = Math.ceil(Math.hypot(width, height)) + 4;
    const band = Math.ceil(leaf.w * 0.42);
    const rect = shell.getBoundingClientRect();
    // Vaciar la capa descarta la hoja armada de antemano, si la había.
    this.ready = null;
    layer.classList.remove('is-ready');
    layer.replaceChildren();
    // Con una sola página no hay nada a la izquierda del lomo: lo que pasa de ahí no se ve.
    layer.classList.toggle('is-single', columns === 1);

    if (parts.fixed) {
      parts.fixed.style.left = `${side === 1 ? spineX - leaf.w : spineX}px`;
      layer.appendChild(parts.fixed);
    }
    const frame = this.make('div', 'rd-flip-frame');
    // Cada lado del pliegue se recorta con una caja girada sobre él: la de afuera empieza en el
    // pliegue y la del lomo termina en él. La del lomo (la solapa) pasa 1 px: si no, entre los dos
    // bordes suavizados se asoma el texto de abajo como una costura punteada.
    const far = this.make('div', 'rd-flip-clip');
    far.style.cssText = `left:0;top:${-reach}px;width:${reach}px;height:${2 * reach}px`;
    const near = this.make('div', 'rd-flip-clip');
    near.style.cssText = `left:${-reach}px;top:${-reach}px;width:${reach + SEAM}px;height:${2 * reach}px`;

    const under = this.box(leaf, parts.under ?? null);
    const cast = this.band('is-cast', band, 2 * reach);
    under.appendChild(cast);
    const front = this.box(leaf, parts.front ?? null);
    const drop = this.make('div', 'rd-flip-drop');
    drop.style.width = `${leaf.w}px`;
    drop.style.height = `${leaf.h}px`;
    const flap = this.box(leaf, parts.back);
    flap.classList.add('rd-flip-flap');
    const dim = this.make('div', 'rd-flip-dim');
    const curl = this.band('is-curl', band, 2 * reach);
    flap.append(dim, curl);

    far.appendChild(under);
    near.append(front, drop, flap);
    frame.append(far, near);
    layer.appendChild(frame);

    const rest = restCorner(leaf, corner);
    const turned = turnedCorner(leaf, corner);
    const pos = incoming ? turned : rest;
    return {
      direction, incoming, side, spineX, leaf, corner, ghost: columns === 1, hasFixed: !!parts.fixed,
      pos, vel: { x: 0, y: 0 }, target: pos, pathFrom: pos.x, motion: 'rest',
      response: columns === 1 ? TURN_RESPONSE_COMPACT : TURN_RESPONSE,
      peel: false, drag: null, box: { left: rect.left, top: rect.top },
      els: { frame, front, under, cast, drop, flap, dim, curl, reach, band },
      onDone: null, revertible: false,
    };
  }

  /** La hoja ya armada (levantada o lista) pasa a ser un giro completo: se agrega la página que queda y el reverso. */
  private promotePeel(a: ActiveTurn, fixed: HTMLElement | null, back: HTMLElement | null): void {
    const layer = this.host.layer()!;
    if (fixed) {
      fixed.style.left = `${a.side === 1 ? a.spineX - a.leaf.w : a.spineX}px`;
      layer.insertBefore(fixed, layer.firstChild);
      a.hasFixed = true;
    }
    if (back) {
      back.style.left = '0px';
      a.els.flap.replaceChildren(back, a.els.dim, a.els.curl);
    }
    a.peel = false;
  }

  /** Arranca la hoja hacia el otro lado (o la sigue desde donde quedó levantada). */
  private launch(a: ActiveTurn): void {
    const rest = this.restPos(a);
    a.target = this.commitPos(a);
    if (a.pos.x === rest.x && a.pos.y === rest.y) {
      a.motion = 'path';
      a.pathFrom = a.pos.x;
      a.vel = { x: launchVelocity(a.pos.x, a.target.x, a.response), y: 0 };
    } else {
      a.motion = 'spring';
    }
    this.loop();
  }

  private takeHold(a: ActiveTurn, clientX: number, clientY: number, revert: () => void): void {
    this.cancelLoop();
    const grab = this.toLeaf(a, clientX, clientY);
    a.motion = 'drag';
    a.peel = false;
    // Con dos páginas, desde la esquina la esquina queda bajo el dedo y, lejos del borde, el pliegue
    // sigue al dedo. Con una sola el dedo no tiene dónde cruzar el lomo: siempre lo sigue el pliegue
    // (pasar la mitad de la página la da vuelta), también con la hoja que entra desde el lomo.
    a.drag = { origin: { ...a.pos }, grab, gain: a.ghost ? 2 : dragGain(grab.x, a.leaf), samples: [{ p: a.pos, t: performance.now() }] };
    a.onDone = committed => { if (!committed) revert(); };
    this.render(a);
  }

  private restPos(a: ActiveTurn): Vec {
    return a.incoming ? turnedCorner(a.leaf, a.corner) : restCorner(a.leaf, a.corner);
  }

  private commitPos(a: ActiveTurn): Vec {
    return a.incoming ? restCorner(a.leaf, a.corner) : turnedCorner(a.leaf, a.corner);
  }

  private render(a: ActiveTurn): void {
    const fold = foldFor(a.pos, a.leaf, a.corner);
    const { side, spineX, leaf, els } = a;
    // De coordenadas de la hoja a la capa: la hoja izquierda es la derecha reflejada sobre el lomo.
    const mid = { x: spineX + side * fold.mid.x, y: fold.mid.y };
    const normal = { x: side * fold.normal.x, y: fold.normal.y };
    const frame = compose(translate(mid.x, mid.y), rotation(normal.x, normal.y));
    const fromLayer = invert(frame);
    const nearIn = compose(translate(els.reach, els.reach), fromLayer);
    const farIn = compose(translate(0, els.reach), fromLayer);
    const leafX = side === 1 ? spineX : spineX - leaf.w;
    const leafAt = translate(leafX, 0);
    // La solapa: la parte doblada, reflejada sobre el pliegue. Con dos páginas muestra el reverso
    // (la página que cae del otro lado del lomo); con una, la misma página al trasluz.
    const fold180 = reflection(mid, normal);
    const flapMap: Affine = a.ghost
      ? compose(fold180, leafAt)
      : compose(fold180, reflection({ x: spineX, y: 0 }, { x: 1, y: 0 }), translate(side === 1 ? spineX - leaf.w : spineX, 0));

    els.frame.style.transform = toCss(frame);
    els.front.style.transform = toCss(compose(nearIn, leafAt));
    els.under.style.transform = toCss(compose(farIn, leafAt));
    const flapCss = toCss(compose(nearIn, flapMap));
    els.flap.style.transform = flapCss;
    els.drop.style.transform = flapCss;

    // Franjas de sombra: se miden desde el pliegue (afuera la sombra de la curva, adentro su brillo).
    const castWidth = Math.min(els.band, 10 + fold.depth * 0.45);
    const curlWidth = Math.min(els.band, 8 + fold.depth * 0.32);
    els.cast.style.transform = toCss(compose(invert(leafAt), frame, translate(0, -els.reach), scale(castWidth / els.band, 1)));
    els.curl.style.transform = toCss(compose(invert(flapMap), frame, translate(-curlWidth, -els.reach), scale((curlWidth + SEAM) / els.band, 1)));
    const shade = foldShading(fold.progress);
    els.cast.style.opacity = shade.cast.toFixed(3);
    els.curl.style.opacity = shade.curl.toFixed(3);
    els.dim.style.opacity = shade.dim.toFixed(3);
    els.drop.style.opacity = shade.drop.toFixed(3);
  }

  private loop(): void {
    if (!this.active) return;
    // Si el navegador deja de pintar (pestaña oculta), el libro no queda a medio girar.
    clearTimeout(this.safety!);
    this.safety = setTimeout(() => this.finishNow(), 1800);
    if (this.raf !== null) return; // ya se está moviendo: sigue hacia el destino nuevo
    let last = performance.now();
    const tick = (now: number) => {
      this.raf = null;
      const a = this.active;
      if (!a || a.motion === 'drag' || a.motion === 'rest') return;
      const dt = Math.min(0.064, Math.max(0, (now - last) / 1000));
      last = now;
      const tolerance = Math.max(1.2, a.leaf.w * 0.008);
      let settled: boolean;
      if (a.motion === 'path') {
        // Giro por clic: la esquina avanza con el resorte y se levanta a mitad de camino.
        const x = stepSpring({ x: a.pos.x, v: a.vel.x }, a.target.x, dt, a.response);
        const span = a.target.x - a.pathFrom;
        const along = span !== 0 ? (x.x - a.pathFrom) / span : 1;
        const rest = restCorner(a.leaf, a.corner);
        const lift = turnLift(along, a.leaf.h) * (a.corner === 'bottom' ? -1 : 1);
        a.pos = { x: x.x, y: rest.y + lift };
        a.vel = { x: x.v, y: 0 };
        settled = isSettled(x, a.target.x, tolerance);
      } else {
        const x = stepSpring({ x: a.pos.x, v: a.vel.x }, a.target.x, dt, a.response);
        const y = stepSpring({ x: a.pos.y, v: a.vel.y }, a.target.y, dt, a.response);
        a.pos = { x: x.x, y: y.x };
        a.vel = { x: x.v, y: y.v };
        settled = isSettled(x, a.target.x, tolerance) && isSettled(y, a.target.y, tolerance);
      }
      if (settled) {
        a.pos = { ...a.target };
        a.vel = { x: 0, y: 0 };
        this.render(a);
        const rest = this.restPos(a);
        if (a.peel && (a.pos.x !== rest.x || a.pos.y !== rest.y)) {
          a.motion = 'rest';
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
      const commit = this.commitPos(a);
      const committed = a.target.x === commit.x && a.target.y === commit.y;
      const done = a.onDone;
      this.zone.run(() => done(committed));
    }
    this.prewarmSoon();
  }

  /** Punto de la ventana en coordenadas de la hoja (el lomo en x = 0, hacia afuera positivo). */
  private toLeaf(a: ActiveTurn, clientX: number, clientY: number): Vec {
    return { x: (clientX - a.box.left - a.spineX) * a.side, y: clientY - a.box.top };
  }

  // ── Fotocopias de páginas ──────────────────────────────────────────────────

  /** Copia de una página del pliego (la usa también la tapa que gira, en reader-book-covers.ts). */
  copyPage(spread: number, slot: 0 | 1): HTMLElement | null {
    return this.capturePage(spread, slot);
  }

  /**
   * Ancho del libro abierto. Se mide en el papel y no en la capa: la capa vacía está oculta
   * (display: none) y mediría 0 justo cuando se arma la hoja.
   */
  private bookWidth(): number {
    return this.host.shell()?.clientWidth ?? 0;
  }

  /** Caja del tamaño de una página que se mueve con una transformación (origen arriba a la izquierda). */
  private box(leaf: LeafSize, page: HTMLElement | null): HTMLElement {
    const box = this.make('div', 'rd-flip-box');
    box.style.width = `${leaf.w}px`;
    box.style.height = `${leaf.h}px`;
    if (page) {
      page.style.left = '0px';
      box.appendChild(page);
    }
    return box;
  }

  /** Franja de sombra (su degradado lo pone reader-book.css); se escala a lo ancho. */
  private band(kind: string, width: number, height: number): HTMLElement {
    const band = this.make('div', `rd-flip-band ${kind}`);
    band.style.width = `${width}px`;
    band.style.height = `${height}px`;
    return band;
  }

  private blankPage(): HTMLElement {
    const page = this.make('div', 'rd-flip-page');
    page.style.width = `${this.bookWidth() / this.host.columns()}px`;
    return page;
  }

  /** La página vista desde atrás: el texto apenas se trasluce (la solapa ya la refleja). */
  private ghostOf(page: HTMLElement | null): HTMLElement | null {
    if (!page) return null;
    page.appendChild(this.make('div', 'rd-flip-ghost'));
    return page;
  }

  /**
   * Copia de una página del pliego `spread` tal como se ve: papel, sombra del lomo, cabecera,
   * folios y el texto de esa columna (`slot`: 0 la izquierda o la única, 1 la derecha).
   * Sin posición horizontal (la pone quien la usa).
   */
  private capturePage(spread: number, slot: 0 | 1): HTMLElement | null {
    const shell = this.host.shell();
    const canvas = this.host.canvas();
    const viewport = this.host.viewport();
    const layer = this.host.layer();
    if (!shell || !canvas || !viewport || !layer) return null;
    const width = shell.clientWidth;
    const height = shell.clientHeight;
    if (!width || !height) return null;
    const columns = this.host.columns();
    const pageWidth = width / columns;
    const gap = this.host.gap();
    const stride = (viewport.clientWidth + gap) / columns;
    const firstPage = spread * columns;
    const page = firstPage + slot;

    const sheetWindow = this.make('div', 'rd-flip-page');
    sheetWindow.style.width = `${pageWidth}px`;
    const sheet = this.make('div', 'rd-snap');
    sheet.style.left = `${-slot * pageWidth}px`;
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
