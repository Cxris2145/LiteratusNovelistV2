import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

/** Un personaje del encuentro (el primero es `avatar` en el backend; el segundo, `partner`). */
export interface EncounterParticipant {
  id: string;
  name: string;
  book_title: string;
  book_slug: string;
  avatar_image_url: string | null;
  is_author: boolean;
}

export interface EncounterLine {
  id: string;
  role: 'user' | 'assistant';
  /** Qué personaje habló; null en los mensajes del lector. */
  speaker_id: string | null;
  content: string;
  created_at: string;
}

export interface Encounter {
  id: string;
  title: string;
  topic: string;
  participants: [EncounterParticipant, EncounterParticipant];
  messages: EncounterLine[];
  created_at: string;
}

/**
 * Encuentro de personajes: el lector conversa con dos personajes a la vez. Cada turno se envía
 * con SubscriptionService.sendChat(encuentro.id, texto, { speakerId }) y se cobra como el chat.
 */
@Injectable({ providedIn: 'root' })
export class EncounterService {
  private readonly api = inject(ApiService);

  /** Crea el encuentro o retoma el último con esos dos personajes (`fresh` empieza uno nuevo). */
  create(avatarIds: [string, string], topic = '', fresh = false): Observable<Encounter> {
    return this.api.post<Encounter>('ai/encounters/', { avatar_ids: avatarIds, topic, fresh });
  }

  get(id: string): Observable<Encounter> {
    return this.api.get<Encounter>(`ai/encounters/${id}/`);
  }

  setTopic(id: string, topic: string): Observable<Encounter> {
    return this.api.patch<Encounter>(`ai/encounters/${id}/`, { topic });
  }
}
