import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';
import { CharacterChatService } from '../core/services/character-chat.service';
import { ChatService } from '../core/services/chat.service';
import { FavoritesService } from '../core/services/favorites.service';
import { LiyumiService } from '../core/services/liyumi.service';
import { NotificationService } from '../core/services/notification.service';
import { ScrollRevealService } from '../core/services/scroll-reveal.service';
import { AuthorListComponent } from './author-list/author-list.component';
import { BookDetailPageComponent } from './book-detail-page/book-detail-page.component';
import { BookListComponent } from './book-list/book-list.component';

describe('Catalog request lifecycle', () => {
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    api = jasmine.createSpyObj('ApiService', ['get', 'getCached', 'peekCached']);
    api.peekCached.and.returnValue(null);
    api.getCached.and.returnValue(of({ results: [], count: 0 }));
    TestBed.configureTestingModule({
      declarations: [BookListComponent, AuthorListComponent, BookDetailPageComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { queryParams: of({}), paramMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: {} },
        { provide: AuthService, useValue: { isLoggedIn: () => false } },
        { provide: FavoritesService, useValue: { bookKeys$: of([]) } },
        { provide: ScrollRevealService, useValue: { debouncedScan: jasmine.createSpy('scan') } },
        { provide: NotificationService, useValue: {} },
        { provide: CharacterChatService, useValue: {} },
        { provide: ChatService, useValue: { updateInkBalance: jasmine.createSpy('balance') } },
        { provide: LiyumiService, useValue: { speak: jasmine.createSpy('speak'), stopSpeaking: () => {} } },
      ]
    });
    for (const component of [BookListComponent, AuthorListComponent, BookDetailPageComponent]) {
      TestBed.overrideComponent(component, { set: { template: '', styles: [], styleUrls: [] } });
    }
  });

  it('keeps the latest book search when an older request finishes later', () => {
    const oldResponse = new Subject<any>();
    const newResponse = new Subject<any>();
    api.getCached.and.returnValues(oldResponse, newResponse);
    const fixture = TestBed.createComponent(BookListComponent);
    const component = fixture.componentInstance;
    component.fetchBooks();
    component.searchTerm = 'nuevo';
    component.fetchBooks();
    newResponse.next({ results: [{ id: 'new', title: 'Nuevo' }], count: 1 });
    oldResponse.next({ results: [{ id: 'old', title: 'Anterior' }], count: 99 });
    expect(component.books.map(book => book.id)).toEqual(['new']);
    expect(component.totalCount).toBe(1);
    fixture.destroy();
  });

  it('renders a cached page once without subscribing to its replay again', () => {
    api.peekCached.and.returnValue({ results: [{ id: 'cached', title: 'En caché' }], count: 1 });
    const fixture = TestBed.createComponent(BookListComponent);
    fixture.componentInstance.fetchBooks();
    expect(fixture.componentInstance.books[0].id).toBe('cached');
    expect(api.getCached).not.toHaveBeenCalled();
    expect(TestBed.inject(ScrollRevealService).debouncedScan).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('cancels a pending book search when leaving the view', fakeAsync(() => {
    const fixture = TestBed.createComponent(BookListComponent);
    fixture.componentInstance.isHome = true;
    fixture.detectChanges();
    const fetch = spyOn(fixture.componentInstance, 'fetchBooks');
    fixture.componentInstance.onSearch({ target: { value: 'pendiente' } });
    fixture.destroy();
    tick(500);
    expect(fetch).not.toHaveBeenCalled();
  }));

  it('keeps the latest author search and cancels pending search on destroy', fakeAsync(() => {
    const oldResponse = new Subject<any>();
    const newResponse = new Subject<any>();
    api.getCached.and.returnValues(oldResponse, newResponse);
    const fixture = TestBed.createComponent(AuthorListComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.searchTerm = 'nuevo';
    component.fetchAuthors();
    newResponse.next({ results: [{ id: 'new' }], count: 1 });
    oldResponse.next({ results: [{ id: 'old' }], count: 99 });
    expect(component.filteredAuthors.map(author => author.id)).toEqual(['new']);
    const fetch = spyOn(component, 'fetchAuthors');
    component.onSearch({ target: { value: 'pendiente' } });
    fixture.destroy();
    tick(500);
    expect(fetch).not.toHaveBeenCalled();
  }));

  it('discards an older book detail response and its delayed greeting on exit', fakeAsync(() => {
    const oldResponse = new Subject<any>();
    const newResponse = new Subject<any>();
    api.get.and.returnValues(oldResponse, newResponse);
    spyOn(window, 'scrollTo');
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    const fixture: ComponentFixture<BookDetailPageComponent> = TestBed.createComponent(BookDetailPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.loadBookDetails('old');
    component.loadBookDetails('new');
    newResponse.next({ title: 'Nuevo', avatars: [] });
    oldResponse.next({ title: 'Anterior', avatars: [{ id: 'old' }] });
    expect(component.book.title).toBe('Nuevo');
    expect(component.displayAvatars).toEqual([]);
    fixture.destroy();
    tick(1000);
    expect(TestBed.inject(LiyumiService).speak).not.toHaveBeenCalled();
  }));
});
