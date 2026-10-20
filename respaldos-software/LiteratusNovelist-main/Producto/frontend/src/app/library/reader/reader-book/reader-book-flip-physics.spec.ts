import { dragAngle, flipShading, isSettled, shouldCommitFlip, stepSpring } from './reader-book-flip-physics';

describe('física de la hoja que se dobla', () => {
  const run = (from: number, to: number, v = 0, seconds = 2) => {
    let state = { x: from, v };
    let maxX = from;
    for (let t = 0; t < seconds; t += 1 / 60) {
      state = stepSpring(state, to, 1 / 60);
      maxX = Math.max(maxX, state.x);
    }
    return { state, maxX };
  };

  it('el resorte llega al otro lado sin pasarse (sin rebote)', () => {
    const { state, maxX } = run(0, 180);
    expect(isSettled(state, 180)).toBeTrue();
    expect(maxX).toBeLessThanOrEqual(180.5);
  });

  it('tarda menos de un segundo en dar vuelta la hoja', () => {
    let state = { x: 0, v: 0 };
    let t = 0;
    while (!isSettled(state, 180) && t < 3) {
      state = stepSpring(state, 180, 1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeLessThan(1);
    expect(t).toBeGreaterThan(0.3);
  });

  it('parte con la velocidad que trae el dedo', () => {
    const still = stepSpring({ x: 60, v: 0 }, 180, 1 / 60);
    const thrown = stepSpring({ x: 60, v: 900 }, 180, 1 / 60);
    expect(thrown.x).toBeGreaterThan(still.x);
  });

  it('un cuadro muy largo no lo descontrola', () => {
    const state = stepSpring({ x: 0, v: 0 }, 180, 10);
    expect(Number.isFinite(state.x)).toBeTrue();
    expect(state.x).toBeLessThanOrEqual(180.5);
  });

  it('arrastrar el ancho del libro da vuelta la hoja entera', () => {
    expect(dragAngle(-1000, 1000, 1)).toBe(180);
    expect(dragAngle(-500, 1000, 1)).toBe(90);
    expect(dragAngle(250, 1000, -1)).toBe(45);
    // Arrastrar hacia el lado contrario no la mueve.
    expect(dragAngle(300, 1000, 1)).toBe(0);
    expect(dragAngle(-20, 0, 1)).toBe(0);
  });

  it('al soltar: una sacudida manda; si no, la mitad', () => {
    expect(shouldCommitFlip(30, 800)).toBeTrue();
    expect(shouldCommitFlip(150, -800)).toBeFalse();
    expect(shouldCommitFlip(100, 0)).toBeTrue();
    expect(shouldCommitFlip(80, 40)).toBeFalse();
  });

  it('la luz cambia de cara al cruzar los 90°', () => {
    expect(flipShading(0)).toEqual({ front: 0, back: 0, castUnder: 0, castOver: 0 });
    const half = flipShading(45);
    expect(half.front).toBeGreaterThan(0);
    expect(half.back).toBe(0);
    expect(half.castUnder).toBeGreaterThan(0);
    const late = flipShading(135);
    expect(late.front).toBe(0);
    expect(late.back).toBeGreaterThan(0);
    expect(late.castOver).toBeGreaterThan(0);
    expect(flipShading(180).back).toBe(0);
  });
});
