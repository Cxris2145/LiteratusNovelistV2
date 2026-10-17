import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';

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
