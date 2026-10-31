import { ChangeDetectorRef } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { CharacterHubComponent } from './character-hub.component';
import { ChatService, HUB_PAGE_SIZE, HubAvatar, HubFilters } from '../../core/services/chat.service';
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
  const gridCalls = () => getGlobalAvatars.calls.allArgs().filter(args => args[3] === HUB_PAGE_SIZE);
  const lastGridCall = () => gridCalls()[gridCalls().length - 1];

  beforeEach(() => {
    openChat = jasmine.createSpy('open');
    pickerClosed = new Subject();
    openPicker = jasmine.createSpy('openPicker').and.returnValue({afterClosed: () => pickerClosed});
    // 50 resultados: dos páginas de 24 y una de 2.
    getGlobalAvatars = jasmine.createSpy('getGlobalAvatars').and.callFake(
      (_q: string, sort: string, page: number, size: number, filters: HubFilters = {}) =>
        of({count: 50, next: null, previous: null,
          results: sort === 'daily' && filters.withPhoto ? portraits
            : size !== HUB_PAGE_SIZE ? characters.slice(0, size)
            : characters.slice(0, size).map(character => ({...character, group_key: `p${page}-${character.group_key}`}))}));
    TestBed.configureTestingModule({providers: [
      {provide: ChatService, useValue: {
        getGlobalAvatars,
        getRecentAvatars: () => of([characters[0], characters[0]]),
      }},
      {provide: CharacterChatService, useValue: {open: openChat}},
      {provide: MatDialog, useValue: {open: openPicker}},
      {provide: ApiService, useValue: {getCached: () => of({results: [
        {slug: 'terror', name: 'Terror y misterio', book_count: 20},
        {slug: 'vacia', name: 'Sin libros', book_count: 0},
      ]})}},
      {provide: AuthService, useValue: {}},
      {provide: Router, useValue: {}},
      {provide: ChangeDetectorRef, useValue: {markForCheck() {}, detectChanges() {}}},
      {provide: ScrollRevealService, useValue: {debouncedScan() {}}},
    ]});
    component = TestBed.runInInjectionContext(() => new CharacterHubComponent());
  });

  afterEach(() => component.ngOnDestroy());

  it('shows each identity once above the grid, including recent chats', () => {
    component.ngOnInit();
    const shown = [...component.recentCharacters, ...component.featuredCharacters,
      ...component.heroCharacters].map(hubIdentity);
    expect(new Set(shown).size).toBe(shown.length);
    expect(component.featuredCharacters.map(hubIdentity)).not.toContain('group-0');
  });

  it('fills the carousel only with portraits from the daily selection', () => {
    component.ngOnInit();
    expect(getGlobalAvatars).toHaveBeenCalledWith('', 'daily', 1, jasmine.any(Number), {withPhoto: true});
    expect(component.heroCharacters.map(slide => slide.id)).toEqual(['20', '21', '22']);
  });

  it('offers only categories that have books', () => {
    component.ngOnInit();
    expect(component.genres).toEqual([{slug: 'terror', name: 'Terror y misterio'}]);
  });

  it('starts the grid after the featured strip and moves page by page', fakeAsync(() => {
    component.ngOnInit();
    tick(0);
    expect(getGlobalAvatars).toHaveBeenCalledWith('', 'featured', 1, 12);
    expect(gridCalls()[0]).toEqual(['', 'featured', 1, HUB_PAGE_SIZE,
      {field: 'all', withPhoto: false, kind: 'all', genre: '', skip: 12}]);
    expect(component.gridPages).toBe(3);
    expect(component.gridCharacters.length).toBe(HUB_PAGE_SIZE);

    component.goToPage(2);
    expect(component.gridPage).toBe(2);
    expect(component.gridDirection).toBe(1);
    expect(lastGridCall()[2]).toBe(2);

    // Las páginas ya vistas no se vuelven a pedir.
    const before = gridCalls().length;
    component.goToPage(1);
    expect(component.gridDirection).toBe(-1);
    expect(gridCalls().length).toBe(before);

    component.goToPage(0);
    component.goToPage(4);
    expect(component.gridPage).toBe(1);
  }));

  it('prefetches the page an arrow points to, once', fakeAsync(() => {
    component.ngOnInit();
    tick(0);
    component.prefetch(2);
    component.prefetch(2);
    component.goToPage(2);
    expect(gridCalls().filter(args => args[2] === 2).length).toBe(1);
  }));

  it('asks for the chosen text, field, kind, category, sort and photo filter from page one', fakeAsync(() => {
    component.ngOnInit();
    tick(0);
    component.goToPage(2);

    component.searchQuery = 'Verne';
    component.setSearchField('author');
    component.setSort('popularity');
    component.toggleWithPhoto();
    component.setKind('author');
    component.setGenre('terror');
    tick(0);
    expect(component.isSearching).toBeTrue();
    expect(component.gridPage).toBe(1);
    expect(lastGridCall()).toEqual(['Verne', 'popularity', 1, HUB_PAGE_SIZE,
      {field: 'author', withPhoto: true, kind: 'author', genre: 'terror', skip: 0}]);
    expect(component.gridSummary).toBe('Populares · Terror y misterio · solo con retrato · 50 autores');
    expect(component.resultsTitle).toBe('Todos los autores');
  }));

  it('waits while typing and does not ask again after typing back to what is shown', fakeAsync(() => {
    component.ngOnInit();
    tick(0);
    const before = gridCalls().length;
    component.searchQuery = 'Ver';
    component.onSearchChange();
    component.searchQuery = '';
    component.onSearchChange();
    tick(400);
    expect(gridCalls().length).toBe(before);
    expect(component.gridLoading).toBeFalse();
    expect(component.isSearching).toBeFalse();
  }));

  it('goes back to the sections when the filters are cleared', fakeAsync(() => {
    component.ngOnInit();
    tick(0);
    component.setKind('character');
    tick(0);
    expect(component.isSearching).toBeTrue();
    component.clearFilters();
    tick(0);
    expect(component.isSearching).toBeFalse();
    expect(component.hasActiveFilters).toBeFalse();
    expect(component.gridPage).toBe(1);
    expect(component.gridCharacters.length).toBe(HUB_PAGE_SIZE);
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
