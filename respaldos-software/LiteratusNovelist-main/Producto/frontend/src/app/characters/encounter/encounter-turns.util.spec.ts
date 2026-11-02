import { mentions, openingIdeas, planAutoRun, planRound, shortName, Speaker } from './encounter-turns.util';

describe('encounter-turns · quién responde en un encuentro', () => {
  const holmes: Speaker = { id: 'h', name: 'Sherlock Holmes' };
  const quijote: Speaker = { id: 'q', name: 'Don Quijote de la Mancha' };
  const pair = [holmes, quijote] as const;

  it('reconoce al personaje por una palabra de su nombre, sin tildes ni mayúsculas', () => {
    expect(mentions('¿Qué opinas, HOLMES?', holmes.name)).toBeTrue();
    expect(mentions('quijote, cuéntame', quijote.name)).toBeTrue();
    // «don» o «de» no bastan para nombrarlo.
    expect(mentions('Don, ¿me escuchas?', quijote.name)).toBeFalse();
    expect(mentions('Hola a los dos', holmes.name)).toBeFalse();
  });

  it('a los dos: empieza el que no habló último y luego reacciona el otro', () => {
    expect(planRound(pair, 'both', null, 'Hola')).toEqual([
      { speakerId: 'h', message: 'Hola' }, { speakerId: 'q', message: '' }]);
    expect(planRound(pair, 'both', 'h', 'Hola')).toEqual([
      { speakerId: 'q', message: 'Hola' }, { speakerId: 'h', message: '' }]);
  });

  it('a los dos, nombrando a uno: empieza el nombrado', () => {
    const steps = planRound(pair, 'both', 'q', 'Quijote, ¿qué ves?');
    expect(steps.map(s => s.speakerId)).toEqual(['q', 'h']);
  });

  it('a uno solo: responde solo ese', () => {
    expect(planRound(pair, 'q', 'q', 'Sigue')).toEqual([{ speakerId: 'q', message: 'Sigue' }]);
  });

  it('siguen solos por turnos, sin texto del lector', () => {
    expect(planAutoRun(pair, 'h', 4)).toEqual([
      { speakerId: 'q', message: '' }, { speakerId: 'h', message: '' },
      { speakerId: 'q', message: '' }, { speakerId: 'h', message: '' }]);
  });

  it('nombre corto para los botones', () => {
    expect(shortName('Don Quijote de la Mancha')).toBe('Quijote');
    expect(shortName('Sherlock Holmes')).toBe('Sherlock');
    expect(shortName('El Gato con Botas')).toBe('Gato');
    expect(openingIdeas(true)).not.toEqual(openingIdeas(false));
  });
});
