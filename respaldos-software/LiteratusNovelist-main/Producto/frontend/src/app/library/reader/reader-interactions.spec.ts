import { ChangeDetectorRef } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { ChatService } from '../../core/services/chat.service';
import { ReadingSessionService } from '../../core/services/reading-session.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { ReaderTabsService } from '../../core/services/reader-tabs.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { NotificationService } from '../../core/services/notification.service';
import { VocabularyService } from '../../core/services/vocabulary.service';
import { ReadingSummaryService } from '../../core/services/reading-summary.service';
import { NotebookService } from '../../notebook/notebook.service';
import { BookSearchService } from './book-search.service';
import { ReaderComponent } from './reader.component';
import { ReaderAnnotationsService } from './reader-annotations.service';
import { ReaderNarrationService } from './reader-narration.service';
import { ReaderSettingsService } from './reader-settings.service';
import { DEFAULT_READER_SETTINGS, ReaderSettings } from './reader-settings';

/** DOM pequeño y geometría real; sin ngOnInit, peticiones ni almacenamiento de usuario. */
describe('interacciones del e-reader', () => {
  let reader: ReaderComponent;
  let internals: any;
  let viewport: HTMLElement;
  let canvas: HTMLElement;
  let settings: { value: ReaderSettings; changes$: Subject<(keyof ReaderSettings)[]>; update: (patch: Partial<ReaderSettings>) => void };
  const width = 400;
  let flowLayout = false;
  let flowWidth = width;
  let flowStyle: HTMLStyleElement | null = null;
  let originalWindowWidth: PropertyDescriptor | undefined;

  const applyLayout = () => {
    const paged = settings.value.layoutMode === 'paged';
    if (flowLayout) {
      canvas.style.width = `${flowWidth}px`;
      viewport.style.width = `${flowWidth}px`;
      canvas.style.fontSize = `${settings.value.fontSize}px`;
      canvas.style.lineHeight = `${Math.round(settings.value.fontSize * settings.value.lineHeight)}px`;
      canvas.style.columnCount = paged ? String(reader.columnsPerSpread) : 'auto';
      canvas.style.overflowY = paged ? 'visible' : 'auto';
      canvas.style.overflowX = paged ? 'visible' : 'hidden';
      return;
    }
    canvas.style.overflowY = paged ? 'visible' : 'auto';
    canvas.style.overflowX = paged ? 'visible' : 'hidden';
    canvas.querySelectorAll<HTMLElement>('.word').forEach((word, i) => {
      word.style.left = `${paged ? Math.floor(i / 6) * width + (i % 6) * 55 : 0}px`;
      word.style.top = `${paged ? 20 : i * 50}px`;
    });
  };

  /** Columnas CSS reales: la posición de cada palabra depende de letra, ancho y alto. */
  const useFlowLayout = () => {
    flowLayout = true;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    viewport.setAttribute('data-reader-test-flow', '');
    flowStyle = document.createElement('style');
    flowStyle.textContent = '[data-reader-test-flow] .reading-canvas { height: 100%; font-family: serif; column-gap: 40px; }';
    document.head.appendChild(flowStyle);
    canvas.style.columnGap = '40px';
    canvas.replaceChildren();
    for (let i = 0; i < 240; i++) {
      const word = document.createElement('span');
      word.id = `word-${i}`;
      word.className = 'word';
      word.textContent = 'palabra';
      canvas.append(word, document.createTextNode(' '));
    }
    internals.totalWordCount = 240;
    applyLayout();
    reader.recalculateSpreads();
  };

  const pointer = (type: string, x: number, time: number, y = 100) => {
    const event = new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true,
      button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'timeStamp', { value: time });
    viewport.dispatchEvent(event);
    return event;
  };

  const startAtMiddlePage = () => {
    reader.currentSpreadIndex = 1;
    internals.pageOffsetX = width;
    internals.spreadAnchorWord = 6;
    canvas.style.transform = `translateX(-${width}px)`;
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    flowLayout = false;
    flowWidth = width;
    flowStyle = null;
    originalWindowWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    settings = {
      value: { ...DEFAULT_READER_SETTINGS, pageTurn: 'none', wpm: 120, wpmAuto: false },
      changes$: new Subject(),
      update: patch => {
        const keys = (Object.keys(patch) as (keyof ReaderSettings)[]).filter(key => settings.value[key] !== patch[key]);
        settings.value = { ...settings.value, ...patch };
        if (flowLayout) applyLayout();
        if (keys.length) settings.changes$.next(keys);
      },
    };
    TestBed.configureTestingModule({ providers: [
      ...[ApiService, ChatService, ActivatedRoute, Router, FavoritesService, ReaderTabsService,
        CharacterChatService, NotificationService, VocabularyService, ReadingSummaryService,
        NotebookService, BookSearchService].map(provide => ({ provide, useValue: {} })),
      { provide: ReaderSettingsService, useValue: settings },
      { provide: ReaderNarrationService, useValue: { stop: () => undefined } },
      { provide: ReaderAnnotationsService, useValue: { bookmarks: [], bookmarkIn: () => null } },
      { provide: ReadingSessionService, useValue: { endSession: () => undefined } },
      { provide: ChangeDetectorRef, useValue: { detectChanges: applyLayout, markForCheck: () => undefined } },
    ] });
    reader = TestBed.runInInjectionContext(() => new ReaderComponent());
    internals = reader as any;
    reader.totalSpreads = 3;
    reader.chapterPageCount = 3;
    reader.totalPages = 1;
    reader.isFullyRendered = true;
    internals.totalWordCount = 18;
    reader.columnsPerSpread = 1;

    viewport = document.createElement('div');
    viewport.className = 'reader-viewport';
    viewport.style.cssText = `position:fixed;left:40px;top:40px;width:${width}px;height:300px;overflow:hidden;`;
    canvas = document.createElement('main');
    canvas.className = 'reading-canvas';
    canvas.style.cssText = `position:relative;width:${width}px;height:300px;column-gap:0;`;
    for (let i = 0; i < 18; i++) {
      const word = document.createElement('span');
      word.id = `word-${i}`;
      word.className = 'word';
      word.textContent = 'palabra';
      word.style.cssText = 'position:absolute;display:block;width:45px;height:20px;';
      canvas.appendChild(word);
    }
    viewport.appendChild(canvas);
    document.body.appendChild(viewport);
    applyLayout();
    // PointerEvent sintético no crea un puntero activo en el navegador; se comprueba la solicitud de captura.
    spyOn(viewport, 'setPointerCapture');
    reader.ngAfterViewInit();
    viewport.addEventListener('click', event => reader.onCanvasClick(event));
    settings.changes$.subscribe(keys => internals.onSettingsChanged(keys));
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    reader.ngOnDestroy();
    viewport.remove();
    settings.changes$.complete();
    flowStyle?.remove();
    if (originalWindowWidth) Object.defineProperty(window, 'innerWidth', originalWindowWidth);
  });

  it('la página sigue al dedo y pointercancel la devuelve sin avanzar', () => {
    startAtMiddlePage();
    pointer('pointerdown', 350, 0);
    const move = pointer('pointermove', 290, 150);
    expect(canvas.style.transform).toBe('translateX(-460px)');
    expect(move.defaultPrevented).toBeTrue();
    expect(viewport.setPointerCapture).toHaveBeenCalledWith(7);
    pointer('pointercancel', 290, 160);
    expect(canvas.style.transform).toBe('translateX(-400px)');
    expect(reader.currentSpreadIndex).toBe(1);
  });

  it('un arrastre lento y corto vuelve a la página actual', fakeAsync(() => {
    startAtMiddlePage();
    pointer('pointerdown', 350, 0);
    pointer('pointermove', 300, 200);
    pointer('pointerup', 300, 300);
    tick(0);
    expect(reader.currentSpreadIndex).toBe(1);
    expect(canvas.style.transform).toBe('translateX(-400px)');
  }));

  it('superar el 30 % completa el avance y oculta las barras', fakeAsync(() => {
    startAtMiddlePage();
    reader.chromeVisible.set(true);
    pointer('pointerdown', 350, 0);
    pointer('pointermove', 190, 300);
    pointer('pointerup', 190, 500);
    tick(0);
    expect(reader.currentSpreadIndex).toBe(2);
    expect(canvas.style.transform).toBe('translateX(-800px)');
    expect(reader.chromeVisible()).toBeFalse();
  }));

  it('un gesto rápido completa el avance aunque recorra menos del 30 %', fakeAsync(() => {
    pointer('pointerdown', 350, 0);
    pointer('pointermove', 290, 40);
    pointer('pointerup', 290, 50);
    tick(0);
    expect(reader.currentSpreadIndex).toBe(1);
    expect(canvas.style.transform).toBe('translateX(-400px)');
  }));

  it('con una selección nativa el gesto y el toque conservan la página', () => {
    const range = document.createRange();
    range.selectNodeContents(canvas.querySelector('#word-0')!);
    window.getSelection()!.addRange(range);
    pointer('pointerdown', 350, 0);
    pointer('pointermove', 180, 80);
    pointer('pointerup', 180, 100);
    viewport.dispatchEvent(new MouseEvent('click', { clientX: 430, clientY: 100 }));
    expect(reader.currentSpreadIndex).toBe(0);
    expect(canvas.style.transform).toBe('');
    expect(reader.chromeVisible()).toBeFalse();
  });

  it('Páginas espera según palabras y ppm, avanza y se detiene al final del libro', fakeAsync(() => {
    reader.toggleAutoScroll(true); // 6 palabras / 120 ppm = 3 segundos por página.
    tick(2999);
    expect(reader.currentSpreadIndex).toBe(0);
    tick(1);
    expect(reader.currentSpreadIndex).toBe(1);
    expect(canvas.style.transform).toBe('translateX(-400px)');
    expect(canvas.scrollTop).toBe(0);
    tick(3000);
    expect(reader.currentSpreadIndex).toBe(2);
    tick(3000);
    expect(reader.autoScrollActive).toBeFalse();
    expect(reader.currentSpreadIndex).toBe(2);
  }));

  it('pausar el avance automático cancela el próximo cambio de página', fakeAsync(() => {
    reader.toggleAutoScroll(true);
    tick(1500);
    reader.toggleAutoScroll(false);
    tick(6000);
    expect(reader.currentSpreadIndex).toBe(0);
  }));

  it('cambiar de capítulo cancela el temporizador de la página anterior mientras se renderiza', fakeAsync(() => {
    reader.toggleAutoScroll(true);
    tick(1500);
    reader.currentPage = 2;
    reader.renderCurrentChapter();
    tick(0);
    expect(reader.isFullyRendered).toBeFalse();
    tick(6000);
    expect(reader.currentSpreadIndex).toBe(0);
    expect(internals.autoPageTimer).toBeNull();
    reader.toggleAutoScroll(false);
  }));

  for (const speed of [10, 40]) {
    it(`Desplazamiento respeta ${speed} px/s y al pausar deja de mover el texto`, fakeAsync(() => {
      settings.value = { ...settings.value, layoutMode: 'scroll', autoScrollSpeed: speed };
      applyLayout();
      spyOn(performance, 'now').and.returnValue(0);
      reader.toggleAutoScroll(true);
      tick(1000);
      expect(Math.abs(canvas.scrollTop - speed)).toBeLessThan(2);
      expect(reader.currentSpreadIndex).toBe(0);
      reader.toggleAutoScroll(false);
      const stoppedAt = canvas.scrollTop;
      tick(1000);
      expect(canvas.scrollTop).toBe(stoppedAt);
    }));
  }

  it('vuelve de Desplazamiento a dos páginas y al reducir a una conserva el pasaje', fakeAsync(() => {
    useFlowLayout();
    flowWidth = 1000;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    applyLayout();
    reader.onWindowResize();
    expect(reader.columnsPerSpread).toBe(2);
    internals.showSpreadOf(document.getElementById('word-190'), false);
    tick(0);
    settings.update({ layoutMode: 'scroll' });
    tick(100);
    canvas.dispatchEvent(new Event('scroll'));
    tick(16);
    const anchor = internals.spreadAnchorWord;
    expect(anchor).toBeGreaterThan(60);
    settings.update({ layoutMode: 'paged' });
    tick(100);
    expect(internals.isWordVisible(anchor)).toBeTrue();
    tick(0);
    // Un pliego más amplio puede empezar antes de la ancla y seguir conteniéndola.
    const spreadAnchor = internals.spreadAnchorWord;
    expect(internals.isWordVisible(spreadAnchor)).toBeTrue();
    flowWidth = 250;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    applyLayout();
    reader.onWindowResize();
    expect(reader.columnsPerSpread).toBe(1);
    expect(internals.isWordVisible(spreadAnchor)).toBeTrue();
  }));

  it('reducir el ancho conserva la palabra ancla en columnas CSS reales', fakeAsync(() => {
    useFlowLayout();
    internals.showSpreadOf(document.getElementById('word-130'), false);
    tick(0);
    const anchor = internals.spreadAnchorWord;
    expect(anchor).toBeGreaterThan(60);
    flowWidth = 250;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    applyLayout();
    reader.onWindowResize();
    expect(internals.isWordVisible(anchor)).toBeTrue();
    expect(reader.currentSpreadIndex).toBeGreaterThan(0);
  }));

  it('guarda la primera palabra del destino al comenzar la animación, con una y dos columnas', fakeAsync(() => {
    useFlowLayout();
    settings.value = { ...settings.value, pageTurn: 'slide' };
    for (const columns of [1, 2] as const) {
      flowWidth = columns === 1 ? 400 : 1000;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: columns === 1 ? 800 : 1440 });
      reader.currentSpreadIndex = 0;
      internals.pageOffsetX = 0;
      canvas.style.transform = 'translateX(0px)';
      applyLayout();
      reader.recalculateSpreads();
      expect(reader.columnsPerSpread).withContext(`${columns} columnas`).toBe(columns);
      const origin = canvas.getBoundingClientRect().left;
      const stride = viewport.clientWidth + parseFloat(getComputedStyle(canvas).columnGap);
      const destinationWord = Array.from(canvas.querySelectorAll<HTMLElement>('.word')).find(word => {
        const rect = word.getBoundingClientRect();
        const x = (rect.left + rect.right) / 2 - origin;
        return x >= stride && x < stride * 2;
      });
      expect(destinationWord).withContext(`${columns} columnas: existe un pliego siguiente`).toBeDefined();
      const saved: { wordId: string; exactPage: number }[] = [];
      const subscription = internals.saveProgressSubject.subscribe((snapshot: { wordId: string; exactPage: number }) => saved.push(snapshot));
      reader.turnSpreadNext();
      expect(saved.length).withContext(`${columns} columnas: se guarda el giro`).toBeGreaterThan(0);
      expect(saved[0].wordId).withContext(`${columns} columnas: guarda la palabra de destino`).toBe(destinationWord!.id);
      expect(saved[0].exactPage).toBeGreaterThan(0);
      subscription.unsubscribe();
      tick(300);
    }
  }));

  it('una palabra narrada fuera de la página lleva al pliego que la contiene', fakeAsync(() => {
    useFlowLayout();
    expect(internals.isWordVisible(130)).toBeFalse();
    internals.onNarrationWord(130);
    tick(0);
    expect(reader.currentWordIndex).toBe(130);
    expect(reader.currentSpreadIndex).toBeGreaterThan(0);
    expect(internals.isWordVisible(130)).toBeTrue();
    expect(canvas.style.transform).not.toBe('translateX(0px)');
    expect(canvas.scrollLeft).toBe(0);
  }));

  it('varios cambios rápidos de letra e interlineado conservan la palabra ancla', fakeAsync(() => {
    useFlowLayout();
    internals.showSpreadOf(document.getElementById('word-130'), false);
    tick(0);
    const anchor = internals.spreadAnchorWord;
    expect(anchor).toBeGreaterThan(60);
    settings.update({ fontSize: 23 });
    tick(20);
    settings.update({ fontSize: 26 });
    tick(20);
    settings.update({ lineHeight: 1.75 });
    tick(80);
    expect(internals.isWordVisible(anchor)).toBeTrue();
    expect(reader.currentSpreadIndex).toBeGreaterThan(0);
  }));

  it('al cambiar a Desplazamiento conserva la palabra ancla de la página anterior', fakeAsync(() => {
    startAtMiddlePage();
    settings.update({ layoutMode: 'scroll' });
    tick(100);
    const anchor = document.getElementById('word-6')!.getBoundingClientRect();
    expect(canvas.style.transform).toBe('');
    expect(canvas.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(anchor.top - viewport.getBoundingClientRect().top)).toBeLessThan(2);
  }));
});
