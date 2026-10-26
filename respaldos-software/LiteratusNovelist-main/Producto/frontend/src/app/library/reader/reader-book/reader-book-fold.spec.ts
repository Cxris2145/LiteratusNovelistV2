import { Point, foldAt, foldShadow } from './reader-book-fold';

describe('geometría de la hoja que se pliega', () => {
  const w = 400;
  const h = 560;
  const area = (poly: Point[]) => Math.abs(poly.reduce((sum, a, i) => {
    const b = poly[(i + 1) % poly.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0)) / 2;
  const apply = (m: number[], q: Point, left: number) => ({ x: m[0] * q.x + m[2] * q.y + m[4] + left, y: m[1] * q.x + m[3] * q.y + m[5] });

  it('quieta, la hoja es entera y no hay solapa', () => {
    const fold = foldAt(0, 1, 'bottom', w, h);
    expect(area(fold.front)).toBeCloseTo(w * h, 3);
    expect(fold.flap.length).toBe(0);
    expect(fold.reach).toBe(0);
  });

  it('al final, la solapa cubre justo la otra página y el reverso queda derecho', () => {
    const fold = foldAt(1, 1, 'bottom', w, h);
    expect(area(fold.front)).toBeCloseTo(0, 3);
    expect(area(fold.flap)).toBeCloseTo(w * h, 3);
    for (const q of fold.flap) expect(q.x).toBeLessThanOrEqual(w + 1e-6);
    const [a, b, c, d, e, f] = fold.backMatrix;
    expect(a).toBeCloseTo(1, 6);
    expect(b).toBeCloseTo(0, 6);
    expect(c).toBeCloseTo(0, 6);
    expect(d).toBeCloseTo(1, 6);
    expect(e).toBeCloseTo(0, 6);
    expect(f).toBeCloseTo(0, 6);
  });

  it('el papel no se estira: anverso y solapa suman una página', () => {
    for (const p of [0.05, 0.2, 0.5, 0.8, 0.97]) {
      const fold = foldAt(p, 1, 'bottom', w, h);
      expect(area(fold.front) + area(fold.flap)).toBeCloseTo(w * h, 2);
    }
  });

  it('el lomo nunca se dobla', () => {
    for (const p of [0.02, 0.15, 0.4, 0.6, 0.85, 0.99]) {
      for (const corner of ['bottom', 'top'] as const) {
        const fold = foldAt(p, 1, corner, w, h);
        const side = (q: Point) => (q.x - fold.crease.x) * fold.normal.x + (q.y - fold.crease.y) * fold.normal.y;
        expect(side({ x: w, y: 0 })).toBeLessThanOrEqual(1e-6);
        expect(side({ x: w, y: h })).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it('el reverso llega a la solapa con una rotación (el texto no queda espejado)', () => {
    for (const p of [0.1, 0.5, 0.9]) {
      const fold = foldAt(p, 1, 'bottom', w, h);
      const [a, b, c, d] = fold.backMatrix;
      expect(a * d - b * c).toBeCloseTo(1, 6);
      fold.backClip.forEach((q, i) => {
        const moved = apply(fold.backMatrix, q, fold.backLeft);
        expect(moved.x).toBeCloseTo(fold.flap[i].x, 6);
        expect(moved.y).toBeCloseTo(fold.flap[i].y, 6);
      });
    }
  });

  it('hacia atrás es el espejo de hacia adelante', () => {
    const forward = foldAt(0.35, 1, 'bottom', w, h);
    const backward = foldAt(0.35, -1, 'bottom', w, h);
    expect(backward.leafLeft).toBe(0);
    expect(backward.backLeft).toBe(w);
    expect(area(backward.front)).toBeCloseTo(area(forward.front), 4);
    expect(backward.crease.x).toBeCloseTo(2 * w - forward.crease.x, 6);
    expect(backward.crease.y).toBeCloseTo(forward.crease.y, 6);
    const end = foldAt(1, -1, 'bottom', w, h);
    [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(end.backMatrix[i]).toBeCloseTo(v, 6));
  });

  it('tomada de arriba es el espejo vertical de tomada de abajo', () => {
    const low = foldAt(0.3, 1, 'bottom', w, h);
    const high = foldAt(0.3, 1, 'top', w, h);
    expect(area(high.front)).toBeCloseTo(area(low.front), 4);
    expect(high.crease.y).toBeCloseTo(h - low.crease.y, 6);
  });

  it('las sombras nacen al levantarse y se apagan al apoyarse', () => {
    expect(foldShadow(0)).toBe(0);
    expect(foldShadow(0.07)).toBeGreaterThan(0.25);
    expect(foldShadow(0.5)).toBe(1);
    expect(foldShadow(1)).toBeLessThan(1e-9);
  });
});
