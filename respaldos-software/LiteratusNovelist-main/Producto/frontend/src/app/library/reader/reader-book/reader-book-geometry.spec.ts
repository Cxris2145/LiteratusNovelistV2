import { PAGE_RATIO_MAX, PAGE_RATIO_MIN, bookCssVars, bookEdges, bookFrame, bookMargins, isCompactBook } from './reader-book-geometry';

describe('geometría de la vista Libro', () => {
  it('en escritorio abre dos páginas con proporción de libro, centradas y con aire para las barras', () => {
    const frame = bookFrame({ width: 1366, height: 820, columns: 2 });
    expect(frame.compact).toBeFalse();
    const ratio = frame.pageWidth / frame.pageHeight;
    expect(ratio).toBeGreaterThanOrEqual(PAGE_RATIO_MIN - 0.01);
    expect(ratio).toBeLessThanOrEqual(PAGE_RATIO_MAX + 0.01);
    // El libro (con tapa y cantos) cabe en la ventana y deja aire arriba y abajo.
    expect(frame.top).toBeGreaterThanOrEqual(frame.board + 20);
    expect(frame.top + frame.pageHeight + frame.board).toBeLessThanOrEqual(820 - 20);
    const outerLeft = frame.left - frame.board - frame.edgeMax;
    const outerRight = frame.left + 2 * frame.pageWidth + frame.board + frame.edgeMax;
    expect(outerLeft).toBeGreaterThan(40); // espacio para la flecha
    expect(1366 - outerRight).toBeGreaterThan(40);
    expect(Math.abs(outerLeft - (1366 - outerRight))).toBeLessThanOrEqual(1);
  });

  it('en pantallas muy anchas la página no pasa de un ancho cómodo de lectura', () => {
    const frame = bookFrame({ width: 3440, height: 1440, columns: 2 });
    expect(frame.pageWidth).toBeLessThanOrEqual(820);
  });

  it('en el celular es un libro delgado a pantalla completa', () => {
    expect(isCompactBook(375, 812)).toBeTrue();
    expect(isCompactBook(844, 390)).toBeTrue();
    expect(isCompactBook(1024, 768)).toBeFalse();
    const frame = bookFrame({ width: 375, height: 812, columns: 1 });
    expect(frame.compact).toBeTrue();
    expect(frame.left).toBe(frame.spine);
    expect(frame.left + frame.pageWidth + frame.edgeMax + frame.board).toBeLessThanOrEqual(375);
    expect(frame.pageHeight + 2 * frame.board).toBeLessThanOrEqual(812);
    expect(frame.pageWidth).toBeGreaterThan(350);
  });

  it('con una sola página en pantalla grande deja el lomo a la izquierda', () => {
    const frame = bookFrame({ width: 900, height: 1200, columns: 1 });
    expect(frame.compact).toBeFalse();
    expect(frame.spine).toBeGreaterThan(0);
    expect(frame.left - frame.spine - frame.board).toBeGreaterThan(20);
  });

  it('los márgenes siguen el ajuste y son proporcionales a la página', () => {
    const frame = bookFrame({ width: 1366, height: 820, columns: 2 });
    const narrow = bookMargins(frame, 'narrow');
    const normal = bookMargins(frame, 'normal');
    const wide = bookMargins(frame, 'wide');
    expect(narrow.side).toBeLessThan(normal.side);
    expect(normal.side).toBeLessThan(wide.side);
    expect(normal.top).toBeGreaterThan(normal.bottom - 1);
  });

  it('los cantos crecen con lo leído a la izquierda y con lo que falta a la derecha', () => {
    const frame = bookFrame({ width: 1366, height: 820, columns: 2 });
    expect(bookEdges(0, frame)).toEqual({ left: 0, right: frame.edgeMax });
    expect(bookEdges(1, frame)).toEqual({ left: frame.edgeMax, right: 0 });
    const middle = bookEdges(0.5, frame);
    expect(middle.left).toBe(middle.right);
    // Una hoja leída ya deja un filo visible.
    expect(bookEdges(0.01, frame).left).toBe(2);
    // Con una sola página a la izquierda está el lomo, sin canto.
    expect(bookEdges(0.5, bookFrame({ width: 375, height: 812, columns: 1 })).left).toBe(0);
  });

  it('entrega las variables CSS del libro', () => {
    const frame = bookFrame({ width: 1366, height: 820, columns: 2 });
    const vars = bookCssVars(frame, 'normal', 0.25);
    expect(vars['--book-w']).toBe(`${frame.pageWidth * 2}px`);
    expect(vars['--book-h']).toBe(`${frame.pageHeight}px`);
    expect(vars['--reader-page-margin']).toBe(`${bookMargins(frame, 'normal').side}px`);
  });

  it('no se rompe con medidas inválidas', () => {
    const frame = bookFrame({ width: NaN, height: NaN, columns: 2 });
    expect(frame.pageWidth).toBeGreaterThan(0);
    expect(frame.pageHeight).toBeGreaterThan(0);
  });
});
