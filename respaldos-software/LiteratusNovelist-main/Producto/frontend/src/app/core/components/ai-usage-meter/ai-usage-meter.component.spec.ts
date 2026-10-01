import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { AIUsageMeterComponent } from './ai-usage-meter.component';
import { SubscriptionService } from '../../services/subscription.service';

describe('Reloj del chat', () => {
  let heartbeat: jasmine.Spy;
  beforeEach(() => {
    heartbeat = jasmine.createSpy('heartbeat').and.returnValue(of(null));
    TestBed.configureTestingModule({ imports: [AIUsageMeterComponent, RouterTestingModule],
      providers: [{ provide: SubscriptionService, useValue: { usage$: of(null), usage: () => of(null), heartbeat } }] });
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'hidden', 'get').and.returnValue(false);
  });
  it('detiene el reloj a los dos minutos sin interacción', fakeAsync(() => {
    const fixture = TestBed.createComponent(AIUsageMeterComponent);
    fixture.componentInstance.sessionId = 'session'; fixture.detectChanges();
    tick(120000);
    expect(heartbeat.calls.mostRecent().args[2]).toBeFalse();
    fixture.destroy();
  }));
  it('pausa al perder el foco y al cerrar el chat', () => {
    const fixture = TestBed.createComponent(AIUsageMeterComponent);
    fixture.componentInstance.sessionId = 'session'; fixture.detectChanges();
    fixture.componentInstance.blur();
    expect(heartbeat.calls.mostRecent().args[2]).toBeFalse();
    fixture.destroy();
    expect(heartbeat.calls.mostRecent().args[2]).toBeFalse();
  });
});
