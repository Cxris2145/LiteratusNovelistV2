import { highlightMatch } from './highlight-match.util';

const marked = (text: string, query: string) =>
  highlightMatch(text, query).map(p => (p.hit ? `[${p.text}]` : p.text)).join('');

describe('highlightMatch', () => {
  it('marca el inicio del título desde la primera letra', () => {
    expect(marked('Casa tomada', 'c')).toBe('[C]asa tomada');
  });

  it('prefiere el inicio de una palabra a una letra suelta', () => {
    expect(marked('El Aleph de la casa', 'ca')).toBe('El Aleph de la [ca]sa');
  });

  it('ignora tildes y mayúsculas pero conserva el texto original', () => {
    expect(marked('Una casa en el árbol', 'ARBOL')).toBe('Una casa en el [árbol]');
    expect(marked('Gabriel García Márquez', 'garcia mar')).toBe('Gabriel [García Már]quez');
  });

  it('no confunde la ñ con la n', () => {
    expect(marked('Cien años de soledad', 'anos')).toBe('Cien años de soledad');
    expect(marked('Cien años de soledad', 'año')).toBe('Cien [año]s de soledad');
  });

  it('salta signos y espacios repetidos como lo hace el servidor', () => {
    expect(marked('Fausto: tragedia', 'fausto tra')).toBe('[Fausto: tra]gedia');
  });

  it('busca dentro de la palabra solo desde tres letras', () => {
    expect(marked('Ficciones', 'ci')).toBe('Ficciones');
    expect(marked('Ficciones', 'cci')).toBe('Fi[cci]ones');
  });

  it('devuelve el texto tal cual sin consulta', () => {
    expect(highlightMatch('Ficciones', '  ')).toEqual([{ text: 'Ficciones', hit: false }]);
    expect(highlightMatch('', 'a')).toEqual([]);
  });
});
