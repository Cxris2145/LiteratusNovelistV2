import { ClpPipe } from './clp.pipe';
import { formatChileanNumber, formatClp } from '../utils/currency.util';

describe('Formato de precio y moneda chilena (CLP)', () => {
  let pipe: ClpPipe;

  beforeEach(() => {
    pipe = new ClpPipe();
  });

  describe('formatClp y ClpPipe', () => {
    it('formatea montos enteros con separador de miles punto y código CLP', () => {
      expect(pipe.transform(990)).toBe('$990 CLP');
      expect(pipe.transform(1990)).toBe('$1.990 CLP');
      expect(pipe.transform(3990)).toBe('$3.990 CLP');
      expect(pipe.transform(15000)).toBe('$15.000 CLP');
      expect(pipe.transform(1500000)).toBe('$1.500.000 CLP');
    });

    it('permite ocultar el código CLP si se especifica false', () => {
      expect(pipe.transform(1990, false)).toBe('$1.990');
      expect(pipe.transform(15000, { showCode: false })).toBe('$15.000');
    });

    it('permite ocultar el símbolo de peso si se especifica en opciones', () => {
      expect(pipe.transform(1990, { showSymbol: false })).toBe('1.990 CLP');
      expect(pipe.transform(1990, { showSymbol: false, showCode: false })).toBe('1.990');
    });

    it('formatea valores decimales si se configuran decimales (ej. precios unitarios)', () => {
      const res = pipe.transform(3.98, 2);
      expect(res).toContain('3,98');
      expect(res).toContain('CLP');
    });

    it('maneja valores 0, cadenas numéricas, nulos y no definidos de forma segura', () => {
      expect(pipe.transform(0)).toBe('$0 CLP');
      expect(pipe.transform('1990')).toBe('$1.990 CLP');
      expect(pipe.transform(null)).toBe('$0 CLP');
      expect(pipe.transform(undefined)).toBe('$0 CLP');
      expect(pipe.transform('')).toBe('$0 CLP');
    });

    it('maneja montos negativos respetando el signo', () => {
      expect(pipe.transform(-1990)).toBe('-$1.990 CLP');
    });
  });

  describe('formatChileanNumber', () => {
    it('formatea números con separador de miles chileno', () => {
      expect(formatChileanNumber(1990)).toBe('1.990');
      expect(formatChileanNumber(1500000)).toBe('1.500.000');
      expect(formatChileanNumber(0)).toBe('0');
    });
  });
});

