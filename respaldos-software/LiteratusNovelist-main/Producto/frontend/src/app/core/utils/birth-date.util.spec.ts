import { FormControl, Validators } from '@angular/forms';
import { birthDateValidator } from './birth-date.util';

describe('Fecha de nacimiento en el registro', () => {
  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 9, 8, 12));
  });

  afterEach(() => jasmine.clock().uninstall());

  const field = (value: string) => new FormControl(value, [Validators.required, birthDateValidator]);

  it('permite registrar menores y adultos', () => {
    expect(field('2012-04-23').valid).toBeTrue();
    expect(field('2001-04-23').valid).toBeTrue();
    expect(field('2008-02-29').valid).toBeTrue();
  });

  it('rechaza fechas vacías, futuras e imposibles antes de enviar', () => {
    expect(field('').hasError('required')).toBeTrue();
    expect(field('2026-10-09').hasError('birthDateFuture')).toBeTrue();
    expect(field('2009-02-29').hasError('birthDateInvalid')).toBeTrue();
    expect(field('2008-04-31').hasError('birthDateInvalid')).toBeTrue();
    expect(field('1800-01-01').hasError('birthDateInvalid')).toBeTrue();
  });
});
