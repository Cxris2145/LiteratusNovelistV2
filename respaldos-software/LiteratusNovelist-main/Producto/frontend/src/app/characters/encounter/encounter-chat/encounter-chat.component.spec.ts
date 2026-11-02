import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { Encounter, EncounterService } from '../../../core/services/encounter.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { EncounterChatComponent } from './encounter-chat.component';

describe('EncounterChatComponent · la cola de turnos', () => {
  let component: EncounterChatComponent;
  let sendChat: jasmine.Spy;
  const encounter: Encounter = {
    id: 'e1', title: 'Alicia y Bruno', topic: '', created_at: '', messages: [],
    participants: [
      { id: 'a', name: 'Alicia', book_title: 'La isla', book_slug: 'isla', avatar_image_url: null, is_author: false },
      { id: 'b', name: 'Bruno', book_title: 'El faro', book_slug: 'faro', avatar_image_url: null, is_author: false },
    ],
  };
  const reply = (id: string, speaker: string, text = 'Hola') =>
    ({ reply: text, speaker_id: speaker, message_id: id, request_id: 'req-' + id, timestamp: '' });

  beforeEach(() => {
    sendChat = jasmine.createSpy('sendChat');
    TestBed.configureTestingModule({
      providers: [
        { provide: EncounterService, useValue: { get: () => of(structuredClone(encounter)), create: jasmine.createSpy('create'), setTopic: jasmine.createSpy('setTopic') } },
        { provide: SubscriptionService, useValue: { sendChat } },
        { provide: AuthService, useValue: { isLoggedIn: () => true, isGuest: () => false } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new EncounterChatComponent());
    component.encounterId = 'e1';
  });

  it('a los dos: responde uno y, tras una pausa, el otro reacciona', fakeAsync(() => {
    sendChat.and.returnValues(of(reply('r1', 'a')), of(reply('r2', 'b', 'Encantado')));
    component.draft = 'Hola';
    component.send();
    expect(sendChat.calls.argsFor(0)).toEqual(['e1', 'Hola', { speakerId: 'a', after: null }]);
    expect(component.lines.map(l => l.role)).toEqual(['user', 'assistant']);
    tick(600);
    expect(sendChat.calls.argsFor(1)).toEqual(['e1', '', { speakerId: 'b', after: 'r1' }]);
    expect(component.lines.map(l => l.speaker_id)).toEqual([null, 'a', 'b']);
    expect(component.working).toBeFalse();
    flush();
  }));

  it('Detener deja terminar el turno en curso y no pide más', fakeAsync(() => {
    const pending = new Subject<any>();
    sendChat.and.returnValue(pending);
    component.startAuto();
    expect(component.autoRunning).toBeTrue();
    component.stopAuto();
    pending.next(reply('r1', 'a'));
    pending.complete();
    tick(2000);
    expect(sendChat).toHaveBeenCalledTimes(1);
    expect(component.lines.length).toBe(1);
    expect(component.autoRunning).toBeFalse();
    flush();
  }));

  it('un doble clic en Detener no vuelve a arrancar la ronda', fakeAsync(() => {
    sendChat.and.returnValue(of(reply('r1', 'a')));
    component.startAuto();          // el primer turno llega al tiro; el resto espera la pausa
    component.stopAuto();
    component.startAuto();          // segundo clic, ya sobre «Que sigan conversando»
    expect(sendChat).toHaveBeenCalledTimes(1);
    tick(900);
    component.startAuto();          // un rato después sí se puede reanudar
    expect(sendChat).toHaveBeenCalledTimes(2);
    component.stopAuto();
    flush();
  }));

  it('sin plan ni pase: el texto vuelve al campo y se envía al activar el pase', fakeAsync(() => {
    sendChat.and.returnValues(throwError(() => ({ needsPass: true, usage: {} })), of(reply('r1', 'a')), of(reply('r2', 'b')));
    component.send('Hola');
    expect(component.offerPass).toBeTruthy();
    expect(component.draft).toBe('Hola');
    expect(component.lines.length).toBe(0);
    component.onPassActivated();
    expect(sendChat.calls.argsFor(1)[1]).toBe('Hola');
    expect(component.draft).toBe('');
    tick(600);
    flush();
  }));

  it('si falla un turno automático, «Reintentar» vuelve a pedir al mismo personaje', fakeAsync(() => {
    sendChat.and.returnValues(throwError(() => ({ status: 503, error: { message: 'Sin respuesta' } })), of(reply('r1', 'a')));
    component.startAuto();
    expect(component.canRetry).toBeTrue();
    expect(component.error).toBe('Sin respuesta');
    component.retry();
    expect(sendChat.calls.argsFor(1)[2].speakerId).toBe('a');
    component.stop();
    flush();
  }));

  it('si falla el turno con el texto del lector, el texto vuelve al campo y la ronda se cancela', fakeAsync(() => {
    sendChat.and.returnValue(throwError(() => ({ status: 503, error: {} })));
    component.send('Hola');
    expect(component.draft).toBe('Hola');
    expect(component.lines.length).toBe(0);
    expect(component.working).toBeFalse();
    flush();
  }));
});
