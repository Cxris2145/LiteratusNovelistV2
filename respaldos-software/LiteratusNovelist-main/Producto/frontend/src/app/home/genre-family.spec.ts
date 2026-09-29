import { bookFamily, genreFamily } from './genre-family';

describe('genreFamily', () => {
  it('agrupa los géneros conocidos', () => {
    expect(genreFamily('teatro').id).toBe('escena');
    expect(genreFamily('filosofia').id).toBe('pensamiento');
    expect(genreFamily('terror').id).toBe('misterio');
    expect(genreFamily('accion-y-aventura').id).toBe('aventura');
    expect(genreFamily('cuentos').id).toBe('narrativa');
  });

  it('usa narrativa cuando no hay género', () => {
    expect(genreFamily(null).id).toBe('narrativa');
    expect(bookFamily({ genres: [] }).id).toBe('narrativa');
  });

  it('asigna siempre la misma familia a un género nuevo', () => {
    expect(genreFamily('genero-nuevo').id).toBe(genreFamily('genero-nuevo').id);
  });

  it('toma el primer género del libro', () => {
    expect(bookFamily({ genres: [{ slug: 'poesia' }, { slug: 'terror' }] }).label).toBe('Teatro y poesía');
  });
});
