import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

/** Control parental: el tutor ve el historial de sus hijos (backend `parental/`). */

export interface ChildPresence {
  kind: 'reading' | 'tavern' | 'away';
  label: string;
  book_title: string | null;
}

export interface ChildCard {
  id: string;
  username: string;
  first_name: string;
  age: number | null;
  birth_date: string | null;
  avatar_color: string;
  origin: 'created' | 'linked';
  linked_at: string;
  /** false: la cuenta la creó el tutor con un correo interno (no puede recuperar la contraseña por correo). */
  has_own_email: boolean;
  has_completed_onboarding: boolean;
  level: number;
  level_name: string;
  xp: number;
  ink_balance: number;
  streak_current: number;
  last_activity: string | null;
  presence: ChildPresence;
}

export interface ParentalStatus {
  can_be_parent: boolean;
  reason: 'guest' | 'child_account' | 'no_birth_date' | 'minor' | null;
  reason_message: string | null;
  is_child: boolean;
  guardian: { username: string; first_name: string } | null;
  consent_text: string;
  max_children: number;
  children: ChildCard[];
}

export interface CalendarDay { date: string; day: number; active: boolean; is_today: boolean; }

export interface ChildOverview {
  child: { id: string; username: string; first_name: string; age: number | null; avatar_color: string;
           member_since: string; last_login: string | null; has_own_email: boolean; };
  profile: { level: number; level_name: string; xp: number; ink_balance: number; streak_current: number; streak_max: number; };
  library: { books: number; books_read: number; reviews: number; friends: number; brindis: number; };
  reading: { minutes_7d: number; minutes_30d: number; minutes_total: number; };
  senda: SendaStats;
  games: { enigmas_solved: number; interrogations_won: number; achievements_unlocked: number; achievements_total: number; };
  writing: { highlights: number; post_its: number; vocabulary: number; notebook_tabs: number; chats: number; };
  calendar: CalendarDay[];
  last_activity: string | null;
}

export interface ReadingBook {
  book_id: string;
  title: string;
  slug: string;
  cover: string | null;
  acquired_at: string;
  current_chapter: number;
  total_chapters: number;
  completion_percentage: number;
  minutes: number;
  sessions: number;
  last_read_at: string | null;
  finished_at: string | null;
}

export interface ChildReading {
  books: ReadingBook[];
  daily_minutes: { date: string; minutes: number }[];
  recent_sessions: { book_title: string; started_at: string; ended_at: string | null; minutes: number; in_progress: boolean }[];
  totals: { books: number; finished: number; minutes: number; sessions: number };
}

export interface SendaStats {
  total_completed_levels: number;
  total_stars: number;
  total_attempts: number;
  total_passed: number;
  accuracy_percentage: number;
  total_learning_time_minutes: number;
  streak_current: number;
  streak_max: number;
}

export type EnigmaResult = 'solved' | 'lost' | 'abandoned';

export interface ChildGames {
  senda: SendaStats & {
    units: { number: number; title: string; icon: string; levels_total: number; levels_completed: number; stars: number; stars_total: number }[];
    recent_attempts: { level_title: string; unit_number: number; unit_title: string; score: number; passed: boolean;
                       xp_earned: number; ink_earned: number; duration_seconds: number; hearts_lost: number; at: string }[];
  };
  enigma: { totals: Record<EnigmaResult, number>; recent: { date: string; result: EnigmaResult; label: string; ink: number }[] };
  interrogation: {
    totals: Record<'playing' | 'won' | 'lost' | 'abandoned', number>;
    recent: { id: string; date: string; at: string; status: string; label: string; character: string | null; book_title: string | null;
              questions_used: number; questions_allowed: number; clues_bought: number; ink_earned: number; xp_earned: number }[];
  };
  achievements: {
    unlocked: { title: string; description: string; icon: string; rarity: string; category: string; unlocked_at: string }[];
    next: { title: string; icon: string; current_progress: number; threshold: number; percentage: number }[];
    total: number;
  };
  streak: { streak_current: number; streak_max: number; streak_shields: number; is_secured_today: boolean };
}

export interface ChildWriting {
  highlights: { book_title: string; chapter: string; text: string; color: string; at: string }[];
  post_its: { book_title: string; chapter: string; text: string; at: string }[];
  notebook: { title: string; book_title: string | null; text: string; has_drawing: boolean; updated_at: string }[];
  vocabulary: { word: string; definition: string; context: string; book_title: string | null; is_learned: boolean; at: string }[];
}

export interface ChildChats {
  characters: { id: string; character: string; book_title: string; title: string; message_count: number; questions: number;
                started_at: string; last_message_at: string }[];
  interrogations: { id: string; at: string; status: string; label: string; character: string | null;
                    dialogue: { role: 'user' | 'character' | 'clue'; content: string }[] }[];
}

export interface ChildChatDetail {
  id: string;
  character: string;
  book_title: string;
  title: string;
  messages: { role: 'user' | 'assistant'; content: string; at: string }[];
}

export interface ActivityEvent { kind: string; at: string; title: string; detail: string; icon: string; }

export interface ChildActivity {
  events: ActivityEvent[];
  days: { date: string; minutes: number; levels_completed: number; xp_earned: number; active: boolean }[];
}

export interface CreateChildPayload {
  username: string;
  password: string;
  birth_date: string;
  first_name?: string;
  consent: boolean;
}

export interface LinkChildPayload {
  identifier: string;
  password: string;
  consent: boolean;
  birth_date?: string | null;
}

export type ChildSection = 'reading' | 'games' | 'writing' | 'chats' | 'activity';
export type GuardianAction = 'password' | 'unlink' | 'delete';

@Injectable({ providedIn: 'root' })
export class ParentalService {
  private api = inject(ApiService);

  status(): Observable<ParentalStatus> {
    return this.api.get<ParentalStatus>('parental/status/');
  }

  createChild(payload: CreateChildPayload): Observable<ChildCard> {
    return this.api.post<ChildCard>('parental/children/', payload);
  }

  linkChild(payload: LinkChildPayload): Observable<ChildCard> {
    return this.api.post<ChildCard>('parental/children/link/', payload);
  }

  overview(childId: string): Observable<ChildOverview> {
    return this.api.get<ChildOverview>(`parental/children/${childId}/`);
  }

  section<T>(childId: string, section: ChildSection): Observable<T> {
    return this.api.get<T>(`parental/children/${childId}/${section}/`);
  }

  chat(childId: string, sessionId: string): Observable<ChildChatDetail> {
    return this.api.get<ChildChatDetail>(`parental/children/${childId}/chats/${sessionId}/`);
  }

  /** Cambiar contraseña, desvincular o borrar la cuenta del hijo: siempre con la contraseña del tutor. */
  act(childId: string, action: GuardianAction, parentPassword: string, newPassword?: string): Observable<unknown> {
    const body: Record<string, string> = { parent_password: parentPassword };
    if (action === 'password') body['new_password'] = newPassword || '';
    return this.api.post(`parental/children/${childId}/${action}/`, body);
  }
}
