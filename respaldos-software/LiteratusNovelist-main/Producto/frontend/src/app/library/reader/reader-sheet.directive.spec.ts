import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { ReaderSheetDirective } from './reader-sheet.directive';

@Component({
  template: `
    <section class="sheet" rdSheet (rdSheetClose)="closed = closed + 1" [style.--sheet-mode]="mode"
             style="position: fixed; bottom: 0; left: 0; width: 300px; height: 400px;">
      <span class="grip" data-sheet-grip style="display: block; height: 20px;"></span>
      <header data-sheet-grip style="height: 44px;"><button type="button" class="close">✕</button></header>
      <div class="content" style="height: 300px;">contenido</div>
    </section>`,
})
class SheetHostComponent {
  closed = 0;
  mode = 'bottom';
}

describe('ReaderSheetDirective (hoja inferior que se baja para cerrar)', () => {
  let fixture: ComponentFixture<SheetHostComponent>;
  let host: SheetHostComponent;
  let sheet: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [SheetHostComponent, ReaderSheetDirective] });
    fixture = TestBed.createComponent(SheetHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    sheet = fixture.nativeElement.querySelector('.sheet');
  });

  /** Arrastra desde `from` bajando `dy` px en `ms` milisegundos (seis pasos). */
  const drag = (from: Element, dy: number, ms: number) => {
    const rect = from.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const fire = (type: string, yy: number) =>
      from.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 3, pointerType: 'touch', clientX: x, clientY: yy, button: 0 }));
    fire('pointerdown', y);
    for (let i = 1; i <= 6; i++) {
      tick(ms / 6);
      fire('pointermove', y + (dy * i) / 6);
    }
    fire('pointerup', y + dy);
  };

  it('bajarla más del 30 % la cierra al terminar de deslizarse', fakeAsync(() => {
    drag(sheet.querySelector('.grip')!, 200, 600);
    expect(host.closed).toBe(0); // primero termina de bajar
    tick(200);
    expect(host.closed).toBe(1);
    expect(sheet.style.translate).toBe('');
  }));

  it('un arrastre corto y lento la devuelve a su lugar', fakeAsync(() => {
    drag(sheet.querySelector('.grip')!, 40, 600);
    tick(250);
    expect(host.closed).toBe(0);
    expect(sheet.style.translate).toBe('');
  }));

  it('un gesto rápido la cierra aunque recorra poco', fakeAsync(() => {
    drag(sheet.querySelector('header')!, 60, 60);
    tick(250);
    expect(host.closed).toBe(1);
  }));

  it('el contenido y los botones de la cabecera no la arrastran', fakeAsync(() => {
    drag(sheet.querySelector('.content')!, 250, 300);
    drag(sheet.querySelector('.close')!, 250, 300);
    tick(250);
    expect(host.closed).toBe(0);
  }));

  it('en escritorio (sin --sheet-mode: bottom) no hace nada', fakeAsync(() => {
    host.mode = 'popover';
    fixture.detectChanges();
    drag(sheet.querySelector('.grip')!, 250, 300);
    tick(250);
    expect(host.closed).toBe(0);
    expect(sheet.style.translate).toBe('');
  }));
});
