import { chapterWords } from './chapter-parser.util';
import { buildChapterIndex, foldText, searchChapter, snippetAround } from './book-search.util';

describe('Búsqueda dentro del libro', () => {
  const html = `
    <h2>Capítulo XXV</h2>
    <p>—Dulcinea del Toboso, día de mi noche, dijo don Quijote.</p>
    <p>Sancho pensaba en su año de pastor, no en el ano de nadie. ¡DULCINEA!</p>
    <p>Las dulcineas del mundo y la señora Dulcinea, del Toboso.</p>`;
  const index = buildChapterIndex(html);
  const words = chapterWords(html);

  it('pliega mayúsculas y tildes sin cambiar el largo, pero conserva la ñ', () => {
    expect(foldText('Él SALIÓ, pingüino')).toBe('el salio  pinguino');
    expect(foldText('Año')).toBe('año');
    expect(index.folded.length).toBe(index.text.length);
  });

  it('encuentra la palabra aunque lleve raya, signos o mayúsculas', () => {
    const matches = searchChapter(index, 'dulcinea');
    const found = matches.map(m => words[m.firstWord]);
    expect(found).toEqual(['—Dulcinea', '¡DULCINEA!', 'dulcineas', 'Dulcinea,']);
  });

  it('cada resultado apunta a la misma palabra que muestra el lector (word-N)', () => {
    for (const match of searchChapter(index, 'Quijote')) {
      expect(words[match.firstWord]).toBe('Quijote.');
      expect(index.text.slice(match.start, match.end)).toBe('Quijote');
    }
  });

  it('distingue la ñ de la n', () => {
    expect(searchChapter(index, 'año').map(m => words[m.firstWord])).toEqual(['año']);
    expect(searchChapter(index, 'ano').map(m => words[m.firstWord])).toEqual(['ano']);
  });

  it('busca frases aunque haya puntuación entre las palabras', () => {
    const matches = searchChapter(index, 'Dulcinea del Toboso');
    expect(matches.length).toBe(2);
    const last = matches[1];
    expect(words.slice(last.firstWord, last.lastWord + 1)).toEqual(['Dulcinea,', 'del', 'Toboso.']);
  });

  it('con "palabra completa" no cuenta las palabras más largas', () => {
    expect(searchChapter(index, 'dulcinea').length).toBe(4);
    expect(searchChapter(index, 'dulcinea', { wholeWord: true }).length).toBe(3);
    expect(searchChapter(index, 'ulcinea').length).toBe(0);
  });

  it('arma el fragmento con el texto original alrededor', () => {
    const [first] = searchChapter(index, 'toboso');
    const snippet = snippetAround(index, first, 2);
    expect(snippet.match).toBe('Toboso');
    expect(snippet.before).toBe('—Dulcinea del ');
    expect(snippet.after).toBe(', día de');
  });

  it('una consulta sin letras no busca nada', () => {
    expect(searchChapter(index, ' ¡¿?! ')).toEqual([]);
  });
});
