import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { TavernMusicComponent } from './tavern-music.component';
import { userStorageKey } from '../../core/services/auth.service';
import { YoutubePlayer, YoutubePlayerEvents, YoutubePlayerService } from '../../core/services/youtube-player.service';

const LEGACY_KEY = 'literatus_tavern_music';

describe('TavernMusicComponent', () => {
  let fixture: ComponentFixture<TavernMusicComponent>;
  let player: jasmine.SpyObj<YoutubePlayer>;
  let service: jasmine.SpyObj<YoutubePlayerService>;
  let events: YoutubePlayerEvents;
  let hidden: jasmine.Spy;
  let ownKey: string;
  let saved: Record<string, string | null>;

  beforeEach(() => {
    ownKey = userStorageKey(LEGACY_KEY);
    saved = { [ownKey]: localStorage.getItem(ownKey), [LEGACY_KEY]: localStorage.getItem(LEGACY_KEY) };
    localStorage.removeItem(ownKey);
    localStorage.removeItem(LEGACY_KEY);
    hidden = spyOnProperty(document, 'hidden', 'get').and.returnValue(false);
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
    for (const [key, value] of Object.entries(saved)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  });

  function create(): TavernMusicComponent {
    fixture = TestBed.createComponent(TavernMusicComponent);
    fixture.detectChanges();
    flushMicrotasks();
    return fixture.componentInstance;
  }

  function ready(): void { events.onReady({ target: player }); }
  function prefs(): { volume: number; muted: boolean } { return JSON.parse(localStorage.getItem(ownKey) ?? 'null'); }

  it('suena por defecto al entrar, con volumen suave', fakeAsync(() => {
    const music = create();
    ready();

    expect(service.create).toHaveBeenCalledTimes(1);
    expect(player.setVolume).toHaveBeenCalledWith(25);
    expect(player.unMute).toHaveBeenCalled();
    expect(player.playVideo).toHaveBeenCalled();
    events.onStateChange({ data: 1 });
    expect(music.state).toBe('playing');
    expect(music.icon).toBe('volume_down');
  }));

  it('silenciar se recuerda por cuenta y la próxima visita ni siquiera carga YouTube', fakeAsync(() => {
    const music = create();
    ready();
    events.onStateChange({ data: 1 });

    music.toggleMute();
    expect(player.pauseVideo).toHaveBeenCalled();
    expect(prefs()).toEqual({ volume: 25, muted: true });
    expect(music.icon).toBe('volume_off');

    fixture.destroy();
    service.create.calls.reset();
    const again = create();
    expect(again.muted).toBeTrue();
    expect(service.create).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  }));

  it('activar la música silenciada carga el reproductor y la hace sonar', fakeAsync(() => {
    localStorage.setItem(ownKey, JSON.stringify({ volume: 60, muted: true }));
    const music = create();

    music.toggleMute();
    flushMicrotasks();
    ready();

    expect(service.create).toHaveBeenCalledTimes(1);
    expect(player.setVolume).toHaveBeenCalledWith(60);
    expect(player.playVideo).toHaveBeenCalled();
    expect(prefs()).toEqual({ volume: 60, muted: false });
  }));

  it('si el navegador bloquea el sonido, el primer clic en la página la inicia', fakeAsync(() => {
    const music = create();
    ready();
    player.playVideo.calls.reset();
    events.onAutoplayBlocked();
    expect(music.state).toBe('blocked');
    expect(music.actionLabel).toBe('Toca para escuchar la música');
    expect(localStorage.getItem(ownKey)).toBeNull(); // un bloqueo no es silenciar

    document.body.dispatchEvent(new Event('pointerup', { bubbles: true }));

    expect(player.playVideo).toHaveBeenCalledTimes(1);
    events.onStateChange({ data: 1 });
    expect(music.state).toBe('playing');
  }));

  it('con la música bloqueada, el ícono la inicia en vez de silenciarla', fakeAsync(() => {
    const music = create();
    ready();
    events.onAutoplayBlocked();
    player.playVideo.calls.reset();

    music.toggleMute();

    expect(music.muted).toBeFalse();
    expect(player.playVideo).toHaveBeenCalledTimes(1);
  }));

  it('guarda el volumen y subirlo desmutea', fakeAsync(() => {
    localStorage.setItem(ownKey, JSON.stringify({ volume: 25, muted: true }));
    const music = create();

    music.onVolumeInput({ target: { value: '70' } } as unknown as Event);
    flushMicrotasks();
    ready();

    expect(music.muted).toBeFalse();
    expect(prefs()).toEqual({ volume: 70, muted: false });
    expect(player.setVolume).toHaveBeenCalledWith(70);
    expect(music.icon).toBe('volume_up');
  }));

  it('rescata solo el volumen de la preferencia vieja compartida', fakeAsync(() => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ volume: 40, enabled: false }));

    const music = create();

    expect(music.volume).toBe(40);
    expect(music.muted).toBeFalse();
    expect(service.create).toHaveBeenCalled();
    fixture.destroy(); // cancela la espera de YouTube
  }));

  it('se pausa con la pestaña oculta y vuelve a sonar al volver', fakeAsync(() => {
    create();
    ready();
    events.onStateChange({ data: 1 });
    player.playVideo.calls.reset();

    hidden.and.returnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(player.pauseVideo).toHaveBeenCalled();

    hidden.and.returnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(player.playVideo).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ownKey)).toBeNull();
  }));

  it('si YouTube falla lo avisa y el ícono permite reintentar', fakeAsync(() => {
    const music = create();
    events.onError({ data: 150 });
    expect(music.icon).toBe('music_off');
    expect(music.status).toContain('no está disponible');

    music.toggleMute();
    flushMicrotasks();

    expect(service.create).toHaveBeenCalledTimes(2);
    expect(music.error).toBe('');
    fixture.destroy();
  }));

  it('al salir de la taberna destruye el reproductor', fakeAsync(() => {
    create();
    ready();

    fixture.destroy();

    expect(player.destroy).toHaveBeenCalled();
  }));
});
