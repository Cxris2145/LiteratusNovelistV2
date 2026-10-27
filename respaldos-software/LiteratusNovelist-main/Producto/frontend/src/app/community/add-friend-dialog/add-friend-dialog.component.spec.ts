import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject, of, throwError } from 'rxjs';

import { CommunityResult, CommunityService, FriendSuggestion, TavernCard } from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { AddFriendDialogComponent } from './add-friend-dialog.component';

function reader(code: string, relation: TavernCard['relation'] = 'none', requestId: string | null = null): TavernCard {
  return {
    full: false, friend_code: code, username: code, avatar: null, outfit: {},
    equipped_frame: '', equipped_title: '', is_public: true, relation, request_id: requestId,
  };
}

describe('AddFriendDialogComponent: búsqueda y solicitudes', () => {
  let fixture: ComponentFixture<AddFriendDialogComponent>;
  let component: AddFriendDialogComponent;
  let community: jasmine.SpyObj<CommunityService>;
  let notification: jasmine.SpyObj<NotificationService>;
  let dialog: jasmine.SpyObj<MatDialogRef<AddFriendDialogComponent>>;
  let beforeClosed: Subject<void>;

  beforeEach(() => {
    community = jasmine.createSpyObj<CommunityService>('CommunityService',
      ['search', 'suggestions', 'sendRequest', 'cancel', 'accept'], { changed$: new Subject<void>() });
    community.search.and.returnValue(of({ results: [] }));
    community.suggestions.and.returnValue(of({ results: [] }));
    community.sendRequest.and.returnValue(of({ success: true, message: 'Solicitud enviada.', id: 'request-1', state: 'pending' }));
    community.cancel.and.returnValue(of({ success: true, message: 'Solicitud cancelada.' }));
    community.accept.and.returnValue(of({ success: true, message: 'Solicitud aceptada.', state: 'accepted' }));
    notification = jasmine.createSpyObj<NotificationService>('NotificationService', ['success', 'error', 'info']);
    beforeClosed = new Subject<void>();
    dialog = jasmine.createSpyObj<MatDialogRef<AddFriendDialogComponent>>('MatDialogRef', ['close', 'beforeClosed']);
    dialog.beforeClosed.and.returnValue(beforeClosed);
    TestBed.configureTestingModule({
      declarations: [AddFriendDialogComponent],
      providers: [
        { provide: CommunityService, useValue: community },
        { provide: NotificationService, useValue: notification },
        { provide: MatDialogRef, useValue: dialog },
        { provide: MAT_DIALOG_DATA, useValue: { myCode: 'MYCODE' } },
      ],
    });
    // El ciclo asíncrono se comprueba sin acoplar las pruebas al diseño de las tarjetas.
    TestBed.overrideComponent(AddFriendDialogComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(AddFriendDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('espera 300 ms desde el último cambio y no consulta nombres ni códigos de menos de 3 letras', fakeAsync(() => {
    component.query.setValue('#ab');
    tick(300);
    expect(community.search).not.toHaveBeenCalled();

    component.query.setValue('lect');
    tick(150);
    component.query.setValue('  #K7Q2XM  ');
    tick(299);
    expect(community.search).not.toHaveBeenCalled();
    tick(1);
    expect(community.search).toHaveBeenCalledOnceWith('#K7Q2XM');
  }));

  it('acortar una búsqueda cancela la petición en el acto e ignora su respuesta tardía', fakeAsync(() => {
    const response = new Subject<{ results: TavernCard[] }>();
    community.search.and.returnValue(response);
    component.query.setValue('lectora');
    tick(300);
    expect(response.observed).toBeTrue();
    expect(component.searching).toBeTrue();

    component.query.setValue('le');
    expect(response.observed).toBeFalse();
    expect(component.searching).toBeFalse();
    expect(component.searched).toBeFalse();
    response.next({ results: [reader('late')] });
    tick(300);
    expect(component.results).toEqual([]);
    expect(component.showSuggestions).toBeTrue();
    expect(community.search).toHaveBeenCalledTimes(1);
  }));

  it('una consulta nueva cancela la anterior antes del debounce y solo muestra su propia respuesta', fakeAsync(() => {
    const oldResponse = new Subject<{ results: TavernCard[] }>();
    const newResponse = new Subject<{ results: TavernCard[] }>();
    community.search.and.callFake(query => query === 'anterior' ? oldResponse : newResponse);
    component.query.setValue('anterior');
    tick(300);
    component.query.setValue('nueva');

    expect(oldResponse.observed).toBeFalse();
    oldResponse.next({ results: [reader('old')] });
    tick(299);
    expect(community.search).toHaveBeenCalledTimes(1);
    expect(component.results).toEqual([]);
    tick(1);
    newResponse.next({ results: [reader('new')] });
    expect(component.results.map(card => card.friend_code)).toEqual(['new']);
    expect(component.searched).toBeTrue();
    expect(component.searching).toBeFalse();
  }));

  it('limpiar quita errores y resultados y permite buscar de nuevo después de un fallo', fakeAsync(() => {
    community.search.and.returnValue(throwError(() => new Error('Sin conexión')));
    component.query.setValue('lectora');
    tick(300);
    expect(component.failed).toBeTrue();
    expect(component.searching).toBeFalse();

    component.clearQuery();
    expect(component.query.value).toBe('');
    expect(component.failed).toBeFalse();
    expect(component.searched).toBeFalse();
    expect(component.liveMessage).toBe('');
    community.search.and.returnValue(of({ results: [reader('found')] }));
    component.query.setValue('lectora');
    tick(300);
    expect(component.results[0].friend_code).toBe('found');
    expect(component.failed).toBeFalse();
  }));

  it('enviar evita duplicados mientras espera y conserva el estado en sugerencias y búsqueda', () => {
    const response = new Subject<CommunityResult>();
    community.sendRequest.and.returnValue(response);
    const card = reader('friend');
    const suggestion: FriendSuggestion = { ...card, reason: 'Lecturas afines', mutual_friends: 0 };
    component.results = [card];
    component.suggestions = [suggestion];
    const changed = spyOn(community.changed$, 'next');

    component.act(card);
    component.act(card);
    expect(component.busy).toBe(card.friend_code);
    expect(community.sendRequest).toHaveBeenCalledOnceWith({ friend_code: card.friend_code });
    response.next({ success: true, message: 'Enviada.', id: 'request-2', state: 'pending' });
    response.complete();

    expect(component.busy).toBeNull();
    expect(card.relation).toBe('outgoing');
    expect(suggestion.relation).toBe('outgoing');
    expect(suggestion.request_id).toBe('request-2');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('cancelar una enviada permite volver a agregar al lector', () => {
    const card = reader('friend', 'outgoing', 'request-1');
    component.act(card);

    expect(community.cancel).toHaveBeenCalledOnceWith('request-1');
    expect(community.sendRequest).not.toHaveBeenCalled();
    expect(card.relation).toBe('none');
    expect(card.request_id).toBeNull();
    expect(component.suggestionLabel(card)).toBe('Agregar');
    expect(component.busy).toBeNull();
  });

  it('aceptar una recibida la convierte en amistad y no permite repetir la acción', () => {
    const card = reader('friend', 'incoming', 'request-3');
    component.act(card);
    component.act(card);

    expect(community.accept).toHaveBeenCalledOnceWith('request-3');
    expect(card.relation).toBe('friend');
    expect(card.request_id).toBeNull();
    expect(component.suggestionLabel(card)).toBe('Amigos');
    expect(community.sendRequest).not.toHaveBeenCalled();
  });

  it('un fallo al enviar mantiene el estado y vuelve a habilitar las acciones', () => {
    community.sendRequest.and.returnValue(throwError(() => ({ error: { message: 'No disponible.' } })));
    const card = reader('friend');
    component.act(card);

    expect(card.relation).toBe('none');
    expect(component.busy).toBeNull();
    expect(notification.error).toHaveBeenCalledWith('No disponible.', 'Taberna');
    expect(notification.success).not.toHaveBeenCalled();
  });

  it('cerrar cancela búsquedas, sugerencias y acciones pendientes sin notificar respuestas tardías', fakeAsync(() => {
    const search = new Subject<{ results: TavernCard[] }>();
    const suggestions = new Subject<{ results: FriendSuggestion[] }>();
    const action = new Subject<CommunityResult>();
    community.search.and.returnValue(search);
    community.suggestions.and.returnValue(suggestions);
    community.sendRequest.and.returnValue(action);
    component.loadSuggestions();
    component.query.setValue('lectora');
    tick(300);
    component.act(reader('friend'));
    expect(search.observed && suggestions.observed && action.observed).toBeTrue();

    component.close();
    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(search.observed || suggestions.observed || action.observed).toBeFalse();
    expect(component.searching).toBeFalse();
    expect(component.busy).toBeNull();
    action.next({ success: true, message: 'Tarde.' });
    search.next({ results: [reader('late')] });
    component.query.setValue('otra');
    tick(300);
    expect(component.results).toEqual([]);
    expect(notification.success).not.toHaveBeenCalled();
    expect(community.search).toHaveBeenCalledTimes(1);
  }));

  it('Escape o el fondo del diálogo cancela una búsqueda antes de destruir la vista', fakeAsync(() => {
    const response = new Subject<{ results: TavernCard[] }>();
    community.search.and.returnValue(response);
    component.query.setValue('lectora');
    tick(300);

    beforeClosed.next();
    expect(response.observed).toBeFalse();
    expect(component.searching).toBeFalse();
    expect(dialog.close).not.toHaveBeenCalled();
  }));
});
