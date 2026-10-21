import {
  IDENTITY, apply, compose, constrainCorner, dragCorner, dragGain, foldFor, invert, reflection, restCorner, rotation,
  toCss, translate, turnedCorner,
} from './reader-book-fold';

describe('pliegue de la hoja', () => {
  const leaf = { w: 500, h: 700 };
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    expect(a.x).toBeCloseTo(b.x, 4);
    expect(a.y).toBeCloseTo(b.y, 4);
  };

  it('con la esquina en reposo no hay pliegue', () => {
    const fold = foldFor(restCorner(leaf, 'bottom'), leaf, 'bottom');
    expect(fold.progress).toBe(0);
    expect(fold.depth).toBe(0);
    expect(fold.normal).toEqual({ x: 1, y: 0 });
  });

  it('dada vuelta del todo, el pliegue es el lomo', () => {
    const fold = foldFor(turnedCorner(leaf, 'bottom'), leaf, 'bottom');
    expect(fold.progress).toBe(1);
    near(fold.mid, { x: 0, y: 700 });
    near(fold.normal, { x: 1, y: 0 });
  });

  it('el pliegue refleja la esquina en reposo sobre la esquina movida', () => {
    const fold = foldFor({ x: 120, y: 610 }, leaf, 'bottom');
    near(apply(reflection(fold.mid, fold.normal), restCorner(leaf, 'bottom')), fold.corner);
    // La normal apunta hacia afuera (el lado que todavía no se dio vuelta).
    expect(fold.normal.x).toBeGreaterThan(0);
    expect(fold.progress).toBeCloseTo((500 - 120) / 1000, 6);
  });

  it('la hoja no se despega del lomo ni se hunde bajo el libro', () => {
    const lejos = constrainCorner({ x: -900, y: 200 }, leaf, 'bottom');
    expect(Math.hypot(lejos.x, lejos.y - 700)).toBeLessThanOrEqual(500.001);
    const abajo = constrainCorner({ x: 400, y: 900 }, leaf, 'bottom');
    expect(abajo.y).toBeLessThanOrEqual(700);
    const arriba = constrainCorner({ x: 400, y: -80 }, leaf, 'top');
    expect(arriba.y).toBeGreaterThanOrEqual(0);
    const diagonal = constrainCorner({ x: -480, y: -500 }, leaf, 'bottom');
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeLessThanOrEqual(Math.hypot(500, 700) + 0.001);
  });

  it('al arrastrar: desde la esquina la sigue el dedo; lejos del borde, el pliegue', () => {
    expect(dragGain(500, leaf)).toBe(1);
    expect(dragGain(250, leaf)).toBe(2);
    expect(dragGain(400, leaf)).toBeCloseTo(1.4, 6);
    const start = restCorner(leaf, 'bottom');
    near(dragCorner(start, { x: -100, y: 0 }, 1, leaf, 'bottom'), { x: 400, y: 700 });
    near(dragCorner(start, { x: -100, y: 0 }, 2, leaf, 'bottom'), { x: 300, y: 700 });
  });

  it('las transformaciones se componen y se invierten', () => {
    const m = compose(translate(30, -12), rotation(Math.cos(0.7), Math.sin(0.7)), reflection({ x: 4, y: 9 }, { x: 0.6, y: 0.8 }));
    const p = { x: 123, y: -45 };
    near(apply(compose(invert(m), m), p), p);
    near(apply(compose(m, invert(m)), p), p);
    expect(compose()).toEqual(IDENTITY);
    expect(toCss(translate(10.123, 0))).toBe('matrix(1,0,0,1,10.12,0)');
  });
});
