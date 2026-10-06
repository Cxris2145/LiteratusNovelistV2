import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { YoutubePlayer, YoutubePlayerEvents, YoutubePlayerService } from '../../core/services/youtube-player.service';

const VIDEO_ID = 'UwR9WWqzjoE';
const STORAGE_KEY = 'literatus_tavern_music';
type MusicState = 'loading' | 'ready' | 'playing' | 'buffering' | 'paused' | 'blocked' | 'error';

@Component({
  selector: 'app-tavern-music',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tavern-music.component.html',
  styleUrls: ['./tavern-music.component.css'],
})
export class TavernMusicComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly youtube = inject(YoutubePlayerService);
  private readonly zone = inject(NgZone);
  private readonly sanitizer = inject(DomSanitizer);
  @ViewChild('frame', { static: true }) private frame!: ElementRef<HTMLIFrameElement>;
  /** El Bazar y el modo cine ocultan este panel: no debe seguir sonando oculto. */
  @Input() suspended = false;

  readonly songUrl = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
  readonly embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
    `https://www.youtube.com/embed/${VIDEO_ID}?enablejsapi=1&autoplay=0&controls=1&playsinline=1&loop=1&playlist=${VIDEO_ID}&origin=${encodeURIComponent(window.location.origin)}`,
  );
  volume = 25;
  state: MusicState = 'loading';
  ready = false;
  error = '';
  private player: YoutubePlayer | null = null;
  private observer: IntersectionObserver | null = null;
  private visible = false;
  private wantsPlayback = true;
  private playbackEnabled = true;
  private automaticallyPaused = false;
  private destroyed = false;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        const prefs = saved as { volume?: unknown; enabled?: unknown };
        if (typeof prefs.volume === 'number' && Number.isFinite(prefs.volume)) this.volume = Math.max(0, Math.min(100, prefs.volume));
        if (typeof prefs.enabled === 'boolean') this.wantsPlayback = this.playbackEnabled = prefs.enabled;
      }
    } catch { /* La música también funciona sin almacenamiento local. */ }
  }

  get playing(): boolean { return this.state === 'playing' || this.state === 'buffering'; }

  get status(): string {
    if (this.error) return this.error;
    if (this.state === 'blocked') return 'Pulsa Reproducir para escuchar la canción.';
    if (this.state === 'loading') return 'Preparando la música…';
    if (this.state === 'playing') return 'Sonando en la taberna';
    if (this.state === 'buffering') return 'Cargando la canción…';
    if (this.automaticallyPaused) return 'En pausa mientras el reproductor está fuera de vista.';
    return 'Música en pausa';
  }

  ngAfterViewInit(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(entries => {
        const entry = entries[0];
        this.zone.run(() => {
          this.visible = entry.isIntersecting && entry.intersectionRatio > 0.5;
          this.syncPlayback();
        });
      }, { threshold: [0, 0.5, 0.51, 1] });
      this.observer.observe(this.frame.nativeElement);
      this.readyTimer = setTimeout(() => this.zone.run(() => this.fail('No pudimos conectar con YouTube. Abre la canción en YouTube.')), 20000);
      const events: YoutubePlayerEvents = {
        onReady: event => this.zone.run(() => {
          if (this.destroyed) return;
          this.clearReadyTimer();
          this.player = event.target;
          this.ready = true;
          this.error = '';
          this.state = 'ready';
          this.player.setVolume(this.volume);
          this.syncPlayback();
        }),
        onStateChange: event => this.zone.run(() => this.onPlayerState(event.data)),
        onAutoplayBlocked: () => this.zone.run(() => {
          if (this.destroyed || this.error) return;
          this.wantsPlayback = false;
          this.automaticallyPaused = false;
          this.state = 'blocked';
        }),
        onError: event => this.zone.run(() => this.fail(
          [100, 101, 150].includes(event.data)
            ? 'Esta canción no está disponible aquí. Puedes abrirla en YouTube.'
            : 'No pudimos reproducir la canción. Puedes abrirla en YouTube.',
        )),
      };
      void this.youtube.create(this.frame.nativeElement, events).then(player => {
        if (this.destroyed) player.destroy();
        else this.player = player;
      }).catch(() => this.zone.run(() => this.fail('No pudimos conectar con YouTube. Abre la canción en YouTube.')));
    });
  }

  ngOnChanges(): void { this.syncPlayback(); }

  togglePlayback(): void {
    if (!this.player || !this.ready || this.error) return;
    if (this.playing) {
      this.wantsPlayback = false;
      this.automaticallyPaused = false;
      this.state = 'paused';
      this.player.pauseVideo();
    } else {
      this.wantsPlayback = true;
      this.automaticallyPaused = false;
      this.player.unMute();
      this.player.setVolume(this.volume);
      this.syncPlayback();
    }
    this.playbackEnabled = this.wantsPlayback;
    this.savePreference();
  }

  setVolume(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(100, value));
    this.player?.setVolume(this.volume);
    if (this.volume > 0) this.player?.unMute();
    this.savePreference();
  }

  private readonly onVisibility = (): void => this.zone.run(() => this.syncPlayback());

  private syncPlayback(): void {
    if (!this.player || !this.ready || this.destroyed || this.error) return;
    if (!this.visible || document.hidden || this.suspended) {
      if (this.wantsPlayback) this.automaticallyPaused = true;
      this.player.pauseVideo();
      this.state = 'paused';
      return;
    }
    if (this.wantsPlayback) {
      this.automaticallyPaused = false;
      if (!this.playing) this.player.playVideo();
    } else if (this.state === 'ready') {
      this.state = 'paused';
    }
  }

  private onPlayerState(state: number): void {
    if (this.destroyed || this.error) return;
    if (state === 1 || state === 3) {
      if (!this.visible || document.hidden || this.suspended) { this.syncPlayback(); return; }
      this.wantsPlayback = true;
      this.playbackEnabled = true;
      this.automaticallyPaused = false;
      this.state = state === 1 ? 'playing' : 'buffering';
      this.savePreference();
    } else if (state === 2) {
      // Una pausa desde los controles nativos también se respeta al volver a entrar.
      if (!this.automaticallyPaused && this.playing) {
        this.wantsPlayback = false;
        this.playbackEnabled = false;
        this.savePreference();
      }
      this.state = 'paused';
    } else if (state === 0) {
      this.state = 'ready'; // El parámetro loop del reproductor repite la canción.
    }
  }

  private fail(message: string): void {
    if (this.destroyed) return;
    this.clearReadyTimer();
    this.error = message;
    this.state = 'error';
    this.player?.pauseVideo();
  }

  private savePreference(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: this.volume, enabled: this.playbackEnabled })); }
    catch { /* Almacenamiento restringido. */ }
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearReadyTimer();
    this.observer?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.player?.destroy();
    this.player = null;
  }
}
