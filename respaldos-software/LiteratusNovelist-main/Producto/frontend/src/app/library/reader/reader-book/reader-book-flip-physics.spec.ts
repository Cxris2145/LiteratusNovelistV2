import {
  RELEASE_RESPONSE, TURN_RESPONSE, capVelocity, foldShading, isSettled, launchVelocity, projectMomentum, shouldCommitTurn, stepSpring, turnLift,
} from './reader-book-flip-physics';

describe('física de la hoja que se dobla', () => {
  /** Corre el resorte de `from` a `to` y devuelve en cuánto llegó y hasta dónde fue. */
  const run = (from: number, to: number, v = 0, response = TURN_RESPONSE, seconds = 3) => {
    let state = { x: from, v };
    let min = from;
    let max = from;
    let t = 0;
    while (!isSettled(state, to) && t < seconds) {
      state = stepSpring(state, to, 1 / 60, response);
      min = Math.min(min, state.x);
      max = Math.max(max, state.x);
      t += 1 / 60;
    }
    return { state, min, max, t };
  };

  it('el resorte llega al otro lado sin pasarse (sin rebote)', () => {
    const { state, min } = run(600, -600);
    expect(isSettled(state, -600)).toBeTrue();
    expect(min).toBeGreaterThanOrEqual(-600.5);
  });

  it('un giro por clic se mueve desde el primer cuadro, no se pasa y dura menos de un segundo', () => {
    const v = launchVelocity(600, -600);
    expect(v).toBeLessThan(0);
    const first = stepSpring({ x: 600, v }, -600, 1 / 60);
    const still = stepSpring({ x: 600, v: 0 }, -600, 1 / 60);
    expect(600 - first.x).toBeGreaterThan(600 - still.x);
    const { min, t } = run(600, -600, v);
    expect(min).toBeGreaterThanOrEqual(-600.5);
    expect(t).toBeLessThan(1);
    expect(t).toBeGreaterThan(0.25);
  });

  it('parte con la velocidad que trae el dedo', () => {
    const still = stepSpring({ x: 100, v: 0 }, -600, 1 / 60);
    const thrown = stepSpring({ x: 100, v: -900 }, -600, 1 / 60);
    expect(thrown.x).toBeLessThan(still.x);
  });

  it('un cuadro muy largo no lo descontrola', () => {
    const state = stepSpring({ x: 600, v: 0 }, -600, 10, TURN_RESPONSE);
    expect(Number.isFinite(state.x)).toBeTrue();
    expect(state.x).toBeGreaterThanOrEqual(-600.5);
  });

  it('una sacudida muy fuerte se limita para no chocar con el lomo', () => {
    const capped = capVelocity(-50000, 100, -600);
    expect(capped).toBeLessThan(0);
    expect(capped).toBeGreaterThan(-50000);
    const { min } = run(100, -600, capped, RELEASE_RESPONSE);
    expect(min).toBeGreaterThanOrEqual(-600.5);
    // La velocidad en contra del destino no se toca (la hoja se frena y vuelve).
    expect(capVelocity(400, 100, -600)).toBe(400);
  });

  it('al soltar: una sacudida manda; si no, dónde quedaría con el impulso', () => {
    expect(shouldCommitTurn(0.1, 800, 1200)).toBeTrue();
    expect(shouldCommitTurn(0.8, -800, 1200)).toBeFalse();
    expect(shouldCommitTurn(0.6, 0, 1200)).toBeTrue();
    expect(shouldCommitTurn(0.4, 0, 1200)).toBeFalse();
    // Un empujón suave cerca de la mitad la lleva al otro lado.
    expect(shouldCommitTurn(0.48, 300, 1200)).toBeTrue();
    expect(projectMomentum(1000)).toBeCloseTo(99, 0);
  });

  it('la esquina se levanta a mitad del giro y baja al llegar', () => {
    expect(turnLift(0, 800)).toBe(0);
    expect(turnLift(1, 800)).toBeCloseTo(0, 6);
    expect(turnLift(0.5, 800)).toBeGreaterThan(40);
    expect(turnLift(0.5, 800)).toBeGreaterThan(turnLift(0.2, 800));
  });

  it('sin sombras con la hoja plana; más fuertes en medio del giro', () => {
    expect(foldShading(0)).toEqual({ cast: 0, curl: 0, dim: 0, drop: 0 });
    const end = foldShading(1);
    expect(end.cast).toBeCloseTo(0, 6);
    expect(end.drop).toBeCloseTo(0, 6);
    const half = foldShading(0.5);
    expect(half.cast).toBe(1);
    expect(half.dim).toBeGreaterThan(foldShading(0.1).dim);
  });
});
