/**
 * La tapa (o la contratapa) que gira sobre el lomo al abrir y al cerrar el libro en la vista Libro.
 *
 * Con dos páginas, la tapa cerrada está sobre la página derecha: al abrir gira sobre el lomo hasta
 * quedar sobre la izquierda, y mientras tanto el libro crece desde donde estaba la tapa hasta quedar
 * abierto en el centro. La izquierda no existe hasta que la tapa cae ahí (un recorte la va mostrando
 * justo debajo de ella), y el reverso de la tapa es la copia de esa página: al terminar, la tapa se
 * quita y debajo está la página real. La contratapa hace lo mismo al revés: está sobre la derecha
 * (por dentro, la última página) y al cerrar pasa sobre la izquierda; el libro se achica hasta donde
 * se dibuja la contratapa sola.
 *
 * Con una sola página (celular) la tapa gira sobre el lomo, a la izquierda, hacia afuera de la
 * pantalla, y la página aparece debajo creciendo desde el tamaño de la tapa.
 *
 * Solo se animan transform, opacity y el recorte (WAAPI): sigue suave aunque el capítulo esté
 * cargando. Abrir y cerrar el libro es raro (una vez por lectura): puede tomarse casi un segundo.
 */
export interface BookCoverHost {
  container(): HTMLElement | null;
  shell(): HTMLElement | null;
  /** Páginas a la vista: 2 (libro abierto) o 1 (libro delgado). */
  columns(): 1 | 2;
  /** Copia de una página del pliego (`slot` 0 la izquierda o la única, 1 la derecha). */
  copyPage(spread: number, slot: 0 | 1): HTMLElement | null;
}

/** La tapa cerrada, medida y copiada mientras todavía está dibujada. */
export interface ClosedCover {
  side: 'front' | 'back';
  rect: DOMRect;
  face: HTMLElement;
}

/** El libro se acomoda: responde apenas se toca y se asienta despacio. */
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
/** La misma curva para una animación que se reproduce al revés (WAAPI aplica la curva a la línea invertida). */
const EASE_OUT_REVERSED = 'cubic-bezier(0.68, 0, 0.77, 0)';
/** La tapa gira: se levanta, acelera y cae suave (easeInOutCubic). */
const EASE_TURN = 'cubic-bezier(0.65, 0, 0.35, 1)';
/** Sombra máxima de una cara de canto a la luz. */
const EDGE_SHADE = 0.28;
const DURATION = 900;
const DURATION_COMPACT = 650;
/** Muestras del giro: el recorte sigue el borde de la tapa, que no se mueve en línea recta. */
const STEPS = 24;
/** Margen del recorte para que se vean la tapa dura, los cantos y la sombra del libro. */
const BLEED = 80;

export class ReaderBookCovers {
  private running: { animations: Animation[]; finish: () => void } | null = null;

  constructor(private readonly host: BookCoverHost) {}

  /** Una tapa está girando. */
  get busy(): boolean { return !!this.running; }

  /** Mide y copia la tapa cerrada (antes de quitarla, o mientras está oculta). */
  capture(side: 'front' | 'back', closedBook: HTMLElement): ClosedCover {
    // Su entrada y el giro leve del mouse no cuentan: se mide donde queda quieta.
    closedBook.getAnimations().forEach(a => a.cancel());
    const transform = closedBook.style.transform;
    closedBook.style.transform = 'none';
    const rect = closedBook.getBoundingClientRect();
    closedBook.style.transform = transform;
    const face = closedBook.cloneNode(true) as HTMLElement;
    face.removeAttribute('aria-label');
    face.setAttribute('tabindex', '-1');
    face.style.cssText = `position:absolute;left:0;top:0;width:${rect.width}px;height:${rect.height}px;max-width:none;`
      + 'aspect-ratio:auto;margin:0;animation:none;transition:none;transform:none;box-shadow:none;cursor:default;';
    return { side, rect, face };
  }

  /** Abre el libro desde la tapa (o la contratapa) ya medida. */
  open(cover: ClosedCover, spread: number, done: () => void): boolean {
    return this.play(cover, spread, 'open', done);
  }

  /** Cierra el libro sobre la tapa (o la contratapa) ya dibujada y oculta. */
  close(cover: ClosedCover, spread: number, done: () => void): boolean {
    return this.play(cover, spread, 'close', done);
  }

  /** Termina de inmediato (otra acción no espera a la tapa). */
  finish(): void {
    this.running?.finish();
  }

  private play(cover: ClosedCover, spread: number, action: 'open' | 'close', done: () => void): boolean {
    this.finish();
    const container = this.host.container();
    const shell = this.host.shell();
    if (!container || !shell || !shell.clientWidth || !shell.clientHeight) return false;
    const plan = this.host.columns() === 2
      ? this.planOpenBook(cover, spread, action, container, shell)
      : this.planThinBook(cover, action, container, shell);
    if (!plan) return false;

    container.classList.add('rd-cover-moving');
    const animations = plan.animate();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.running = null;
      animations.forEach(a => a.cancel());
      plan.layer.remove();
      container.classList.remove('rd-cover-moving');
      done();
    };
    this.running = { animations, finish };
    Promise.all(animations.map(a => a.finished)).then(finish, () => { /* cancelada: ya terminó */ });
    return true;
  }

  // ── Libro abierto (dos páginas) ──────────────────────────────────────────

  private planOpenBook(cover: ClosedCover, spread: number, action: 'open' | 'close', container: HTMLElement, shell: HTMLElement) {
    const page = cover.side === 'front' ? 1 : 0;
    const inner = this.host.copyPage(spread, cover.side === 'front' ? 0 : 1);
    if (!inner) return null;
    const box = shell.getBoundingClientRect();
    const frame = container.getBoundingClientRect();
    const width = shell.clientWidth / 2;
    const height = shell.clientHeight;
    // Dónde queda el libro cuando está cerrado: la página tapada coincide con la tapa sola.
    const scale = cover.rect.height / height;
    const closedPose = `translate(${cover.rect.left - box.left - page * width * scale}px, ${cover.rect.top - box.top}px) scale(${scale})`;
    const openPose = 'translate(0px, 0px) scale(1)';

    const layer = this.make(shell, 'div', 'rd-cover-layer');
    layer.style.cssText = `left:${box.left - frame.left}px;top:${box.top - frame.top}px;width:${shell.clientWidth}px;height:${height}px;`
      + `perspective:${Math.round(Math.max(2400, width * 3.4))}px;`;
    const cast = this.make(shell, 'div', 'rd-cover-cast');
    cast.style.cssText = `left:${width}px;width:${width}px;`;
    const leaf = this.make(shell, 'div', 'rd-cover-leaf');
    leaf.style.cssText = `left:${width}px;width:${width}px;`;
    // Por fuera: la tapa sobre la derecha; por dentro: la página que queda a la izquierda.
    // La contratapa al revés: por dentro la última página derecha, por fuera la contratapa.
    const coverFace = this.face(shell, this.fit(cover, 1 / scale));
    const pageFace = this.face(shell, inner);
    const outside = cover.side === 'front' ? coverFace : pageFace;
    const inside = cover.side === 'front' ? pageFace : coverFace;
    inside.classList.add('is-inside');
    leaf.append(outside, inside);
    layer.append(cast, leaf);
    container.appendChild(layer);

    // Línea de tiempo "hacia adelante": la hoja va de la derecha (0°) a la izquierda (180°). Para la
    // tapa eso es abrir; para la contratapa, cerrar. Lo otro se reproduce al revés.
    const forward = cover.side === 'front' ? action === 'open' : action === 'close';
    const steps = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
    const angle = (k: number) => 180 * k;
    const edge = (k: number) => width * Math.cos((angle(k) * Math.PI) / 180); // borde de la hoja desde el lomo
    const clip = steps.map(k => {
      if (cover.side === 'front') {
        // Lo que está a la izquierda aparece debajo de la tapa a medida que cae.
        const left = k >= 1 ? -BLEED : angle(k) <= 90 ? width : width + edge(k);
        return { offset: k, clipPath: `inset(${-BLEED}px ${-BLEED}px ${-BLEED}px ${left}px)` };
      }
      // Lo que está a la derecha desaparece debajo de la contratapa a medida que se levanta.
      const right = k <= 0 ? -BLEED : angle(k) >= 90 ? width : width - edge(k);
      return { offset: k, clipPath: `inset(${-BLEED}px ${right}px ${-BLEED}px ${-BLEED}px)` };
    });
    const pose = cover.side === 'front' ? [closedPose, openPose] : [openPose, closedPose];
    // El giro, el recorte y las sombras van con la misma curva (el recorte sigue el borde de la tapa);
    // el libro que se acomoda, con otra que responde antes.
    const direction: PlaybackDirection = forward ? 'normal' : 'reverse';
    const timing: KeyframeAnimationOptions = { duration: DURATION, easing: EASE_TURN, fill: 'both', direction };
    const bookTiming: KeyframeAnimationOptions = { ...timing, easing: forward ? EASE_OUT : EASE_OUT_REVERSED };
    const book = [{ transformOrigin: '0 0', transform: pose[0] }, { transformOrigin: '0 0', transform: pose[1] }];
    // A los 90° la hoja queda de canto: ahí se cambia de cara (además de backface-visibility, que no
    // todos los navegadores respetan con contenido transformado adentro).
    const showUntilEdge = [{ offset: 0, opacity: 1 }, { offset: 0.5, opacity: 1 }, { offset: 0.5, opacity: 0 }, { offset: 1, opacity: 0 }];
    const showFromEdge = [{ offset: 0, opacity: 0 }, { offset: 0.5, opacity: 0 }, { offset: 0.5, opacity: 1 }, { offset: 1, opacity: 1 }];
    return {
      layer,
      animate: () => [
        shell.animate(book, bookTiming),
        shell.animate(clip, timing),
        layer.animate(book, bookTiming),
        leaf.animate(steps.map(k => ({ offset: k, transform: `rotateY(${-angle(k)}deg)` })), timing),
        outside.animate(showUntilEdge, timing),
        inside.animate(showFromEdge, timing),
        // Cada cara se oscurece al quedar de canto a la luz (a 90°); la hoja que se levanta sombrea la derecha.
        outside.lastElementChild!.animate([{ offset: 0, opacity: 0 }, { offset: 0.5, opacity: EDGE_SHADE }, { offset: 1, opacity: EDGE_SHADE }], timing),
        inside.lastElementChild!.animate([{ offset: 0, opacity: EDGE_SHADE }, { offset: 0.5, opacity: EDGE_SHADE }, { offset: 1, opacity: 0 }], timing),
        cast.animate([{ offset: 0, opacity: 0 }, { offset: 0.25, opacity: 0.8 }, { offset: 0.6, opacity: 0 }, { offset: 1, opacity: 0 }], timing),
      ],
    };
  }

  // ── Libro delgado (una página) ───────────────────────────────────────────

  private planThinBook(cover: ClosedCover, action: 'open' | 'close', container: HTMLElement, shell: HTMLElement) {
    const box = shell.getBoundingClientRect();
    const frame = container.getBoundingClientRect();
    const width = shell.clientWidth;
    const height = shell.clientHeight;
    // La página crece desde el tamaño de la tapa (a lo ancho, centrada en ella).
    const scale = cover.rect.width / width;
    const closedPose = `translate(${cover.rect.left - box.left}px, ${cover.rect.top + cover.rect.height / 2 - box.top - (height * scale) / 2}px) scale(${scale})`;
    const openPose = 'translate(0px, 0px) scale(1)';

    const layer = this.make(shell, 'div', 'rd-cover-layer is-thin');
    layer.style.cssText = `left:${cover.rect.left - frame.left}px;top:${cover.rect.top - frame.top}px;`
      + `width:${cover.rect.width}px;height:${cover.rect.height}px;perspective:1300px;`;
    const leaf = this.make(shell, 'div', 'rd-cover-leaf');
    leaf.style.cssText = 'left:0;width:100%;';
    const outside = this.face(shell, this.fit(cover, 1));
    const inside = this.face(shell, this.make(shell, 'div', 'rd-cover-board'));
    inside.classList.add('is-inside');
    leaf.append(outside, inside);
    layer.appendChild(leaf);
    container.appendChild(layer);

    // Abrir: la tapa (o la contratapa) se va por el lomo; cerrar: vuelve desde ahí.
    const direction: PlaybackDirection = action === 'open' ? 'normal' : 'reverse';
    const timing: KeyframeAnimationOptions = { duration: DURATION_COMPACT, easing: EASE_TURN, fill: 'both', direction };
    const bookTiming: KeyframeAnimationOptions = { ...timing, easing: action === 'open' ? EASE_OUT : EASE_OUT_REVERSED };
    return {
      layer,
      animate: () => [
        shell.animate([
          { offset: 0, transformOrigin: '0 0', transform: closedPose, opacity: 0 },
          { offset: 0.15, opacity: 0 },
          { offset: 0.6, opacity: 1 },
          { offset: 1, transformOrigin: '0 0', transform: openPose, opacity: 1 },
        ], bookTiming),
        leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-120deg)' }], timing),
        // Se desvanece la capa y no la hoja: la opacidad en la hoja aplanaría su 3D.
        layer.animate([{ offset: 0, opacity: 1 }, { offset: 0.45, opacity: 1 }, { offset: 1, opacity: 0 }], timing),
        outside.lastElementChild!.animate([{ opacity: 0 }, { opacity: 0.5 }], timing),
      ],
    };
  }

  // ── Piezas ───────────────────────────────────────────────────────────────

  /** La copia de la tapa cerrada, a su tamaño de siempre y escalada para cubrir una página. */
  private fit(cover: ClosedCover, scale: number): HTMLElement {
    const face = cover.face.cloneNode(true) as HTMLElement;
    face.style.transformOrigin = '0 0';
    face.style.transform = scale === 1 ? 'none' : `scale(${scale})`;
    return face;
  }

  /** Una cara de la hoja, con su sombra encima. */
  private face(shell: HTMLElement, content: HTMLElement): HTMLElement {
    const face = this.make(shell, 'div', 'rd-cover-face');
    content.style.left = '0px';
    face.append(content, this.make(shell, 'div', 'rd-cover-shade'));
    return face;
  }

  /** Elemento con el atributo de estilos del lector (lo copia del papel). */
  private make(shell: HTMLElement, tag: string, className: string): HTMLElement {
    const el = document.createElement(tag);
    el.className = className;
    el.setAttribute('aria-hidden', 'true');
    const attr = shell.getAttributeNames().find(name => name.startsWith('_ngcontent'));
    if (attr) el.setAttribute(attr, '');
    return el;
  }
}
