import { NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { NotebookService } from '../../notebook/notebook.service';
import { LibraryListComponent } from './library-list.component';

describe('LibraryListComponent mobile performance', () => {
  let fixture: ComponentFixture<LibraryListComponent>;
  let component: LibraryListComponent;
  let inventory: Subject<any[]>;

  beforeEach(() => {
    inventory = new Subject<any[]>();
    TestBed.configureTestingModule({
      declarations: [LibraryListComponent],
      providers: [
        { provide: ApiService, useValue: { get: () => inventory } },
        { provide: AuthService, useValue: { isLoggedIn: () => true } },
        { provide: CharacterChatService, useValue: {} },
        { provide: NotebookService, useValue: {} },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      ],
    }).overrideComponent(LibraryListComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(LibraryListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('reuses filtered results until the query, filter or inventory changes', () => {
    component.inventoryItems = [
      { id: '1', book_title: 'Odisea', progress: { completion_percentage: 25 } },
      { id: '2', book_title: 'Hamlet', progress: { completion_percentage: 100 } },
    ];
    component.searchTerm = ' oDISea ';
    const result = component.filteredItems;
    expect(result.map(item => item.id)).toEqual(['1']);
    component.searchTerm = 'odisea';
    expect(component.filteredItems).toBe(result);
    component.setFilter('completed');
    expect(component.filteredItems).toEqual([]);
    component.searchTerm = '';
    expect(component.filteredItems.map(item => item.id)).toEqual(['2']);
    component.inventoryItems = [{ id: '3', progress: { completion_percentage: 100 } }];
    expect(component.filteredItems.map(item => item.id)).toEqual(['3']);
  });

  it('refreshes all reading counts when a new inventory arrives', () => {
    inventory.next([
      { id: '1' }, { id: '2', progress: { completion_percentage: 30 } },
      { id: '3', progress: { completion_percentage: 100 } },
    ]);
    expect([component.unreadCount, component.readingCount, component.completedCount]).toEqual([1, 1, 1]);
    inventory.next([{ id: '4', progress: { completion_percentage: 120 } }]);
    expect([component.unreadCount, component.readingCount, component.completedCount]).toEqual([0, 0, 1]);
  });

  it('enters Angular only when Escape closes an open summary', () => {
    const zone = TestBed.inject(NgZone);
    const run = spyOn(zone, 'run').and.callThrough();
    zone.runOutsideAngular(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(run).not.toHaveBeenCalled();
    component.summaryItem = { id: '1' };
    zone.runOutsideAngular(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(run).toHaveBeenCalled();
    expect(component.summaryItem).toBeNull();
  });

  it('cancels a pending inventory request and removes the keyboard listener on destroy', () => {
    expect(inventory.observed).toBeTrue();
    fixture.destroy();
    expect(inventory.observed).toBeFalse();
    component.summaryItem = { id: '1' };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.summaryItem).toEqual({ id: '1' });
  });
});
