// src/app/core/services/reading-session.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GamificationService } from './gamification.service';

export interface ReadingSession {
  id: string;
  book_title: string;
  started_at: string;
  ended_at: string | null;
  chapters_read: number;
}

@Injectable({ providedIn: 'root' })
export class ReadingSessionService {
  private readonly apiUrl = environment.apiUrl;
  private currentSessionId: string | null = null;

  constructor(
    private http: HttpClient,
    private gamificationService: GamificationService
  ) {}

  /**
   * Abre una sesión de lectura para el libro dado.
   * Llama al backend y guarda el id de la sesión para poder cerrarla.
   */
  startSession(bookId: string): Observable<ReadingSession> {
    const session$ = this.http.post<ReadingSession>(
      `${this.apiUrl}library/sessions/`,
      {
        book_id: bookId,
        started_at: new Date().toISOString(),
      }
    );

    session$.subscribe({
      next: (session) => {
        this.currentSessionId = session.id;
      },
      error: () => {
        // Si falla, no bloqueamos la lectura
        this.currentSessionId = null;
      },
    });

    return session$;
  }

  /**
   * Cierra la sesión actual enviando ended_at.
   * Se llama al salir del lector (ngOnDestroy o beforeunload).
   */
  endSession(chaptersRead = 0): void {
    if (!this.currentSessionId) return;

    const sessionId = this.currentSessionId;
    this.currentSessionId = null;

    this.http
      .patch(`${this.apiUrl}library/sessions/${sessionId}/`, {
        ended_at: new Date().toISOString(),
        chapters_read: chaptersRead,
      })
      .subscribe({ 
        next: () => {
          // Chequear recompensas de gamificación
          this.gamificationService.checkRewards();
        },
        error: () => {} 
      }); // silencioso: la sesión queda abierta si falla
  }

  get hasActiveSession(): boolean {
    return this.currentSessionId !== null;
  }
}
