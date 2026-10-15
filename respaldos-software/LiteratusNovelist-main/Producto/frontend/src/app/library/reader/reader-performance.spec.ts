import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ChapterCache, prepareChapter } from './reader-chapter';
import { ReaderFrozenDirective } from './reader-frozen.directive';
import { ReaderHighlighter } from './reader-highlighter';

describe('ReaderHighlighter', () => {
  let canvas: HTMLElement;
  let highlighter: ReaderHighlighter;

  beforeEach(() => {
    canvas = document.createElement('main');
    canvas.innerHTML = `
      <h1 class="chapter-title-main"><span class="word" id="word-0">Título</span></h1>
      <p><span class="sentence-wrap"><span class="word" id="word-1">Uno</span> <span class="word" id="word-2">dos.</span></span>
         <span class="sentence-wrap"><span class="word" id="word-3">Tres</span></span></p>
      <p><span class="sentence-wrap"><span class="word" id="word-4">Cuatro</span></span></p>`;
    document.body.appendChild(canvas);
    highlighter = new ReaderHighlighter(() => canvas);
  });

  afterEach(() => canvas.remove());

  const marked = (cls: string) => Array.from(canvas.querySelectorAll(`.${cls}`));

  it('marca la palabra, su oración y su párrafo, y avisa al lienzo', () => {
    highlighter.set(2);
    expect(marked('active-word').map(e => e.id)).toEqual(['word-2']);
    expect(marked('active-paragraph-text')).toEqual([canvas.querySelector('#word-2')!.parentElement!]);
    expect(marked('active-paragraph')).toEqual([canvas.querySelectorAll('p')[0]]);
    expect(canvas.classList.contains('rc-has-focus')).toBeTrue();
  });

  it('al moverse deja una sola marca de cada tipo', () => {
    highlighter.set(1);
    highlighter.set(3); // misma frase no, mismo párrafo sí
    highlighter.set(4);
    expect(marked('active-word').length).toBe(1);
    expect(marked('active-paragraph-text').length).toBe(1);
    expect(marked('active-paragraph')).toEqual([canvas.querySelectorAll('p')[1]]);
  });

  it('en el título solo marca la palabra', () => {
    highlighter.set(0);
    expect(marked('active-word').map(e => e.id)).toEqual(['word-0']);
    expect(marked('active-paragraph-text').length).toBe(0);
    expect(marked('active-paragraph').length).toBe(0);
  });

  it('con -1 quita todo', () => {
    highlighter.set(2);
    highlighter.set(-1);
    expect(marked('active-word').length + marked('active-paragraph-text').length + marked('active-paragraph').length).toBe(0);
    expect(canvas.classList.contains('rc-has-focus')).toBeFalse();
  });

  it('refresh encuentra la palabra si el capítulo se volvió a pintar', () => {
    highlighter.set(4);
    const old = canvas.querySelector('#word-4')!;
    old.id = '';
    const fresh = document.createElement('span');
    fresh.className = 'word';
    fresh.id = 'word-4';
    canvas.querySelectorAll('p')[0].appendChild(fresh);
    highlighter.refresh();
    expect(old.classList.contains('active-word')).toBeFalse();
    expect(fresh.classList.contains('active-word')).toBeTrue();
  });
});

describe('prepareChapter y ChapterCache', () => {
  const html = '<p>Capítulo 1 - El comienzo</p><p>Era un día. Llovía mucho.</p><p>Fin</p>';

  it('saca el título, agrupa oraciones y deja el texto plano', () => {
    const ch = prepareChapter(html, 'Capítulo 1 - El comienzo', 'http://x');
    expect(ch.titleTokens.map(t => t.text).join('').replace(/\s+/g, ' ').trim()).toBe('Capítulo 1 - El comienzo');
    expect(ch.blocks.length).toBe(2);
    expect(ch.blocks[0].sentences!.length).toBe(2);
    expect(ch.blocks[0].firstWord).toBeGreaterThan(0);
    expect(ch.plainText).toContain('Llovía mucho.');
  });

  it('no descarga imágenes al preparar y las apunta al backend', () => {
    const ch = prepareChapter('<p>Hola <img src="media/a.png"></p>', 'Otro', 'http://api');
    const img = ch.blocks.flatMap(b => b.tokens).find(t => t.isImg);
    expect(img?.src).toBe('http://api/media/a.png');
  });

  it('guarda los últimos y no vuelve a preparar', () => {
    const cache = new ChapterCache(2);
    let calls = 0;
    const prep = () => { calls++; return prepareChapter(html, 'x', ''); };
    const a = cache.get('a', prep);
    expect(cache.get('a', prep)).toBe(a);
    cache.get('b', prep);
    cache.get('c', prep); // saca a "a", el más viejo
    expect(cache.has('a')).toBeFalse();
    expect(calls).toBe(3);
  });
});

@Component({
  template: `<ng-template [rdFrozen]="[items, version]" (rdFrozenRefreshed)="refreshed = refreshed + 1">
    @for (item of items; track $index) { <span class="item">{{ label(item) }}</span> }
  </ng-template>`,
})
class FrozenHostComponent {
  items = ['a', 'b'];
  version = 0;
  reads = 0;
  refreshed = 0;
  label(item: string) { this.reads++; return item; }
}

describe('ReaderFrozenDirective', () => {
  it('no vuelve a revisar su plantilla hasta que cambia una dependencia', () => {
    TestBed.configureTestingModule({ declarations: [FrozenHostComponent, ReaderFrozenDirective] });
    const fixture = TestBed.createComponent(FrozenHostComponent);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    const items = () => Array.from(fixture.nativeElement.querySelectorAll('.item')).map((e: any) => e.textContent);
    expect(items()).toEqual(['a', 'b']);
    const reads = host.reads;

    fixture.detectChanges();
    fixture.detectChanges();
    expect(host.reads).toBe(reads); // pasadas sin cambios: la plantilla no se revisa

    host.items = ['a', 'b', 'c'];
    fixture.detectChanges();
    expect(items()).toEqual(['a', 'b', 'c']);

    host.items.push('d'); // cambio por dentro: se avisa con la versión
    host.version++;
    fixture.detectChanges();
    expect(items()).toEqual(['a', 'b', 'c', 'd']);
    expect(host.refreshed).toBe(3);
  });
});
