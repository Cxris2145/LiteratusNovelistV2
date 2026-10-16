import { CommonModule } from '@angular/common';
import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild, inject,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { userStorageKey } from '../../core/services/auth.service';
import { YoutubePlayer, YoutubePlayerEvents, YoutubePlayerService } from '../../core/services/youtube-player.service';

const VIDEO_ID = 'UwR9WWqzjoE';
/** Antes la preferencia era una sola para todas las cuentas del navegador: solo se rescata el volumen. */
const LEGACY_KEY = 'literatus_tavern_music';
const DEFAULT_VOLUME = 25;
const READY_TIMEOUT_MS = 20000;
type MusicState = 'idle' | 'loading' | 'playing' | 'buffering' | 'paused' | 'blocked' | 'error';
interface MusicPrefs { volume: number; muted: boolean; }

/**
 * El único control de sonido de La Taberna: un ícono que silencia o activa la canción
 * (YouTube, en un reproductor invisible) y un deslizador de volumen.
 *
 * - Suena por defecto al entrar. Silenciarla se recuerda por cuenta hasta que se active de nuevo;
 *   mientras está silenciada ni siquiera se carga YouTube.
 * - Si el navegador bloquea el sonido automático, el primer clic o tecla en la página la inicia.
 * - En escritorio el volumen sale al pasar el mouse o con el foco; en pantallas táctiles,
 *   tocar el ícono abre una ventanita con el botón y el volumen.
 */
@Component({
  selector: 'app-tavern-music',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tavern-music.component.html',
  styleUrls: ['../community-shared.css', './tavern-music.component.css'],
})
export class TavernMusicComponent implements AfterViewInit, OnDestroy {
  private readonly youtube = inject(YoutubePlayerService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);
  @ViewChild('frame') private frame?: ElementRef<HTMLIFrameElement>;

  readonly embedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
    `https://www.youtube.com/embed/${VIDEO_ID}?enablejsapi=1&autoplay=0&controls=0&playsinline=1&loop=1&playlist=${VIDEO_ID}&origin=${encodeURIComponent(window.location.origin)}`,
  );
  readonly storageKey = userStorageKey(LEGACY_KEY);
  readonly canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

  volume = DEFAULT_VOLUME;
  muted = false;
  state: MusicState = 'idle';
  error = '';
  /** El iframe solo existe cuando hace falta la música. */
  frameRequested = false;
  popoverOpen = false;
  /** La ventanita táctil se ubica junto al ícono, sin salirse de la pantalla. */
  popoverPos: { top: number; left: number } | null = null;

  private player: YoutubePlayer | null = null;
  private ready = false;
  private destroyed = false;
  private pausedByHiddenTab = false;
  private gestureArmed = false;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const prefs = this.readPrefs();
    this.volume = prefs.volume;
    this.muted = prefs.muted;
  }

  get audible(): boolean { return !this.muted && this.volume > 0; }

  get icon(): string {
    if (this.error) return 'music_off';
    if (!this.audible) return 'volume_off';
    return this.volume < 50 ? 'volume_down' : 'volume_up';
  }

  /** Lo que hará el botón: también es la etiqueta que aparece al pasar el mouse. */
  get actionLabel(): string {
    if (this.error) return 'Reintentar la música';
    if (this.state === 'blocked' && !this.muted) return 'Toca para escuchar la música';
    return this.muted ? 'Activar la música' : 'Silenciar la música';
  }

  get status(): string {
    if (this.error) return this.error;
    if (this.muted) return 'Música silenciada';
    if (this.state === 'blocked') return 'Toca cualquier parte de la taberna para escuchar la música.';
    if (this.state === 'loading' || this.state === 'buffering') return 'Cargando la música…';
    if (this.state === 'playing') return 'Sonando la música de la taberna';
    return '';
  }

  ngAfterViewInit(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    if (!this.muted) this.load();
  }

  /** Clic en el ícono. En pantallas táctiles abre la ventanita (y, si estaba bloqueada, empieza a sonar). */
  onIconClick(): void {
    if (!this.canHover) {
      this.popoverOpen = !this.popoverOpen;
      if (this.popoverOpen) this.placePopover();
      if (this.state === 'blocked' && !this.muted) this.play();
      return;
    }
    this.toggleMute();
  }

  toggleMute(): void {
    if (this.error) { this.retry(); return; }
    if (this.state === 'blocked' && !this.muted) { this.play(); return; }
    this.setMuted(!this.muted);
  }

  onVolumeInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(100, Math.round(value)));
    this.player?.setVolume(this.volume);
    // Subir el volumen de una canción silenciada es pedir que suene, como en YouTube.
    if (this.muted && this.volume > 0) this.setMuted(false);
    else this.savePrefs();
  }

  @HostListener('document:keydown.escape')
  @HostListener('window:scroll')
  @HostListener('window:resize')
  closePopover(): void { if (this.popoverOpen) this.popoverOpen = false; }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointer(event: PointerEvent): void {
    if (this.popoverOpen && !this.host.nativeElement.contains(event.target as Node)) this.popoverOpen = false;
  }

  private placePopover(): void {
    const icon = this.host.nativeElement.querySelector('.tm-toggle')?.getBoundingClientRect();
    if (!icon) return;
    const width = Math.min(250, window.innerWidth - 32);
    const left = icon.left + icon.width / 2 - width / 2;
    this.popoverPos = {
      top: Math.round(icon.bottom + 10),
      left: Math.round(Math.max(16, Math.min(left, window.innerWidth - 16 - width))),
    };
  }

  private setMuted(muted: boolean): void {
    this.muted = muted;
    this.savePrefs();
    if (muted) {
      this.disarmGesture();
      this.player?.pauseVideo();
      if (this.state !== 'idle' && this.state !== 'loading') this.state = 'paused';
      return;
    }
    if (!this.player) this.load();
    else this.play();
  }

  private load(): void {
    if (this.frameRequested || this.destroyed) return;
    this.frameRequested = true;
    this.state = 'loading';
    this.error = '';
    this.cdr.detectChanges(); // el iframe tiene que estar en el DOM antes de crear el reproductor
    const frame = this.frame?.nativeElement;
    if (!frame) return;

    this.zone.runOutsideAngular(() => {
      this.readyTimer = setTimeout(() => this.zone.run(() => this.fail('No pudimos conectar con YouTube.')), READY_TIMEOUT_MS);
      const events: YoutubePlayerEvents = {
        onReady: event => this.zone.run(() => {
          if (this.destroyed) return;
          this.clearReadyTimer();
          this.player = event.target;
          this.ready = true;
          this.player.setVolume(this.volume);
          if (this.muted) this.state = 'paused';
          else if (document.hidden) { this.pausedByHiddenTab = true; this.state = 'paused'; }
          else this.play();
        }),
        onStateChange: event => this.zone.run(() => this.onPlayerState(event.data)),
        onAutoplayBlocked: () => this.zone.run(() => {
          if (this.destroyed || this.error || this.muted) return;
          this.state = 'blocked';
          this.armGesture();
        }),
        onError: event => this.zone.run(() => this.fail(
          [100, 101, 150].includes(event.data)
            ? 'Esta canción no está disponible aquí.'
            : 'No pudimos reproducir la canción.',
        )),
      };
      void this.youtube.create(frame, events).then(player => {
        if (this.destroyed) player.destroy();
        else this.player = player;
      }).catch(() => this.zone.run(() => this.fail('No pudimos conectar con YouTube.')));
    });
  }

  private play(): void {
    if (!this.player || !this.ready || this.destroyed || this.error || this.muted) return;
    this.pausedByHiddenTab = false;
    this.player.unMute();
    this.player.setVolume(this.volume);
    this.player.playVideo();
  }

  private onPlayerState(state: number): void {
    if (this.destroyed || this.error) return;
    if (state === 1 || state === 3) {
      if (this.muted || document.hidden) { this.player?.pauseVideo(); return; }
      this.disarmGesture();
      this.state = state === 1 ? 'playing' : 'buffering';
    } else if (state === 2) {
      if (this.state !== 'blocked') this.state = 'paused';
    } else if (state === 0 && !this.muted) {
      this.player?.playVideo(); // por si el parámetro loop no alcanza a repetirla
    }
  }

  /** El navegador bloqueó el sonido: el primer gesto en cualquier parte de la página la inicia. */
  private armGesture(): void {
    if (this.gestureArmed) return;
    this.gestureArmed = true;
    document.addEventListener('pointerup', this.onFirstGesture, true);
    document.addEventListener('keydown', this.onFirstGesture, true);
  }

  private disarmGesture(): void {
    if (!this.gestureArmed) return;
    this.gestureArmed = false;
    document.removeEventListener('pointerup', this.onFirstGesture, true);
    document.removeEventListener('keydown', this.onFirstGesture, true);
  }

  private readonly onFirstGesture = (event: Event): void => {
    // El propio ícono ya decide qué hacer con su clic.
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.zone.run(() => {
      this.disarmGesture();
      if (this.state === 'blocked') this.play();
    });
  };

  private readonly onVisibility = (): void => this.zone.run(() => {
    if (!this.player || !this.ready || this.muted || this.error) return;
    if (document.hidden) {
      if (this.state === 'playing' || this.state === 'buffering') {
        this.pausedByHiddenTab = true;
        this.player.pauseVideo();
      }
    } else if (this.pausedByHiddenTab) {
      this.play();
    }
  });

  private retry(): void {
    this.player?.destroy();
    this.player = null;
    this.ready = false;
    this.error = '';
    this.frameRequested = false;
    this.cdr.detectChanges();
    if (this.muted) this.setMuted(false);
    else this.load();
  }

  private fail(message: string): void {
    if (this.destroyed) return;
    this.clearReadyTimer();
    this.disarmGesture();
    this.error = message;
    this.state = 'error';
    this.player?.pauseVideo();
  }

  private readPrefs(): MusicPrefs {
    const prefs: MusicPrefs = { volume: DEFAULT_VOLUME, muted: false };
    try {
      const own = this.parse(localStorage.getItem(this.storageKey));
      const legacy = own ? null : this.parse(localStorage.getItem(LEGACY_KEY));
      const source = own ?? legacy;
      if (typeof source?.['volume'] === 'number' && Number.isFinite(source['volume'])) {
        prefs.volume = Math.max(0, Math.min(100, Math.round(source['volume'])));
      }
      if (own && typeof own['muted'] === 'boolean') prefs.muted = own['muted'];
    } catch { /* La música también funciona sin almacenamiento local. */ }
    return prefs;
  }

  private parse(raw: string | null): Record<string, unknown> | null {
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  }

  private savePrefs(): void {
    try { localStorage.setItem(this.storageKey, JSON.stringify({ volume: this.volume, muted: this.muted })); }
    catch { /* Almacenamiento restringido. */ }
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearReadyTimer();
    this.disarmGesture();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.player?.destroy();
    this.player = null;
  }
}
