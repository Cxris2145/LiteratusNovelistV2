import { HttpParams } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { SpeechRecognitionService } from '../../services/speech-recognition.service';
import { HeaderSearchComponent } from './header-search.component';

const RESPONSE = {
  books: [
    { type: 'book', id: 'b1', slug: 'cien-anos', title: 'Cien años de soledad', author_name: 'Gabriel García Márquez', cover: null },
    { type: 'book', id: 'b2', slug: 'casa-tomada', title: 'Casa tomada', author_name: 'Julio Cortázar', cover: null },
  ],
  authors: [{ type: 'author', id: 'a1', slug: 'julio-cortazar', title: 'Julio Cortázar', book_count: 3, photo: null }],
  genres: [],
};
const EMPTY = { books: [], authors: [], genres: [] };

describe('HeaderSearchComponent', () => {
  let fixture: ComponentFixture<HeaderSearchComponent>;
  let component: HeaderSearchComponent;
  let router: Router;
  let reply: (search: string) => Observable<unknown>;
  const api = { get: jasmine.createSpy('get') };

  const searches = () => api.get.calls.allArgs()
    .filter(([endpoint, params]) => endpoint === 'catalog/autocomplete/' && params)
    .map(([, params]) => (params as HttpParams).get('search'));

  const type = (term: string) => {
    component.term = term;
    component.onTermChange();
  };
  const key = (name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, cancelable: true });
    component.onKeydown(event);
    return event;
  };

  beforeEach(async () => {
    reply = () => of(RESPONSE);
    api.get.calls.reset();
    api.get.and.callFake((_: string, params?: HttpParams) => reply(params?.get('search') ?? ''));

    await TestBed.configureTestingModule({
      imports: [FormsModule, RouterTestingModule],
      declarations: [HeaderSearchComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { currentUser: () => null } },
        { provide: SpeechRecognitionService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderSearchComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  });

  it('sugiere desde la primera letra, agrupado y con la coincidencia marcada', fakeAsync(() => {
    type('c');
    expect(component.expanded).toBeFalse();  // Aún no llega nada: no abre vacío.
    tick(90);

    expect(searches()).toEqual(['c']);
    expect(component.expanded).toBeTrue();
    expect(component.groups.map(g => g.label)).toEqual(['Obras', 'Autores']);
    expect(component.groups[0].options[1].title).toEqual([
      { text: 'C', hit: true }, { text: 'asa tomada', hit: false },
    ]);
    expect(component.optionCount).toBe(4);  // 3 sugerencias + "Ver todos".
    expect(component.liveMessage).toBe('3 sugerencias');
  }));

  it('espera a que se deje de teclear y descarta respuestas que llegan tarde', fakeAsync(() => {
    const pending = new Subject<unknown>();
    reply = search => (search === 'ca' ? pending : of(EMPTY));
    type('c');
    tick(40);
    type('ca');
    tick(90);
    expect(searches()).toEqual(['ca']);

    type('cas');
    pending.next(RESPONSE);  // La de "ca" llega cuando ya se escribe "cas".
    expect(component.groups).toEqual([]);
    tick(90);
    expect(searches()).toEqual(['ca', 'cas']);
    expect(component.settled).toBeTrue();
    expect(component.expanded).toBeTrue();  // "Sin coincidencias" para "cas".
    flush();
  }));

  it('lo ya consultado vuelve al instante sin pedirlo otra vez', fakeAsync(() => {
    type('c');
    tick(90);
    type('ca');
    tick(90);
    type('c');
    tick(0);
    expect(searches()).toEqual(['c', 'ca']);
    expect(component.groups.length).toBe(2);
  }));

  it('las flechas recorren las sugerencias y Enter abre la marcada', fakeAsync(() => {
    type('c');
    tick(90);
    key('ArrowDown');
    key('ArrowDown');
    expect(component.activeIndex).toBe(1);
    key('ArrowUp');
    key('ArrowUp');
    expect(component.activeIndex).toBe(3);  // Da la vuelta hasta "Ver todos".
    key('ArrowDown');
    key('ArrowDown');
    expect(component.activeIndex).toBe(1);

    const enter = key('Enter');
    expect(enter.defaultPrevented).toBeTrue();
    expect(router.navigate).toHaveBeenCalledWith(['/book', 'casa-tomada']);
    expect(component.expanded).toBeFalse();
    flush();
  }));

  it('Enter sin sugerencia marcada deja que el formulario busque en el catálogo', fakeAsync(() => {
    type('Misterio');
    tick(90);
    expect(key('Enter').defaultPrevented).toBeFalse();

    component.submit();
    expect(router.navigate).toHaveBeenCalledWith(['/catalog'], { queryParams: { search: 'Misterio' } });
    component.term = '';
    component.submit();
    expect(router.navigate).toHaveBeenCalledWith(['/catalog'], {});
  }));

  it('autores y géneros llevan a su página; "Ver todos" al catálogo', fakeAsync(() => {
    type('julio');
    tick(90);
    component.chooseIndex(2);
    expect(router.navigate).toHaveBeenCalledWith(['/author', 'julio-cortazar']);

    type('julio c');
    tick(90);
    component.chooseIndex(component.allResultsIndex);
    expect(router.navigate).toHaveBeenCalledWith(['/catalog'], { queryParams: { search: 'julio c' } });
  }));

  it('Escape cierra y un segundo Escape borra lo escrito', fakeAsync(() => {
    type('c');
    tick(90);
    key('Escape');
    expect(component.expanded).toBeFalse();
    expect(component.term).toBe('c');
    key('Escape');
    expect(component.term).toBe('');
  }));

  it('sin red avisa en vez de decir que no hay coincidencias', fakeAsync(() => {
    reply = () => throwError(() => new Error('offline'));
    type('c');
    tick(90);
    expect(component.failed).toBeTrue();
    expect(component.expanded).toBeTrue();
    expect(component.liveMessage).toBe('No se pudieron cargar las sugerencias');
  }));

  it('si la respuesta tarda, abre con "Buscando…"', fakeAsync(() => {
    const pending = new Subject<unknown>();
    reply = () => pending;
    type('c');
    tick(90);
    expect(component.expanded).toBeFalse();
    tick(200);
    expect(component.slow).toBeTrue();
    expect(component.expanded).toBeTrue();
    pending.next(RESPONSE);
    expect(component.slow).toBeFalse();
  }));

  it('borrar vacía el campo y cierra el panel', fakeAsync(() => {
    type('Fantasía');
    tick(90);
    component.clear();
    expect(component.term).toBe('');
    expect(component.expanded).toBeFalse();
    expect(component.groups).toEqual([]);
  }));
});
