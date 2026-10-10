import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface UserVocabularyCard {
  id: string;
  book_id: string;
  book_title: string;
  chapter_id?: string | null;
  chapter_title?: string;
  word: string;
  definition: string;
  context_sentence: string;
  is_learned: boolean;
  created_at: string;
  updated_at?: string;
}

export interface PracticeResponse {
  count: number;
  cards: UserVocabularyCard[];
}

export interface SaveWordPayload {
  book_id: string;
  chapter_id?: string | null;
  word: string;
  definition?: string;
  context_sentence?: string;
}

@Injectable({ providedIn: 'root' })
export class VocabularyService {
  private api = inject(ApiService);

  /**
   * Obtiene la lista completa de palabras del vocabulario del usuario,
   * con soporte para filtrado por libro y estado de aprendizaje.
   */
  getVocabulary(bookId?: string, isLearned?: boolean, query?: string): Observable<UserVocabularyCard[]> {
    const params = new URLSearchParams();
    if (bookId) params.set('book_id', bookId);
    if (isLearned !== undefined) params.set('is_learned', String(isLearned));
    if (query) params.set('q', query);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.api.get<UserVocabularyCard[]>(`library/vocabulary/${qs}`);
  }

  /**
   * Obtiene tarjetas para la sesión interactiva de práctica / flashcards.
   */
  getPracticeCards(
    bookId?: string,
    mode: 'unlearned' | 'all' | 'learned' = 'unlearned',
    shuffle = true
  ): Observable<PracticeResponse> {
    const params = new URLSearchParams();
    if (bookId) params.set('book_id', bookId);
    if (mode) params.set('mode', mode);
    if (shuffle) params.set('shuffle', 'true');
    return this.api.get<PracticeResponse>(`library/vocabulary/practice/?${params.toString()}`);
  }

  /**
   * Guarda o actualiza una palabra de vocabulario (p. ej. desde el lector web).
   */
  saveWord(payload: SaveWordPayload): Observable<UserVocabularyCard> {
    return this.api.post<UserVocabularyCard>('library/vocabulary/', payload);
  }

  /**
   * Marca o desmarca una palabra como aprendida.
   */
  toggleLearned(id: string, isLearned?: boolean): Observable<UserVocabularyCard> {
    const body = isLearned !== undefined ? { is_learned: isLearned } : {};
    return this.api.patch<UserVocabularyCard>(`library/vocabulary/${id}/status/`, body);
  }

  /**
   * Elimina una palabra del vocabulario.
   */
  deleteWord(id: string): Observable<void> {
    return this.api.delete<void>(`library/vocabulary/${id}/`);
  }
}
