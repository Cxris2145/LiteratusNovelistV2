import { NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { VocabularyService } from '../../core/services/vocabulary.service';
import { FlashcardsComponent } from './flashcards.component';

describe('FlashcardsComponent keyboard performance', () => {
  let fixture: ComponentFixture<FlashcardsComponent>;
  let component: FlashcardsComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FlashcardsComponent],
      providers: [
        { provide: VocabularyService, useValue: { getVocabulary: () => of([]) } },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
        { provide: Router, useValue: {} },
      ],
    }).overrideComponent(FlashcardsComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(FlashcardsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.cards = [{ id: '1' }, { id: '2' }] as any;
  });

  it('ignores unrelated keys outside Angular and preserves navigation shortcuts', () => {
    const zone = TestBed.inject(NgZone);
    const run = spyOn(zone, 'run').and.callThrough();
    zone.runOutsideAngular(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
    expect(run).not.toHaveBeenCalled();
    zone.runOutsideAngular(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));
    expect(run).toHaveBeenCalled();
    expect(component.currentIndex).toBe(1);
  });

  it('leaves editable content and modifier shortcuts to the browser', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    const text = document.createElement('span');
    editor.append(text);
    document.body.append(editor);
    try {
      text.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true }));
      expect(component.currentIndex).toBe(0);
    } finally { editor.remove(); }
  });

  it('removes shortcuts on destroy', () => {
    fixture.destroy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(component.currentIndex).toBe(0);
  });
});
