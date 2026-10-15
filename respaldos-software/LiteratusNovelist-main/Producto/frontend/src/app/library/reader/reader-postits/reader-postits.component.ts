import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';

import { NotificationService } from '../../../core/services/notification.service';
import { ReaderComponent } from '../reader.component';
import { ReaderAnnotationsService, ReaderPostIt, apiErrorMessage } from '../reader-annotations.service';

// Tamaño del papelito y de su nota (deben coincidir con el CSS de este componente).
const POSTIT_TAB_SIZE = 38;
const POSTIT_FLAG_WIDTH = 14;
const POSTIT_FLAG_HEIGHT = 28;
const POSTIT_CARD_WIDTH = 260;
const POSTIT_CARD_HEIGHT = 190;
// Curvas para las animaciones hechas con element.animate(): las mismas de los tokens CSS.
const READER_EASE = 'cubic-bezier(0.165, 0.84, 0.44, 1)'; // = --reader-ease (entrar/salir)
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';    // = --ease-in-out (moverse en pantalla)

/**
 * Post-its en los márgenes: papelitos pegados al costado de la página, a la altura de una línea.
 * Por dentro siguen anclados a una palabra (`word-N`) de esa línea, así acompañan al texto con
 * cualquier letra, ancho o vista. Con dos páginas: la izquierda los lleva en su margen
 * izquierdo y la derecha en el derecho; lectura continua: margen derecho.
 */
@Component({
  selector: 'app-reader-postits',
  templateUrl: './reader-postits.component.html',
  styleUrl: './reader-postits.component.css',
})
export class ReaderPostItsComponent implements AfterViewInit, OnDestroy {
  private readonly reader = inject(ReaderComponent);
  readonly annotations = inject(ReaderAnnotationsService);
  private readonly notifications = inject(NotificationService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('layer') private layerRef?: ElementRef<HTMLElement>;

  /** Post-it abierto (o recién creado, sin `id`) en su nota. */
  activePostIt: ReaderPostIt | null = null;
  postItCardX = 0;
  postItCardY = 0;
  /** Lado del papelito: la nota se abre hacia dentro de la página y crece desde él. */
  postItCardSide: 'left' | 'right' = 'right';
  isEditingPostIt = false;
  postItDraft = '';
  isPostItBusy = false;

  private marginLayoutRaf: number | null = null;
  private postItDrag: {
    postIt: ReaderPostIt; el: HTMLElement; pointerId: number; startX: number; startY: number;
    grabX: number; grabY: number; active: boolean;
  } | null = null;
  private suppressPostItClick = false;

  /** Los post-its del capítulo abierto: los papelitos que van en los márgenes. */
  get chapterPostIts(): ReaderPostIt[] {
    return this.annotations.chapterPostIts(this.reader.currentChapterId);
  }

  postItKey(postIt: ReaderPostIt): string {
    return postIt.id || 'nuevo';
  }

  ngAfterViewInit(): void {
    // Se arrastran desde su capa, fuera de la zona de Angular (pointermove llega en cada cuadro).
    this.ngZone.runOutsideAngular(() =>
      this.layerRef?.nativeElement.addEventListener('pointerdown', this.handleMarginPointerDown));
  }

  ngOnDestroy(): void {
    this.endPostItDrag();
    this.layerRef?.nativeElement.removeEventListener('pointerdown', this.handleMarginPointerDown);
    if (this.marginLayoutRaf !== null) cancelAnimationFrame(this.marginLayoutRaf);
  }

  /**
   * Botón "Post-it": aparece al instante a media altura de la página, con la nota abierta para
   * escribir. Con dos páginas: en la derecha; con una sola página o lectura continua: a
   * la altura del centro de la pantalla. Después se puede arrastrar a otra altura o página.
   */
  create(): void {
    const chapterId = this.reader.currentChapterId;
    const canvas = this.reader.canvasEl();
    if (!chapterId || !canvas || !this.reader.inventoryId) return;
    if (this.annotations.postItCount >= this.annotations.maxPostIts) {
      this.notifications.warning(
        `Ya pegaste ${this.annotations.maxPostIts} post-its en este libro. Despega alguno para pegar otro.`, 'Post-its');
      return;
    }
    const area = (this.reader.viewportEl() ?? canvas).getBoundingClientRect();
    const doublePage = this.reader.layoutMode === 'paged' && this.reader.columnsPerSpread > 1;
    const probeX = area.left + area.width * (doublePage ? 0.75 : 0.5);
    const word = this.nearestWord(probeX, area.top + area.height / 2);
    if (!word) return;
    const draft: ReaderPostIt = { id: '', chapter: chapterId, word: this.wordIndexOf(word), text: '' };
    this.reader.closeHighlightPopover();
    this.reader.dismissSelection();
    this.reader.isSettingsOpen = false;
    this.reader.isTocOpen = false;
    this.annotations.addDraft(draft);
    this.cdr.detectChanges();
    this.layoutMarginPostIts(); // ya existe el papelito: se coloca (y aparece) antes de abrir la nota
    this.openPostIt(draft);
  }

  onMarginPostItClick(postIt: ReaderPostIt): void {
    if (this.suppressPostItClick) { // el clic que llega al soltar un arrastre
      this.suppressPostItClick = false;
      return;
    }
    if (this.activePostIt === postIt) this.closePostIt();
    else this.openPostIt(postIt);
  }

  openPostIt(postIt: ReaderPostIt): void {
    const tab = this.marginPostItEl(postIt);
    if (!tab || !tab.hasAttribute('data-placed')) return;
    this.reader.closeHighlightPopover();
    const r = tab.getBoundingClientRect();
    this.postItCardSide = tab.dataset['side'] === 'left' ? 'left' : 'right';
    // La nota se abre hacia dentro de la página, al lado del papelito, sin salirse de la pantalla.
    const x = this.postItCardSide === 'left' ? r.right + 8 : r.left - 8 - POSTIT_CARD_WIDTH;
    this.postItCardX = Math.min(Math.max(x, 8), window.innerWidth - POSTIT_CARD_WIDTH - 8);
    this.postItCardY = Math.min(Math.max(r.top - 6, 8), window.innerHeight - POSTIT_CARD_HEIGHT - 8);
    this.activePostIt = postIt;
    this.postItDraft = postIt.text;
    this.isEditingPostIt = !postIt.id; // uno recién creado abre listo para escribir
    this.reader.hideWordMenu();
    if (this.isEditingPostIt) this.focusPostItText();
  }

  /** Cierra la nota. Un post-it recién creado que no se llegó a pegar desaparece. */
  closePostIt(): void {
    const draft = this.activePostIt && !this.activePostIt.id ? this.activePostIt : null;
    this.activePostIt = null;
    this.isEditingPostIt = false;
    this.postItDraft = '';
    if (draft) this.removeMarginPostIt(draft, 'fade');
  }

  editPostIt(): void {
    if (!this.activePostIt) return;
    this.postItDraft = this.activePostIt.text;
    this.isEditingPostIt = true;
    this.focusPostItText();
  }

  cancelPostItEdit(): void {
    if (!this.activePostIt?.id) this.closePostIt();
    else this.isEditingPostIt = false;
  }

  savePostIt(): void {
    const postIt = this.activePostIt;
    const text = this.postItDraft.trim();
    if (!postIt || !text || this.isPostItBusy) return;
    if (text === postIt.text) {
      this.isEditingPostIt = false;
      return;
    }
    this.isPostItBusy = true;
    this.annotations.savePostIt(postIt, text).subscribe({
      next: () => {
        this.isPostItBusy = false;
        this.isEditingPostIt = false;
        this.cdr.detectChanges();
        this.scheduleLayout();
      },
      error: err => {
        this.isPostItBusy = false;
        this.notifications.error(apiErrorMessage(err, 'No se pudo guardar el post-it.'), 'Post-its');
      },
    });
  }

  /** "Despegar": se borra y el papelito se despega de la página hacia afuera. */
  deletePostIt(): void {
    const postIt = this.activePostIt;
    if (!postIt || this.isPostItBusy) return;
    if (!postIt.id) {
      this.closePostIt();
      return;
    }
    this.isPostItBusy = true;
    this.annotations.deletePostIt(postIt).subscribe({
      next: () => {
        this.isPostItBusy = false;
        this.activePostIt = null;
        this.isEditingPostIt = false;
        this.removeMarginPostIt(postIt, 'peel');
        this.cdr.detectChanges();
      },
      error: err => {
        this.isPostItBusy = false;
        this.notifications.error(apiErrorMessage(err, 'No se pudo despegar el post-it.'), 'Post-its');
      },
    });
  }

  /** Lo saca de la lista después de su animación de salida (o al tiro, si no hay papelito a la vista). */
  private removeMarginPostIt(postIt: ReaderPostIt, exit: 'peel' | 'fade'): void {
    const drop = () => this.ngZone.run(() => {
      this.annotations.removeLocal(postIt);
      this.cdr.detectChanges();
      this.scheduleLayout();
    });
    const tab = this.marginPostItEl(postIt);
    const paper = tab?.querySelector<HTMLElement>('.margin-postit-paper');
    if (!tab || !paper || !tab.hasAttribute('data-placed')) {
      drop();
      return;
    }
    const outward = tab.dataset['side'] === 'left' ? -1 : 1;
    const keyframes: Keyframe[] = exit === 'peel'
      ? [{ opacity: 1 }, prefersReducedMotion()
          ? { opacity: 0 }
          : { opacity: 0, translate: `${outward * 14}px -10px`, rotate: `${outward * 16}deg` }]
      : [{ opacity: 1 }, prefersReducedMotion() ? { opacity: 0 } : { opacity: 0, scale: '0.95' }];
    paper.animate(keyframes, { duration: exit === 'peel' ? 200 : 150, easing: READER_EASE, fill: 'forwards' })
      .finished.then(drop, drop);
  }

  private focusPostItText(): void {
    setTimeout(() => (document.querySelector('.postit-card textarea') as HTMLTextAreaElement | null)?.focus(), 0);
  }

  // ── Colocar los papelitos en los márgenes ──
  /** Recoloca los papelitos en el próximo cuadro (fuera de la zona: no dispara detección de cambios). */
  scheduleLayout(): void {
    if (this.marginLayoutRaf !== null) return;
    this.ngZone.runOutsideAngular(() => {
      this.marginLayoutRaf = requestAnimationFrame(() => {
        this.marginLayoutRaf = null;
        this.layoutMarginPostIts();
      });
    });
  }

  /**
   * Pone cada papelito en el margen de su página, a la altura de la línea de su palabra, y oculta
   * los que no están a la vista (otro pliego, fuera del scroll). Escribe directo en el DOM porque
   * corre con cada giro de página y cada scroll; con varios en la misma altura, se apilan.
   */
  layoutMarginPostIts(): void {
    const canvas = this.reader.canvasEl();
    const layer = this.layerRef?.nativeElement;
    if (!canvas || !layer) return;
    const area = (this.reader.viewportEl() ?? canvas).getBoundingClientRect();
    const middle = area.left + area.width / 2;
    const compact = window.innerWidth <= 640;
    const tabWidth = compact ? POSTIT_FLAG_WIDTH : POSTIT_TAB_SIZE;
    const tabHeight = compact ? POSTIT_FLAG_HEIGHT : POSTIT_TAB_SIZE;
    const doublePage = this.reader.layoutMode === 'paged' && this.reader.columnsPerSpread > 1;
    const placed: { el: HTMLElement; side: 'left' | 'right'; y: number; x: number }[] = [];
    const postIts = this.chapterPostIts;

    layer.querySelectorAll<HTMLElement>('.margin-postit').forEach(el => {
      if (el === this.postItDrag?.el) return; // al que se arrastra lo mueve el puntero
      const postIt = postIts.find(p => this.postItKey(p) === el.dataset['postit']);
      const word = postIt ? document.getElementById(`word-${postIt.word}`) : null;
      const r = word?.getBoundingClientRect();
      if (!r || r.width === 0 || r.right <= area.left || r.left >= area.right
          || r.bottom <= area.top || r.top >= area.bottom) {
        el.removeAttribute('data-placed');
        return;
      }
      let side: 'left' | 'right' = 'right';
      let x: number;
      if (this.reader.layoutMode === 'paged') {
        side = doublePage && (r.left + r.right) / 2 < middle ? 'left' : 'right';
        // El viewport ya excluye los márgenes de rd-shell: el papel se pega por fuera del texto.
        x = side === 'left' ? area.left - tabWidth - 6 : area.right + 6;
      } else {
        // Lectura continua: al lado derecho del párrafo (el lienzo puede ser más ancho que el texto).
        const block = (word!.closest('p, h1, h2') as HTMLElement | null)?.getBoundingClientRect();
        x = Math.min((block ? block.right : area.right) + 12, window.innerWidth - tabWidth - 6);
      }
      placed.push({ el, side, x: Math.max(4, Math.min(x, window.innerWidth - tabWidth - 4)),
        y: Math.max(area.top + 4, Math.min((r.top + r.bottom) / 2 - tabHeight / 2, area.bottom - tabHeight - 4)) });
    });

    for (const side of ['left', 'right']) {
      const group = placed.filter(p => p.side === side).sort((a, b) => a.y - b.y);
      const minY = area.top + 4;
      const maxY = Math.max(minY, area.bottom - tabHeight - 4);
      const step = group.length > 1 ? Math.min(tabHeight + 6, (maxY - minY) / (group.length - 1)) : 0;
      let floor = minY;
      for (const p of group) {
        p.y = Math.max(p.y, floor);
        floor = p.y + step;
      }
      // Al apilar notas cerca del pie, se recoge el grupo para que ninguna salga de la pantalla.
      let ceiling = maxY;
      for (let i = group.length - 1; i >= 0; i--) {
        group[i].y = Math.min(group[i].y, ceiling);
        ceiling = group[i].y - step;
      }
    }

    for (const { el, side, x, y } of placed) {
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.dataset['side'] = side;
      el.setAttribute('data-placed', '');
      if (el.hasAttribute('data-enter')) { // recién creado: aparece la primera vez que se coloca
        el.removeAttribute('data-enter');
        this.popInMarginPostIt(el);
      }
    }
  }

  /** Aparece desde el borde de la página (no de la nada): de 0.9 a 1 con ease-out. */
  private popInMarginPostIt(el: HTMLElement): void {
    const paper = el.querySelector<HTMLElement>('.margin-postit-paper');
    if (!paper) return;
    paper.style.transformOrigin = el.dataset['side'] === 'left' ? 'right center' : 'left center';
    paper.animate(
      prefersReducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, scale: '0.9' }, { opacity: 1, scale: '1' }],
      { duration: 200, easing: READER_EASE });
  }

  private marginPostItEl(postIt: ReaderPostIt): HTMLElement | null {
    return this.layerRef?.nativeElement.querySelector<HTMLElement>(`.margin-postit[data-postit="${this.postItKey(postIt)}"]`) ?? null;
  }

  private wordIndexOf(word: HTMLElement): number {
    return parseInt(word.id.slice('word-'.length), 10);
  }

  /** La palabra bajo un punto o, si cae en un margen o un espacio, la más cercana a él. */
  private nearestWord(x: number, y: number): HTMLElement | null {
    const hit = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('.word') as HTMLElement | null;
    if (hit) return hit;
    const canvas = this.reader.canvasEl();
    if (!canvas) return null;
    const area = (this.reader.viewportEl() ?? canvas).getBoundingClientRect();
    let best: HTMLElement | null = null;
    let bestDistance = Infinity;
    canvas.querySelectorAll<HTMLElement>('.word').forEach(word => {
      const r = word.getBoundingClientRect();
      if (r.width === 0 || r.right <= area.left || r.left >= area.right
          || r.bottom <= area.top || r.top >= area.bottom) return; // fuera de la página visible
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = word;
      }
    });
    return best;
  }

  // ── Arrastrar un papelito ──
  // Se aprieta el papelito (se "levanta"), sigue al puntero y al soltarlo se asienta en el margen de
  // la página donde se soltó, a la altura de esa línea. Un toque corto abre la nota. Corre FUERA de
  // la zona de Angular; solo al soltar se guarda.
  private readonly handleMarginPointerDown = (event: PointerEvent) => {
    const el = (event.target as HTMLElement).closest('.margin-postit') as HTMLElement | null;
    if (!el || !event.isPrimary || event.button !== 0 || this.postItDrag) return; // un solo dedo a la vez
    const postIt = this.chapterPostIts.find(p => this.postItKey(p) === el.dataset['postit']);
    if (!postIt?.id) return; // uno recién creado se pega primero
    const r = el.getBoundingClientRect();
    this.postItDrag = {
      postIt, el, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      grabX: event.clientX - r.left, grabY: event.clientY - r.top, active: false,
    };
    window.addEventListener('pointermove', this.handlePostItDragMove);
    window.addEventListener('pointerup', this.handlePostItDragEnd);
    window.addEventListener('pointercancel', this.handlePostItDragEnd);
  };

  private readonly handlePostItDragMove = (event: PointerEvent) => {
    const drag = this.postItDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return; // aún es un toque
      drag.active = true;
      drag.el.setPointerCapture(drag.pointerId);
      drag.el.classList.add('is-lifted');
      document.body.style.cursor = 'grabbing';
      if (this.activePostIt) this.ngZone.run(() => this.closePostIt());
    }
    drag.el.style.transform = `translate(${event.clientX - drag.grabX}px, ${event.clientY - drag.grabY}px)`;
  };

  private readonly handlePostItDragEnd = (event: PointerEvent) => {
    const drag = this.postItDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.endPostItDrag();
    if (!drag.active) return; // fue un toque: el clic abre la nota
    this.suppressPostItClick = true;
    setTimeout(() => (this.suppressPostItClick = false), 0); // por si el clic no llega

    const canvas = this.reader.canvasEl();
    const from = drag.el.getBoundingClientRect();
    let target: HTMLElement | null = null;
    if (canvas && event.type === 'pointerup') {
      const area = (this.reader.viewportEl() ?? canvas).getBoundingClientRect();
      // Página donde se soltó y línea a esa altura, usando el viewport inmóvil del paginador.
      const doublePage = this.reader.layoutMode === 'paged' && this.reader.columnsPerSpread > 1;
      const left = doublePage && event.clientX < area.left + area.width / 2;
      const probeX = area.left + area.width * (!doublePage ? 0.5 : left ? 0.25 : 0.75);
      const probeY = Math.min(Math.max(from.top + from.height / 2, area.top + 4), area.bottom - 4);
      drag.el.style.pointerEvents = 'none'; // que el punto de prueba vea el texto, no el papelito
      target = this.nearestWord(probeX, probeY);
      drag.el.style.pointerEvents = '';
    }
    const word = target ? this.wordIndexOf(target) : drag.postIt.word;
    const moved = !isNaN(word) && word !== drag.postIt.word;
    // Guarda la línea nueva (el post-it se mueve ya); si el servidor falla, vuelve a donde estaba.
    if (moved) {
      this.ngZone.run(() => this.annotations.movePostIt(drag.postIt, word).subscribe({
        error: err => {
          this.scheduleLayout();
          this.notifications.error(apiErrorMessage(err, 'No se pudo mover el post-it.'), 'Post-its');
        },
      }));
    }

    // Se asienta desde donde se soltó hasta su lugar en el margen (FLIP).
    this.layoutMarginPostIts();
    if (!prefersReducedMotion()) {
      drag.el.animate(
        [{ transform: `translate(${from.left}px, ${from.top}px)` }, { transform: drag.el.style.transform }],
        { duration: 240, easing: EASE_IN_OUT });
    }
  };

  /** Termina (o cancela) un arrastre: suelta el papelito y quita los listeners. */
  private endPostItDrag(): void {
    const drag = this.postItDrag;
    if (!drag) return;
    this.postItDrag = null;
    window.removeEventListener('pointermove', this.handlePostItDragMove);
    window.removeEventListener('pointerup', this.handlePostItDragEnd);
    window.removeEventListener('pointercancel', this.handlePostItDragEnd);
    if (drag.el.hasPointerCapture?.(drag.pointerId)) drag.el.releasePointerCapture(drag.pointerId);
    drag.el.classList.remove('is-lifted');
    document.body.style.cursor = '';
  }
}

function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
