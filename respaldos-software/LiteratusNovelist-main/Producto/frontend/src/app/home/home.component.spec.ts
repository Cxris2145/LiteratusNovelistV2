import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';
import { CharacterChatService } from '../core/services/character-chat.service';
import { HomeDataService, PublicHome } from '../core/services/home-data.service';
import { ScrollRevealService } from '../core/services/scroll-reveal.service';
import { HomeComponent } from './home.component';

describe('HomeComponent public data', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let api: jasmine.SpyObj<ApiService>;
  let homeData: jasmine.SpyObj<HomeDataService>;
  let loggedIn: boolean;

  const home: PublicHome = {
    version: 1, audience: 'public', generated_at: new Date().toISOString(),
    stats: { total_books: 50, total_characters: 100, total_authors: 20, total_genres: 5 },
    books: [{ id: '1', title: 'La Odisea', slug: 'la-odisea-homero', synopsis: '',
      is_featured: true, cover_image: 'https://example.com/cover.webp', author_name: 'Homero', genres: [] }],
    starter_books: [{ slug: 'la-odisea-homero', title: 'La Odisea', author: 'Homero', genre: 'Clásicos', cover: 'https://example.com/cover.webp' }],
    genres: [{ name: 'Clásicos', slug: 'clasicos', bookCount: 50, image: 'https://example.com/genre.webp' }],
    cast: [{ id: 'avatar', name: 'Odiseo', role: 'Rey de Ítaca', bookTitle: 'La Odisea',
      bookSlug: 'la-odisea-homero', image: 'https://example.com/avatar.webp', isPortrait: true }]
  };

  beforeEach(async () => {
    loggedIn = false;
    api = jasmine.createSpyObj('ApiService', ['get']);
    api.get.and.returnValue(of({ level: 2 }));
    homeData = jasmine.createSpyObj('HomeDataService', ['getHome']);
    homeData.getHome.and.returnValue(of(home));
    await TestBed.configureTestingModule({
      declarations: [HomeComponent],
      imports: [RouterTestingModule],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: HomeDataService, useValue: homeData },
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn, currentUser: () => ({ username: 'Lector' }) } },
        { provide: CharacterChatService, useValue: { open: jasmine.createSpy('open') } },
        { provide: ScrollRevealService, useValue: { scan: jasmine.createSpy('scan') } }
      ]
    }).overrideComponent(HomeComponent, { set: { template: '', styles: [], styleUrls: [] } }).compileComponents();
    
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  it('fills every public section with one shared home request and no per-book API calls', () => {
    fixture.detectChanges();
    expect(homeData.getHome).toHaveBeenCalledTimes(1);
    expect(api.get).not.toHaveBeenCalled();
    expect(component.totalBooks).toBe(50);
    expect(component.totalCharacters).toBe(100);
    expect(component.genreTiles).toEqual(home.genres);
    expect(component.starterBooks).toEqual(home.starter_books);
    expect(component.cast).toEqual(home.cast);
    expect(component.odysseus?.id).toBe('avatar');
    expect(component.castLoaded).toBeTrue();
  });

  it('asks Supabase for thumbnails instead of the original images', () => {
    const storage = 'https://x.supabase.co/storage/v1/object/public/literatus-media';
    const covers = Array.from({ length: 12 }, (_, i) => `${storage}/book_covers/libro-${i}.jpg`);
    homeData.getHome.and.returnValue(of({
      ...home,
      books: covers.map((cover_image, i) => ({ ...home.books[0], id: String(i), slug: `libro-${i}`, cover_image })),
      starter_books: [{ ...home.starter_books[0], cover: covers[0] }],
      genres: [{ ...home.genres[0], image: `${storage}/category_covers/clasicos.webp` }],
      cast: [{ ...home.cast[0], image: `${storage}/ai_avatars/odiseo.webp` }]
    }));
    fixture.detectChanges();
    const thumb = `${storage.replace('/object/', '/render/image/')}`;
    expect(component.wallColumns.flat().every(src => src.startsWith(thumb) && src.includes('width=320'))).toBeTrue();
    expect(component.starterBooks[0].cover).toContain(`${thumb}/book_covers/libro-0.jpg?width=300&height=450`);
    expect(component.genreTiles[0].image).toBe(`${thumb}/category_covers/clasicos.webp?width=800&quality=62`);
    expect(component.cast[0].image).toBe(`${thumb}/ai_avatars/odiseo.webp?width=480&quality=62`);
  });

  it('keeps profile and inventory separate from the public response for signed-in readers', () => {
    loggedIn = true;
    api.get.and.returnValues(of({ level: 2 }), of([]));
    fixture.detectChanges();
    expect(homeData.getHome).toHaveBeenCalledTimes(1);
    expect(api.get.calls.allArgs()).toEqual([['users/profile/'], ['library/inventory/']]);
    expect(component.profileLoaded).toBeTrue();
    expect(component.userName).toBe('Lector');
    expect(component.totalBooks).toBe(50);
  });

  it('ends skeletons without stale hard-coded counts if public sources are unavailable', () => {
    homeData.getHome.and.returnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();
    expect(component.castLoaded).toBeTrue();
    expect(component.cast).toEqual([]);
    expect(component.totalBooks).toBe(0);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('stops applying a pending public response after leaving the page', () => {
    const pending = new Subject<PublicHome>();
    homeData.getHome.and.returnValue(pending);
    fixture.detectChanges();
    fixture.destroy();
    pending.next(home);
    expect(component.totalBooks).toBe(0);
    expect(component.cast).toEqual([]);
  });
});
