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
});
