import { ChangeDetectorRef, NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { CharacterHubComponent } from './character-hub.component';
import { ChatService, HubAvatar } from '../../core/services/chat.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { ScrollRevealService } from '../../core/services/scroll-reveal.service';
import { hubIdentity } from './character-hub.util';

describe('Character hub cards', () => {
  let component: CharacterHubComponent;
  let openChat: jasmine.Spy;
  let pickerClosed: Subject<string | undefined>;
  let openPicker: jasmine.Spy;
  const characters = Array.from({length: 25}, (_, index) => ({
    id: String(index), group_key: `group-${index}`, name: `Character ${index}`,
    avatar_image_url: null, description: '', book_title: 'Book',
  } as HubAvatar));

  beforeEach(() => {
    openChat = jasmine.createSpy('open');
    pickerClosed = new Subject();
    openPicker = jasmine.createSpy('openPicker').and.returnValue({afterClosed: () => pickerClosed});
    TestBed.configureTestingModule({providers: [
      {provide: ChatService, useValue: {
        getGlobalAvatars: () => of({count: 25, next: null, results: characters}),
        getRecentAvatars: () => of([characters[0], characters[0]]),
      }},
      {provide: CharacterChatService, useValue: {open: openChat}},
      {provide: MatDialog, useValue: {open: openPicker}},
      {provide: ApiService, useValue: {}}, {provide: AuthService, useValue: {}},
      {provide: Router, useValue: {}},
      {provide: ChangeDetectorRef, useValue: {markForCheck() {}, detectChanges() {}}},
      {provide: ScrollRevealService, useValue: {debouncedScan() {}}},
      {provide: NgZone, useValue: {runOutsideAngular: (action: () => unknown) => action()}},
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
