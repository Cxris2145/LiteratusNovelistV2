import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

import { ApiService } from './api.service';
import { MaguitoOutfit } from '../components/maguito/maguito-outfit';

/** Qué relación tengo con otro lector. */
export type Relation = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';
export type RankingScope = 'week' | 'month' | 'all';

/** Lo que ve alguien que todavía no es tu amigo. */
export interface TavernCard {
  full: false;
  friend_code: string;
  username: string;
  outfit: MaguitoOutfit;
  equipped_frame: string;
  equipped_title: string;
  relation: Relation;
  request_id: string | null;
}

export interface ProfileStats {
  books_read: number;
  reviews: number;
  friends: number;
  brindis: number;
}

export interface CommunityProfile {
  full: true;
  friend_code: string;
  username: string;
  tagline: string;
  bio: string;
  outfit: MaguitoOutfit;
  equipped_frame: string;
  equipped_title: string;
  level: number;
  level_name: string;
  xp: number;
  favorite_genres: { name: string; slug: string }[];
  stats: ProfileStats;
  member_since: string;
  relation: Relation;
  request_id: null;
  brindis_given?: boolean;
}

export interface CommunityMe extends CommunityProfile {
  pending_incoming: number;
}

export interface FriendStatus {
  kind: 'tavern' | 'reading' | 'away';
  label: string;
  book_title: string | null;
}

export interface FriendCard {
  friend_code: string;
  username: string;
  outfit: MaguitoOutfit;
  equipped_frame: string;
  equipped_title: string;
  tagline: string;
  level: number;
  level_name: string;
  status: FriendStatus;
  brindis_given: boolean;
}

export interface FriendRequestItem {
  id: string;
  created_at: string;
  user: TavernCard;
}

export interface RankingEntry {
  rank: number;
  username: string;
  friend_code: string;
  outfit: MaguitoOutfit;
  equipped_frame: string;
  equipped_title: string;
  points: number;
  is_me: boolean;
}

export interface Ranking {
  scope: RankingScope;
  period_start: string | null;
  entries: RankingEntry[];
  me: RankingEntry | null;
  participants: number;
}

export interface CommunityResult {
  success: boolean;
  message: string;
  error?: string;
  id?: string;
  state?: 'pending' | 'accepted';
  given?: boolean;
  brindis_count?: number;
}

export interface TavernChatMessage {
  id: string;
  content: string;
  created_at: string;
  is_me: boolean;
  username: string;
  friend_code: string | null;
  outfit: MaguitoOutfit;
  reactions: Record<string, number>;
}

export interface TavernReactionItem {
  id: string;
  reaction: string;
  emoji: string;
  username: string;
  is_me: boolean;
  message_id: string | null;
  created_at: string;
}

export interface TavernActivity {
  messages: TavernChatMessage[];
  reactions: TavernReactionItem[];
  invitations?: { incoming: TavernInvitation[]; outgoing: TavernInvitation[] };
}

export interface TavernInvitation {
  id: string;
  created_at: string;
  expires_at: string;
  user: { friend_code: string; username: string; outfit: MaguitoOutfit };
}

/**
 * La Taberna de Tinta: amigos, solicitudes, brindis, perfiles, ranking y chat social.
 * Son datos de la cuenta: nada pasa por la caché en memoria de ApiService.
 */
@Injectable({ providedIn: 'root' })
export class CommunityService {
  private api = inject(ApiService);
  private base = 'community/';

  /** Avisa que algo cambió (amistad, brindis) para que la sala recargue. */
  readonly changed$ = new Subject<void>();

  me(): Observable<CommunityMe> {
    return this.api.get<CommunityMe>(`${this.base}me/`);
  }

  search(query: string): Observable<{ results: TavernCard[] }> {
    return this.api.get(`${this.base}search/`, new HttpParams().set('q', query));
  }

  friends(): Observable<{ results: FriendCard[] }> {
    return this.api.get(`${this.base}friends/`);
  }

  requests(): Observable<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }> {
    return this.api.get(`${this.base}requests/`);
  }

  sendRequest(target: { friend_code?: string; username?: string }): Observable<CommunityResult> {
    return this.api.post(`${this.base}requests/`, target);
  }

  accept(requestId: string): Observable<CommunityResult> {
    return this.api.post(`${this.base}requests/${requestId}/accept/`, {});
  }

  decline(requestId: string): Observable<CommunityResult> {
    return this.api.post(`${this.base}requests/${requestId}/decline/`, {});
  }

  cancel(requestId: string): Observable<CommunityResult> {
    return this.api.delete(`${this.base}requests/${requestId}/`);
  }

  unfriend(code: string): Observable<CommunityResult> {
    return this.api.delete(`${this.base}friends/${code}/`);
  }

  profile(code: string): Observable<CommunityProfile | TavernCard> {
    return this.api.get(`${this.base}profiles/${encodeURIComponent(code)}/`);
  }

  giveBrindis(code: string): Observable<CommunityResult> {
    return this.api.post(`${this.base}profiles/${code}/brindis/`, {});
  }

  removeBrindis(code: string): Observable<CommunityResult> {
    return this.api.delete(`${this.base}profiles/${code}/brindis/`);
  }

  ranking(scope: RankingScope, limit = 5): Observable<Ranking> {
    return this.api.get(`${this.base}ranking/`, new HttpParams().set('scope', scope).set('limit', limit));
  }

  heartbeat(): Observable<{ pending_incoming: number }> {
    return this.api.post(`${this.base}presence/`, {});
  }

  getMessages(): Observable<{ results: TavernChatMessage[] }> {
    return this.api.get<{ results: TavernChatMessage[] }>(`${this.base}tavern/messages/`);
  }

  sendMessage(content: string): Observable<CommunityResult & { message: TavernChatMessage }> {
    return this.api.post(`${this.base}tavern/messages/`, { content });
  }

  deleteMessage(messageId: string): Observable<CommunityResult> {
    return this.api.delete(`${this.base}tavern/messages/${messageId}/`);
  }

  sendReaction(reaction: string, messageId?: string): Observable<CommunityResult & { reaction: TavernReactionItem }> {
    return this.api.post(`${this.base}tavern/reactions/`, { reaction, message_id: messageId });
  }

  getActivity(): Observable<TavernActivity> {
    return this.api.get<TavernActivity>(`${this.base}tavern/activity/`);
  }

  inviteToTavern(friendCode: string): Observable<CommunityResult> {
    return this.api.post(`${this.base}tavern/invitations/`, { friend_code: friendCode });
  }

  respondToInvitation(id: string, action: 'accept' | 'decline'): Observable<CommunityResult> {
    return this.api.post(`${this.base}tavern/invitations/${id}/respond/`, { action });
  }
}
