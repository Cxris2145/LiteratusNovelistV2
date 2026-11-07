import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';

import { MaguitoThemeService } from '../../services/maguito-theme.service';
import { MAGUITO_BASIC_COLORS } from './maguito-colors';
import { MaguitoComponent } from './maguito.component';
import { resolveOutfit } from './maguito-outfit';

describe('MaguitoComponent (vestuario)', () => {
  let fixture: ComponentFixture<MaguitoComponent>;
  let host: HTMLElement;

  function dress(outfit: Record<string, string> | null): void {
    fixture.componentRef.setInput('outfit', outfit);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [MaguitoComponent], imports: [CommonModule] }).compileComponents();
    fixture = TestBed.createComponent(MaguitoComponent);
    host = fixture.nativeElement;
  });

  it('sin outfit lleva el sombrero de mago, los lentes redondos y la capa dorada', () => {
    dress(null);
    expect(host.querySelector('.mg-cone')).not.toBeNull();
    expect(host.querySelector('.mg-glasses')).not.toBeNull();
    expect(host.getAttribute('data-cape')).toBe('gold');
  });

  it('con corona y sin lentes no dibuja el sombrero de mago ni las gafas', () => {
    dress({ head: 'crown', eyes: 'none', cape: 'royal' });
    expect(host.querySelector('.mg-cone')).toBeNull();
    expect(host.querySelector('.mg-glasses')).toBeNull();
    expect(host.querySelector('.mg-hat')?.children.length).toBeGreaterThan(0);
    expect(host.getAttribute('data-cape')).toBe('royal');
  });

  it('la cara y las pupilas siguen existiendo para la mirada', () => {
    dress({ face: 'beard', eyes: 'monocle' });
    expect(host.querySelectorAll('.mg-face').length).toBe(1);
    expect(host.querySelectorAll('.mg-pupil').length).toBe(2);
    expect(host.querySelector('.mg-facial')).not.toBeNull();
  });

  it('una variante desconocida vuelve al atuendo de siempre', () => {
    expect(resolveOutfit({ head: 'casco-espacial' }).head).toBe('wizard');
  });

  it('los premios de La Senda conservan las capas animadas y el rostro original al combinarse', () => {
    for (const look of [
      { head: 'archivist', neck: 'firefly-brooch', cape: 'moonlit', face: 'beard' },
      { head: 'ink-crown', neck: 'story-key', cape: 'aurora', face: 'beard' },
    ]) {
      dress(look);
      expect(fixture.componentInstance.look).toEqual(jasmine.objectContaining(look));
      expect(host.querySelectorAll('.mg-face').length).toBe(1);
      expect(host.querySelectorAll('.mg-pupil').length).toBe(2);
      expect(host.querySelectorAll('.mg-neck').length).toBe(1);
      expect(host.querySelectorAll('.mg-hat').length).toBe(1);
      expect(host.querySelector('.mg-path-embroidery')).not.toBeNull();
      expect(host.querySelector('.mg-facial')).not.toBeNull();
    }
  });

  it('las prendas de La Senda caben completas en sus miniaturas del Bazar', () => {
    fixture.componentRef.setInput('crop', 'detail');
    fixture.componentRef.setInput('paused', true);
    for (const piece of [
      { slot: 'head', variant: 'archivist', layer: '.mg-hat' },
      { slot: 'head', variant: 'ink-crown', layer: '.mg-hat' },
      { slot: 'neck', variant: 'firefly-brooch', layer: '.mg-neck' },
      { slot: 'neck', variant: 'story-key', layer: '.mg-neck' },
      { slot: 'cape', variant: 'moonlit', layer: '.mg-cape' },
      { slot: 'cape', variant: 'aurora', layer: '.mg-cape' },
    ]) {
      fixture.componentRef.setInput('detailSlot', piece.slot);
      dress({ [piece.slot]: piece.variant });
      const [x, y, width, height] = fixture.componentInstance.viewBox.split(' ').map(Number);
      const art = host.querySelector<SVGGElement>(piece.layer)!.getBBox();
      expect(art.width).toBeGreaterThan(0);
      expect(art.x).toBeGreaterThan(x);
      expect(art.y).toBeGreaterThan(y);
      expect(art.x + art.width).toBeLessThan(x + width);
      expect(art.y + art.height).toBeLessThan(y + height);
    }
  });
});

describe('MaguitoComponent (color)', () => {
  const green = MAGUITO_BASIC_COLORS.find(option => option.id === 'green')!.colors;
  const black = MAGUITO_BASIC_COLORS.find(option => option.id === 'black')!.colors;
  let fixture: ComponentFixture<MaguitoComponent>;
  let host: HTMLElement;

  const variable = (name: string) => host.style.getPropertyValue(name);
  function set(inputs: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    // Sin HttpClient a propósito: pintar un Maguito no debe depender de él.
    await TestBed.configureTestingModule({ declarations: [MaguitoComponent], imports: [CommonModule] }).compileComponents();
    fixture = TestBed.createComponent(MaguitoComponent);
    host = fixture.nativeElement;
  });

  afterEach(() => TestBed.inject(MaguitoThemeService).hydrate(null));

  it('sin color deja el dibujo original', () => {
    set({ outfit: { head: 'crown' } });
    expect(variable('--mg-body-c')).toBe('');
  });

  it('pinta el color que trae el atuendo, también en el de un amigo', () => {
    set({ outfit: { head: 'crown', colors: green } });
    expect(variable('--mg-body-c')).toBe(green.bodyB!);
    expect(variable('--mg-hat-a')).toBe(green.hatA!);
    expect(variable('--mg-cape-a')).toBe(green.capeA!);
  });

  it('el negro aclara las líneas de la cara para que se vean', () => {
    set({ outfit: { colors: black } });
    expect(variable('--mg-ink')).toBe(black.ink!);
  });

  it('al quitar el color vuelve al dibujo original', () => {
    set({ outfit: { colors: green } });
    set({ outfit: { head: 'crown' } });
    expect(variable('--mg-body-c')).toBe('');
    expect(variable('--mg-cape-a')).toBe('');
  });

  it('una capa comprada conserva su tela y el cuerpo sigue el color', () => {
    set({ outfit: { cape: 'royal', colors: green } });
    expect(variable('--mg-cape-a')).toBe('');
    expect(variable('--mg-body-c')).toBe(green.bodyB!);
    expect(host.getAttribute('data-cape')).toBe('royal');
  });

  it('al quitarse la capa comprada, la túnica toma el color', () => {
    set({ outfit: { cape: 'royal', colors: green } });
    set({ outfit: { colors: green } });
    expect(variable('--mg-cape-a')).toBe(green.capeA!);
  });

  it('[colors] manda sobre el color del atuendo (selectores)', () => {
    set({ outfit: { colors: green }, colors: black });
    expect(variable('--mg-body-c')).toBe(black.bodyB!);
  });

  it('[mine] usa el color de la cuenta y lo sigue cuando cambia', () => {
    const theme = TestBed.inject(MaguitoThemeService);
    theme.hydrate({ colors: green });
    set({ mine: true });
    expect(variable('--mg-body-c')).toBe(green.bodyB!);

    theme.hydrate({ colors: black });
    expect(variable('--mg-body-c')).toBe(black.bodyB!);

    theme.hydrate({});
    expect(variable('--mg-body-c')).toBe('');
  });

  it('sin [mine] ignora el color de la cuenta', () => {
    TestBed.inject(MaguitoThemeService).hydrate({ colors: green });
    set({ outfit: { head: 'crown' } });
    expect(variable('--mg-body-c')).toBe('');
  });
});
