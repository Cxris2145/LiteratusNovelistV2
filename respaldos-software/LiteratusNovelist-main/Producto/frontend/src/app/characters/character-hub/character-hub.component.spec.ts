import { ChangeDetectorRef } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { CharacterHubComponent } from './character-hub.component';
import { ChatService, HubAvatar, HubFilters } from '../../core/services/chat.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { ScrollRevealService } from '../../core/services/scroll-reveal.service';
import { hubIdentity, segmentClip } from './character-hub.util';

describe('Character hub cards', () => {
  let component: CharacterHubComponent;
  let openChat: jasmine.Spy;
  let pickerClosed: Subject<string | undefined>;
  let openPicker: jasmine.Spy;
  let getGlobalAvatars: jasmine.Spy;
  const characters = Array.from({length: 25}, (_, index) => ({
    id: String(index), group_key: `group-${index}`, name: `Character ${index}`,
    avatar_image_url: null, description: '', book_title: 'Book',
  } as HubAvatar));
  // El carrusel pide retratos: uno viene sin imagen para comprobar que se descarta igual.
  const portraits = [
    ...characters.slice(20, 23).map(character => ({...character, avatar_image_url: `https://example.test/${character.id}.webp`})),
    characters[24],
  ];

  beforeEach(() => {
    openChat = jasmine.createSpy('open');
    pickerClosed = new Subject();
    openPicker = jasmine.createSpy('openPicker').and.returnValue({afterClosed: () => pickerClosed});
    getGlobalAvatars = jasmine.createSpy('getGlobalAvatars').and.callFake(
      (_q: string, sort: string, _page: number, _size: number, filters: HubFilters = {}) =>
        of({count: 25, next: null, results: sort === 'daily' && filters.withPhoto ? portraits : characters}));
    TestBed.configureTestingModule({providers: [
      {provide: ChatService, useValue: {
        getGlobalAvatars,
        getRecentAvatars: () => of([characters[0], characters[0]]),
      }},
      {provide: CharacterChatService, useValue: {open: openChat}},
      {provide: MatDialog, useValue: {open: openPicker}},
      {provide: ApiService, useValue: {}}, {provide: AuthService, useValue: {}},
      {provide: Router, useValue: {}},
      {provide: ChangeDetectorRef, useValue: {markForCheck() {}, detectChanges() {}}},
      {provide: ScrollRevealService, useValue: {debouncedScan() {}}},
    ]});
    component = TestBed.runInInjectionContext(() => new CharacterHubComponent());
  });

  afterEach(() => component.ngOnDestroy());

  it('shows each loaded identity in just one section, including recent chats', () => {
    component.ngOnInit();
    const shown = [...component.recentCharacters, ...component.featuredCharacters,
      ...component.heroCharacters, ...component.catalogCharacters].map(hubIdentity);
    expect(shown.length).toBe(25);
    expect(new Set(shown).size).toBe(25);
  });

  it('fills the carousel only with portraits from the daily selection', () => {
    component.ngOnInit();
    expect(getGlobalAvatars).toHaveBeenCalledWith('', 'daily', 1, jasmine.any(Number), {withPhoto: true});
    expect(component.heroCharacters.map(slide => slide.id)).toEqual(['20', '21', '22']);
    expect(component.featuredCharacters.map(hubIdentity)).not.toContain('group-20');
  });

  it('lists portraits first by default and asks for the chosen field, sort and photo filter', fakeAsync(() => {
    component.ngOnInit();
    expect(getGlobalAvatars).toHaveBeenCalledWith('', 'featured', 1);

    component.searchQuery = 'Verne';
    component.setSearchField('author');
    component.setSort('popularity');
    component.toggleWithPhoto();
    tick(0);
    expect(component.isSearching).toBeTrue();
    expect(getGlobalAvatars).toHaveBeenCalledWith('Verne', 'popularity', 1, jasmine.any(Number),
      {field: 'author', withPhoto: true});
    expect(component.filteredCharacters.length).toBe(25);
  }));

  it('goes back to the sections when the filters are cleared', fakeAsync(() => {
    component.ngOnInit();
    component.setSort('name');
    tick(0);
    expect(component.isSearching).toBeTrue();
    component.clearFilters();
    tick(0);
    expect(component.isSearching).toBeFalse();
    expect(component.filteredCharacters).toEqual([]);
    expect(component.hasActiveFilters).toBeFalse();
  }));

  it('clips the active copy of a segmented control over the chosen option', () => {
    expect(segmentClip(0, 4)).toBe('inset(0 75% 0 0% round 999px)');
    expect(segmentClip(3, 4)).toBe('inset(0 0% 0 75% round 999px)');
  });

  it('opens the selected book avatar instead of an arbitrary edition', () => {
    const character = {...characters[0], works: [
      {avatar_id: 'book-one-avatar', book_title: 'Book one', book_slug: 'one'},
      {avatar_id: 'book-two-avatar', book_title: 'Book two', book_slug: 'two'},
    ]};
    component.openChat(character);
    expect(openPicker).toHaveBeenCalled();
    expect(openChat).not.toHaveBeenCalled();
    pickerClosed.next('book-two-avatar');
    expect(openChat).toHaveBeenCalledOnceWith('book-two-avatar');
  });

  it('tries the original portrait when transformation fails, then a placeholder', () => {
    const img = document.createElement('img');
    img.src = 'https://example.test/storage/v1/render/image/public/a.webp';
    const event = {target: img} as unknown as Event;
    component.onImgError(event, 'https://example.test/storage/v1/object/public/a.webp');
    expect(img.src).toContain('/object/public/');
    component.onImgError(event, 'https://example.test/storage/v1/object/public/a.webp');
    expect(img.src).toContain('default-avatar.svg');
  });
});
