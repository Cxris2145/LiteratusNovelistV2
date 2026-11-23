import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { TavernMobilePanelDirective } from './tavern-mobile-panel.directive';

@Component({
  standalone: true,
  imports: [TavernMobilePanelDirective],
  template: `
    <button id="panel-launcher">Abrir</button>
    <section id="panel-background">La mesa</section>
    <aside [appTavernMobilePanel]="open" (mobilePanelClose)="closed = closed + 1" aria-labelledby="panel-title">
      <h2 id="panel-title" tabindex="-1">Amigos</h2>
      <button id="panel-close">Cerrar</button><button id="panel-last">Agregar amigo</button>
      <input aria-label="Buscar amigos" />
    </aside>`,
})
class PanelHostComponent { open = false; closed = 0; }

describe('TavernMobilePanelDirective', () => {
  let fixture: ComponentFixture<PanelHostComponent>;
  let listeners: Set<() => void>;
  let media: { matches: boolean; addEventListener: (name: string, listener: () => void) => void; removeEventListener: (name: string, listener: () => void) => void };
  let dialogs: { openDialogs: object[]; afterOpened: Subject<object>; afterAllClosed: Subject<void> };
  const query = <T extends HTMLElement = HTMLElement>(selector: string): T => fixture.nativeElement.querySelector(selector);
  const openPanel = () => { query('button').focus(); fixture.componentInstance.open = true; fixture.detectChanges(); tick(); };

  beforeEach(() => {
    listeners = new Set();
    media = {
      matches: true,
      addEventListener: (_name, listener) => listeners.add(listener),
      removeEventListener: (_name, listener) => listeners.delete(listener),
    };
    spyOn(window, 'matchMedia').and.returnValue(media as unknown as MediaQueryList);
    spyOn(window, 'scrollTo');
    dialogs = { openDialogs: [], afterOpened: new Subject(), afterAllClosed: new Subject() };
    TestBed.configureTestingModule({ imports: [PanelHostComponent], providers: [{ provide: MatDialog, useValue: dialogs }] });
    fixture = TestBed.createComponent(PanelHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => fixture?.destroy());

  it('on mobile focuses the heading, locks the background and restores it when closed', fakeAsync(() => {
    const originalOverflow = document.body.style.overflow;
    openPanel();
    expect(query('aside').getAttribute('role')).toBe('dialog');
    expect(query('aside').getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(query('h2'));
    expect(query('#panel-background').hasAttribute('inert')).toBeTrue();
    expect(document.body.style.overflow).toBe('hidden');
    fixture.componentInstance.open = false;
    fixture.detectChanges();
    tick();
    expect(query('aside').hasAttribute('aria-modal')).toBeFalse();
    expect(query('#panel-background').hasAttribute('inert')).toBeFalse();
    expect(document.body.style.overflow).toBe(originalOverflow);
    expect(document.activeElement).toBe(query('#panel-launcher'));
  }));

  it('leaves desktop semantics, scrolling and focus unchanged', fakeAsync(() => {
    media.matches = false;
    const originalOverflow = document.body.style.overflow;
    openPanel();
    expect(query('aside').hasAttribute('role')).toBeFalse();
    expect(query('#panel-background').hasAttribute('inert')).toBeFalse();
    expect(document.body.style.overflow).toBe(originalOverflow);
    expect(document.activeElement).toBe(query('#panel-launcher'));
  }));

  it('wraps tab focus with the CDK trap and emits Escape once', fakeAsync(() => {
    openPanel();
    const anchors = fixture.nativeElement.querySelectorAll('.cdk-focus-trap-anchor');
    expect(anchors.length).toBe(2);
    (anchors[1] as HTMLElement).focus();
    tick();
    expect(document.activeElement).toBe(query('#panel-close'));
    query('aside').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(fixture.componentInstance.closed).toBe(1);
  }));

  it('keeps Material overlays interactive and lets their dialog handle Escape', fakeAsync(() => {
    const overlay = document.createElement('div');
    overlay.className = 'cdk-overlay-container';
    overlay.innerHTML = '<div class="cdk-overlay-pane"><button>Confirmar</button></div>';
    document.body.append(overlay);
    try {
      openPanel();
      expect(overlay.hasAttribute('inert')).toBeFalse();
      dialogs.openDialogs.push({});
      dialogs.afterOpened.next({});
      const button = overlay.querySelector('button')!;
      button.focus();
      tick();
      expect(document.activeElement).toBe(button);
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(fixture.componentInstance.closed).toBe(0);
      dialogs.openDialogs = [];
      dialogs.afterAllClosed.next();
    } finally { overlay.remove(); }
  }));

  it('releases modal state when rotating out of the mobile breakpoint and reapplies it on return', fakeAsync(() => {
    openPanel();
    media.matches = false;
    listeners.forEach(listener => listener());
    tick();
    expect(query('aside').hasAttribute('aria-modal')).toBeFalse();
    expect(query('#panel-background').hasAttribute('inert')).toBeFalse();
    media.matches = true;
    listeners.forEach(listener => listener());
    tick();
    expect(query('aside').getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(query('h2'));
  }));

  it('cleans the focus trap, scroll lock and media subscription on destruction', fakeAsync(() => {
    const originalOverflow = document.body.style.overflow;
    openPanel();
    const background = query('#panel-background');
    fixture.destroy();
    tick();
    expect(background.hasAttribute('inert')).toBeFalse();
    expect(document.body.style.overflow).toBe(originalOverflow);
    expect(listeners.size).toBe(0);
  }));
});
