import { Injectable } from '@angular/core';

export interface YoutubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  setVolume(volume: number): void;
  unMute(): void;
  destroy(): void;
}

export interface YoutubePlayerEvents {
  onReady(event: { target: YoutubePlayer }): void;
  onStateChange(event: { data: number }): void;
  onAutoplayBlocked(): void;
  onError(event: { data: number }): void;
}

interface YoutubeApi {
  Player: new (frame: HTMLIFrameElement, options: { events: YoutubePlayerEvents }) => YoutubePlayer;
}

type YoutubeWindow = Window & {
  YT?: YoutubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

/** Carga la API oficial una sola vez; no descarga ni extrae el audio del vídeo. */
@Injectable({ providedIn: 'root' })
export class YoutubePlayerService {
  private pending: Promise<YoutubeApi> | null = null;

  async create(frame: HTMLIFrameElement, events: YoutubePlayerEvents): Promise<YoutubePlayer> {
    const api = await this.load();
    // La ruta puede haberse cerrado mientras llegaba la API.
    if (!frame.isConnected) throw new Error('Player detached');
    return new api.Player(frame, { events });
  }

  private load(): Promise<YoutubeApi> {
    const youtubeWindow = window as YoutubeWindow;
    if (youtubeWindow.YT?.Player) return Promise.resolve(youtubeWindow.YT);
    if (this.pending) return this.pending;

    this.pending = new Promise<YoutubeApi>((resolve, reject) => {
      const previousReady = youtubeWindow.onYouTubeIframeAPIReady;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      const cleanup = (): void => {
        clearTimeout(timeout);
        script.onerror = null;
        if (youtubeWindow.onYouTubeIframeAPIReady === ready) {
          youtubeWindow.onYouTubeIframeAPIReady = previousReady;
        }
      };
      const fail = (): void => {
        cleanup();
        script.remove();
        reject(new Error('YouTube API unavailable'));
      };
      const ready = (): void => {
        cleanup();
        try { previousReady?.(); } finally {
          if (youtubeWindow.YT?.Player) resolve(youtubeWindow.YT);
          else reject(new Error('YouTube player unavailable'));
        }
      };
      const timeout = setTimeout(fail, 15000);
      youtubeWindow.onYouTubeIframeAPIReady = ready;
      script.onerror = fail;
      document.head.appendChild(script);
    }).catch(error => {
      this.pending = null;
      throw error;
    });
    return this.pending;
  }
}
