import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { TavernMusicComponent } from './tavern-music.component';
import { YoutubePlayer, YoutubePlayerEvents, YoutubePlayerService } from '../../core/services/youtube-player.service';

describe('TavernMusicComponent', () => {
  let fixture: ComponentFixture<TavernMusicComponent>;
  let player: jasmine.SpyObj<YoutubePlayer>;
  let service: jasmine.SpyObj<YoutubePlayerService>;
  let events: YoutubePlayerEvents;
  let visibility: IntersectionObserverCallback;
  let originalObserver: typeof IntersectionObserver;
  let disconnect: jasmine.Spy;
  let hidden: jasmine.Spy;
  let priorPreference: string | null;

  beforeEach(() => {
    priorPreference = localStorage.getItem('literatus_tavern_music');
    localStorage.removeItem('literatus_tavern_music');
    hidden = spyOnProperty(document, 'hidden', 'get').and.returnValue(false);
    originalObserver = window.IntersectionObserver;
    disconnect = jasmine.createSpy('disconnect');
    window.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) { visibility = callback; }
      observe(): void {}
      disconnect = disconnect;
    } as unknown as typeof IntersectionObserver;
    player = jasmine.createSpyObj('YoutubePlayer', ['playVideo', 'pauseVideo', 'setVolume', 'unMute', 'destroy']);
    service = jasmine.createSpyObj('YoutubePlayerService', ['create']);
    service.create.and.callFake((_frame, callbacks) => { events = callbacks; return Promise.resolve(player); });
    TestBed.configureTestingModule({
      imports: [TavernMusicComponent],
      providers: [{ provide: YoutubePlayerService, useValue: service }],
    });
  });

  afterEach(() => {
    fixture?.destroy();
    window.IntersectionObserver = originalObserver;
    if (priorPreference === null) localStorage.removeItem('literatus_tavern_music');
    else localStorage.setItem('literatus_tavern_music', priorPreference);
  });

  function create(): void {
    fixture = TestBed.createComponent(TavernMusicComponent);
    fixture.detectChanges();
    flushMicrotasks();
  }

  function visible(ratio = 1): void {
    visibility([{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver);
  }

  function ready(): void { events.onReady({ target: player }); }

  it('inicia la canción al entrar, con volumen suave, solo cuando el vídeo es visible', fakeAsync(() => {
    create();
    ready();
    expect(player.setVolume).toHaveBeenCalledWith(25);
    expect(player.playVideo).not.toHaveBeenCalled();
    visible(0.5);
    expect(player.playVideo).not.toHaveBeenCalled();
    visible(0.8);
    expect(player.playVideo).toHaveBeenCalledTimes(1);
    events.onStateChange({ data: 1 });
    fixture.detectChanges();
    expect(fixture.componentInstance.status).toBe('Sonando en la taberna');
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.src).toContain('/embed/UwR9WWqzjoE');
    expect(frame.src).toContain('loop=1&playlist=UwR9WWqzjoE');
    expect(frame.allow).toContain('autoplay');
    expect(frame.referrerPolicy).toBe('strict-origin-when-cross-origin');
  }));

  it('permite reproducir con un clic si el navegador bloquea el inicio automático', fakeAsync(() => {
    create(); visible(); ready();
    events.onAutoplayBlocked();
    fixture.detectChanges();
    expect(fixture.componentInstance.status).toContain('Pulsa Reproducir');
    expect(localStorage.getItem('literatus_tavern_music')).toBeNull();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '30'; input.dispatchEvent(new Event('input'));
    expect(JSON.parse(localStorage.getItem('literatus_tavern_music')!).enabled).toBeTrue();
    player.playVideo.calls.reset();
    (fixture.nativeElement.querySelector('.tm-play') as HTMLButtonElement).click();
    expect(player.unMute).toHaveBeenCalled();
    expect(player.playVideo).toHaveBeenCalledTimes(1);
    events.onStateChange({ data: 1 });
    expect(fixture.componentInstance.playing).toBeTrue();
  }));

  it('recuerda la pausa manual y no reanuda al volver a mostrar el panel', fakeAsync(() => {
    create(); visible(); ready(); events.onStateChange({ data: 1 });
    fixture.componentInstance.togglePlayback();
    expect(JSON.parse(localStorage.getItem('literatus_tavern_music')!).enabled).toBeFalse();
    player.playVideo.calls.reset();
    visible(0); visible();
    expect(player.playVideo).not.toHaveBeenCalled();
  }));

  it('respeta una pausa desde los controles de YouTube al volver a entrar', fakeAsync(() => {
    create(); visible(); ready(); events.onStateChange({ data: 1 });
    events.onStateChange({ data: 2 });
    expect(JSON.parse(localStorage.getItem('literatus_tavern_music')!).enabled).toBeFalse();
    fixture.destroy();
    player.playVideo.calls.reset();
    create(); visible(); ready();
    expect(player.playVideo).not.toHaveBeenCalled();
  }));

  it('pausa al ocultar la pestaña o el Bazar y reanuda sin perder la preferencia', fakeAsync(() => {
    create(); visible(); ready(); events.onStateChange({ data: 1 });
    player.playVideo.calls.reset();
    hidden.and.returnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(player.pauseVideo).toHaveBeenCalled();
    events.onStateChange({ data: 2 });
    hidden.and.returnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(player.playVideo).toHaveBeenCalledTimes(1);
    events.onStateChange({ data: 1 });
    fixture.componentRef.setInput('suspended', true); fixture.detectChanges();
    events.onStateChange({ data: 2 });
    expect(fixture.componentInstance.playing).toBeFalse();
    fixture.componentRef.setInput('suspended', false); fixture.detectChanges();
    expect(player.playVideo).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem('literatus_tavern_music')!).enabled).toBeTrue();
  }));

  it('guarda el volumen y restaura valores válidos sin forzar una reproducción pausada', fakeAsync(() => {
    localStorage.setItem('literatus_tavern_music', JSON.stringify({ volume: 40, enabled: false }));
    create(); visible(); ready();
    expect(player.setVolume).toHaveBeenCalledWith(40);
    expect(player.playVideo).not.toHaveBeenCalled();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '12'; input.dispatchEvent(new Event('input'));
    expect(player.setVolume).toHaveBeenCalledWith(12);
    expect(JSON.parse(localStorage.getItem('literatus_tavern_music')!)).toEqual({ volume: 12, enabled: false });
  }));

  it('pausa al desplazar el reproductor fuera de vista y reanuda cuando vuelve', fakeAsync(() => {
    create(); visible(); ready(); events.onStateChange({ data: 1 });
    player.playVideo.calls.reset();
    visible(0.2);
    expect(player.pauseVideo).toHaveBeenCalled();
    events.onStateChange({ data: 2 });
    expect(fixture.componentInstance.playing).toBeFalse();
    visible(0.8);
    expect(player.playVideo).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('literatus_tavern_music')!).enabled).toBeTrue();
  }));

  it('muestra una alternativa si la API no puede cargar', fakeAsync(() => {
    service.create.and.returnValue(Promise.reject(new Error('Sin conexión')));
    create(); fixture.detectChanges();
    expect(fixture.componentInstance.status).toContain('Abre la canción en YouTube');
    expect(fixture.nativeElement.querySelector('.tm-play').disabled).toBeTrue();
  }));

  it('ofrece el enlace original cuando YouTube impide insertar el vídeo', fakeAsync(() => {
    create(); visible(); ready();
    events.onError({ data: 101 }); fixture.detectChanges();
    expect(fixture.componentInstance.status).toContain('no está disponible aquí');
    expect(fixture.nativeElement.querySelector('.tm-play').disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('a').href).toBe('https://www.youtube.com/watch?v=UwR9WWqzjoE');
    events.onStateChange({ data: 1 });
    expect(fixture.componentInstance.playing).toBeFalse();
  }));

  it('informa de una conexión que no termina de cargar', fakeAsync(() => {
    create();
    tick(20000); fixture.detectChanges();
    expect(fixture.componentInstance.status).toContain('No pudimos conectar');
    expect(fixture.nativeElement.querySelector('.tm-play').disabled).toBeTrue();
  }));

  it('destruye el reproductor al salir, incluso si la API llega tarde', fakeAsync(() => {
    let resolve!: (player: YoutubePlayer) => void;
    service.create.and.returnValue(new Promise<YoutubePlayer>(done => { resolve = done; }));
    create();
    fixture.destroy();
    expect(disconnect).toHaveBeenCalled();
    resolve(player); flushMicrotasks();
    expect(player.destroy).toHaveBeenCalledTimes(1);
    player.playVideo.calls.reset();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(player.playVideo).not.toHaveBeenCalled();
  }));
});
