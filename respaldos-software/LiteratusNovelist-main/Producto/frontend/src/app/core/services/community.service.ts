import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

import { ApiService } from './api.service';
import { MaguitoOutfit } from '../components/maguito/maguito-outfit';

/** Qué relación tengo con otro lector. */
export type Relation = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';
export type RankingScope = 'week' | 'month' | 'all';

/** Lo que ve alguien que no es tu amigo cuando el perfil es privado (y en búsquedas y sugerencias). */
export interface TavernCard {
  full: false;
  friend_code: string;
  username: string;
  outfit: MaguitoOutfit;
  equipped_frame: string;
  equipped_title: string;
  is_public: boolean;
  relation: Relation;
  request_id: string | null;
}

/** Sugerencia de "Agregar amigo": un lector con perfil público y por qué aparece. */
export interface FriendSuggestion extends TavernCard {
  reason: string;
  mutual_friends: number;
}

export interface ProfileStats {
  /** Libros distintos en Mi Biblioteca. */
  books: number;
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
  is_public: boolean;
  relation: Relation;
  request_id: string | null;
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
  equipped_frame?: string | null;
}

/** Reacción efímera: no se guarda, flota unos segundos en la mesa de tus amigos. */
export interface TavernReactionItem {
  id: string;
  reaction: string;
  emoji: string;
  username: string;
  is_me: boolean;
  created_at: string;
}

/** Mensajes sin leer de las charlas privadas, por código de amigo. */
export interface ChatUnread {
  total: number;
  by_friend: Record<string, number>;
}

export interface TavernActivity {
  messages: TavernChatMessage[];
  reactions: TavernReactionItem[];
  invitations?: { incoming: TavernInvitation[]; outgoing: TavernInvitation[] };
  chat_unread?: ChatUnread;
}

/** Mensaje de una charla privada con un amigo. */
export interface FriendChatMessage {
  id: string;
  content: string;
  created_at: string;
  is_me: boolean;
  read: boolean;
}

export interface ChatThread extends FriendCard {
  last_message: { content: string; created_at: string; is_me: boolean } | null;
  unread: number;
}

export interface TavernInvitation {
  id: string;
  created_at: string;
  expires_at: string;
  user: { friend_code: string; username: string; outfit: MaguitoOutfit };
}

export type ReadingClubMode = 'spoiler_safe' | 'host_paced' | 'free';

export interface ReadingClubMemberInfo {
  friend_code: string;
  username: string;
  outfit: MaguitoOutfit;
  equipped_frame: string;
  current_chapter: number;
  is_host: boolean;
  is_me: boolean;
}

export interface ReadingClubChapterInfo {
  order: number;
  title: string;
  locked: boolean;
  lock_reason: string | null;
  message_count: number;
  readers_here: ReadingClubMemberInfo[];
}

export interface ReadingClubSummary {
  id: string;
  name: string;
  mode: ReadingClubMode;
  unlocked_until_chapter: number;
  allow_member_invites: boolean;
  is_host: boolean;
  my_chapter: number;
  inventory_id: string | null;
  book: {
    id: string;
    title: string;
    slug: string;
    cover_image: string | null;
    chapters_count: number;
  };
  members: ReadingClubMemberInfo[];
  chapters?: ReadingClubChapterInfo[];
  last_message: {
    username: string;
    chapter_order: number;
    content: string;
    created_at: string;
  } | null;
  updated_at: string;
}

export interface ClubBookOption {
  id: string;
  title: string;
  slug: string;
  chapters_count: number;
  in_library: boolean;
}

export interface ReadingClubMessageItem {
  id: string;
  chapter_order: number;
  content: string;
  is_spoiler: boolean;
  created_at: string;
  is_me: boolean;
  username: string;
  friend_code: string;
  outfit: MaguitoOutfit;
  equipped_frame: string;
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

  /** Perfil público (cualquiera ve tu tarjeta y apareces en sugerencias) o privado (solo tus amigos). */
  setProfileVisibility(isPublic: boolean): Observable<{ is_public: boolean }> {
    return this.api.patch('users/profile/', { is_public: isPublic });
  }

  search(query: string): Observable<{ results: TavernCard[] }> {
    return this.api.get(`${this.base}search/`, new HttpParams().set('q', query));
  }

  suggestions(): Observable<{ results: FriendSuggestion[] }> {
    return this.api.get(`${this.base}suggestions/`);
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

  /** Mensajes de la mesa, del más nuevo al más viejo (hasta 50). */
  getMessages(limit = 30): Observable<{ results: TavernChatMessage[] }> {
    return this.api.get<{ results: TavernChatMessage[] }>(`${this.base}tavern/messages/`, new HttpParams().set('limit', limit));
  }

  sendMessage(content: string): Observable<CommunityResult & { message: TavernChatMessage }> {
    return this.api.post(`${this.base}tavern/messages/`, { content });
  }

  deleteMessage(messageId: string): Observable<CommunityResult> {
    return this.api.delete(`${this.base}tavern/messages/${messageId}/`);
  }

  sendReaction(reaction: string): Observable<CommunityResult & { reaction: TavernReactionItem }> {
    return this.api.post(`${this.base}tavern/reactions/`, { reaction });
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

  // ── Charlas privadas ──

  chatThreads(): Observable<{ threads: ChatThread[]; unread_total: number }> {
    return this.api.get(`${this.base}chats/`);
  }

  /** Con `after` (id de un mensaje) trae solo los posteriores. Marca como leídos los recibidos. */
  chatMessages(code: string, after?: string): Observable<{ messages: FriendChatMessage[]; incremental: boolean }> {
    const params = after ? new HttpParams().set('after', after) : undefined;
    return this.api.get(`${this.base}chats/${encodeURIComponent(code)}/`, params);
  }

  sendChatMessage(code: string, content: string): Observable<CommunityResult & { item: FriendChatMessage }> {
    return this.api.post(`${this.base}chats/${encodeURIComponent(code)}/`, { content });
  }

  // ── Círculos de lectura grupal por capítulos ──

  readingClubs(): Observable<{ results: ReadingClubSummary[] }> {
    return this.api.get(`${this.base}clubs/`);
  }

  clubBooks(): Observable<{ results: ClubBookOption[] }> {
    return this.api.get(`${this.base}clubs/books/`);
  }

  createReadingClub(payload: {
    name?: string;
    book_id: string;
    mode: ReadingClubMode;
    unlocked_until_chapter?: number;
    allow_member_invites?: boolean;
    friend_codes?: string[];
  }): Observable<CommunityResult & { club: ReadingClubSummary }> {
    return this.api.post(`${this.base}clubs/`, payload);
  }

  readingClubDetail(clubId: string): Observable<{ success: boolean; club: ReadingClubSummary }> {
    return this.api.get(`${this.base}clubs/${clubId}/`);
  }

  updateReadingClubSettings(clubId: string, payload: {
    name?: string;
    mode?: ReadingClubMode;
    unlocked_until_chapter?: number;
    allow_member_invites?: boolean;
  }): Observable<CommunityResult & { club: ReadingClubSummary }> {
    return this.api.patch(`${this.base}clubs/${clubId}/`, payload);
  }

  updateReadingClubProgress(clubId: string, chapterOrder: number): Observable<CommunityResult & { club: ReadingClubSummary }> {
    return this.api.post(`${this.base}clubs/${clubId}/progress/`, { chapter_order: chapterOrder });
  }

  inviteToReadingClub(clubId: string, friendCodes: string[]): Observable<CommunityResult & { club: ReadingClubSummary }> {
    return this.api.post(`${this.base}clubs/${clubId}/invite/`, { friend_codes: friendCodes });
  }

  leaveReadingClub(clubId: string): Observable<CommunityResult> {
    return this.api.delete(`${this.base}clubs/${clubId}/`);
  }

  chapterMessages(clubId: string, chapterOrder: number, after?: string): Observable<{
    success: boolean;
    messages: ReadingClubMessageItem[];
    incremental: boolean;
  }> {
    const params = after ? new HttpParams().set('after', after) : undefined;
    return this.api.get(`${this.base}clubs/${clubId}/chapters/${chapterOrder}/messages/`, params);
  }

  sendChapterMessage(clubId: string, chapterOrder: number, content: string, isSpoiler = false): Observable<CommunityResult & { item: ReadingClubMessageItem }> {
    return this.api.post(`${this.base}clubs/${clubId}/chapters/${chapterOrder}/messages/`, {
      content,
      is_spoiler: isSpoiler,
    });
  }
}

