import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MAGUITO_BASIC_COLORS } from '../maguito/maguito-colors';
import { MaguitoColorPickerComponent } from './maguito-color-picker.component';

describe('MaguitoColorPickerComponent', () => {
  const green = MAGUITO_BASIC_COLORS.find(option => option.id === 'green')!;
  let fixture: ComponentFixture<MaguitoColorPickerComponent>;
  let emitted: unknown[];

  const radios = () => Array.from<HTMLInputElement>(fixture.nativeElement.querySelectorAll('input[type=radio]'));
  const checkedName = () => radios().find(radio => radio.checked)?.closest('label')?.querySelector('.mcp-tile-name')?.textContent;
  const pick = (id: string) => {
    radios().find(radio => radio.value === id)!.click();
    fixture.detectChanges();
  };
  function show(value: unknown): void {
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MaguitoColorPickerComponent] }).compileComponents();
    fixture = TestBed.createComponent(MaguitoColorPickerComponent);
    emitted = [];
    fixture.componentInstance.valueChange.subscribe(value => emitted.push(value));
    fixture.detectChanges();
  });

  it('ofrece los 12 colores, con el clásico elegido al empezar', () => {
    expect(radios().length).toBe(12);
    expect(checkedName()).toBe('Clásico');
  });

  it('todos los radios forman un solo grupo, para moverse con las flechas', () => {
    expect(new Set(radios().map(radio => radio.name)).size).toBe(1);
  });

  it('elegir un color emite sus colores y lo muestra en el Maguito grande', () => {
    pick('green');
    expect(emitted).toEqual([green.colors]);
    expect(checkedName()).toBe('Verde');
    const big: HTMLElement = fixture.nativeElement.querySelector('.mcp-figure app-maguito');
    expect(big.style.getPropertyValue('--mg-body-c')).toBe(green.colors.bodyB!);
  });

  it('con clic o toque Maguito reacciona; con las flechas del teclado solo cambia el color', () => {
    const preview = (fixture.componentInstance as unknown as { preview: { play: (gesture: string) => void } }).preview;
    const play = spyOn(preview, 'play');

    pick('green');
    expect(play).not.toHaveBeenCalled();

    fixture.nativeElement.querySelector('.mcp-grid').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    pick('red');
    expect(play).toHaveBeenCalledOnceWith('poke');
  });

  it('no cancela las flechas del teclado, que son las que mueven la selección', () => {
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    radios()[0].dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBeFalse();
  });

  it('volver al clásico emite null: no se guardan colores', () => {
    pick('green');
    pick('classic');
    expect(emitted[1]).toBeNull();
  });

  it('muestra el color que ya tenía guardado', () => {
    show({ ...green.colors });
    expect(checkedName()).toBe('Verde');
    expect(radios().length).toBe(12);
  });

  it('una mezcla del Taller de Tintes aparece aparte y sigue disponible al probar otro color', () => {
    show({ ...green.colors, bodyB: '#123456' });
    expect(checkedName()).toBe('Tu mezcla');
    expect(radios().length).toBe(13);

    pick('green');
    expect(radios().length).toBe(13);
  });

  it('avisa que una capa comprada se queda', () => {
    expect(fixture.nativeElement.querySelector('.mcp-note')).toBeNull();
    fixture.componentRef.setInput('outfit', { cape: 'royal' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mcp-note')).not.toBeNull();
  });
});
