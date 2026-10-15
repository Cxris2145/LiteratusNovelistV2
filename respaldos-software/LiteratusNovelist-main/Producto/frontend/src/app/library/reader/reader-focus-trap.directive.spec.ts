import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { ReaderFocusTrapDirective } from './reader-focus-trap.directive';

@Component({
  template: `
    <button type="button" class="opener">Abrir</button>
    <aside [rdFocusTrap]="open">
      <button type="button" class="first">Uno</button>
      <button type="button" class="middle">Dos</button>
      <button type="button" class="last">Tres</button>
    </aside>`,
})
class TrapHostComponent {
  open = false;
}

describe('ReaderFocusTrapDirective (foco atrapado en los diálogos)', () => {
  let fixture: ComponentFixture<TrapHostComponent>;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [TrapHostComponent, ReaderFocusTrapDirective] });
    fixture = TestBed.createComponent(TrapHostComponent);
    el = fixture.nativeElement;
    document.body.appendChild(el); // el foco solo funciona con el elemento en el documento
    fixture.detectChanges();
  });

  afterEach(() => el.remove());

  const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
  const tab = (shift = false) => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('al abrirse enfoca su primer control y al cerrarse devuelve el foco', fakeAsync(() => {
    q('.opener').focus();
    fixture.componentInstance.open = true;
    fixture.detectChanges();
    tick();
    expect(document.activeElement).toBe(q('.first'));
    fixture.componentInstance.open = false;
    fixture.detectChanges();
    expect(document.activeElement).toBe(q('.opener'));
  }));

  it('Tab desde el último vuelve al primero y Mayús+Tab desde el primero va al último', fakeAsync(() => {
    fixture.componentInstance.open = true;
    fixture.detectChanges();
    tick();
    q('.last').focus();
    expect(tab()).toBeTrue();
    expect(document.activeElement).toBe(q('.first'));
    expect(tab(true)).toBeTrue();
    expect(document.activeElement).toBe(q('.last'));
    q('.middle').focus();
    expect(tab()).toBeFalse(); // en medio, el navegador avanza solo
  }));

  it('cerrado no atrapa nada', fakeAsync(() => {
    q('.last').focus();
    expect(tab()).toBeFalse();
  }));

  it('no le quita el foco a quien ya lo puso adentro', fakeAsync(() => {
    fixture.componentInstance.open = true;
    fixture.detectChanges();
    q('.middle').focus(); // como la hoja "Aa", que enfoca su pestaña
    tick();
    expect(document.activeElement).toBe(q('.middle'));
  }));
});
