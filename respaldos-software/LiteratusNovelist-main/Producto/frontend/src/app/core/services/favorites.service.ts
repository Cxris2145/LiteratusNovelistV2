import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, distinctUntilChanged, map, of, tap, throwError } from 'rxjs';

import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface FavoriteApiBook {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  is_featured: boolean;
  cover_image: string | null;
  author_name?: string | null;
  word_count?: number;
  page_count?: number | null;
}

export interface FavoriteRecord {
  id: string;
  book: FavoriteApiBook;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  private favoritesSubject = new BehaviorSubject<FavoriteRecord[]>([]);
  private bookKeysSubject = new BehaviorSubject<ReadonlySet<string>>(new Set());

  readonly favorites$ = this.favoritesSubject.asObservable();
  readonly bookKeys$ = this.bookKeysSubject.asObservable();
  readonly count$ = this.favorites$.pipe(
    map(favorites => favorites.length),
    distinctUntilChanged(),
  );

  constructor() {
    this.auth.isLoggedIn$.subscribe(loggedIn => {
      if (!loggedIn) {
        this.setState([]);
        return;
      }

      this.load().subscribe({
        error: error => console.warn('No se pudieron sincronizar los favoritos.', error),
      });
    });
  }

  load(): Observable<FavoriteRecord[]> {
    if (!this.auth.isLoggedIn()) {
      this.setState([]);
      return of([]);
    }

    return this.api.get<FavoriteRecord[]>('library/favorites/').pipe(
      tap(favorites => this.setState(Array.isArray(favorites) ? favorites : [])),
    );
  }

  isFavorite(bookId: string, slug?: string): boolean {
    const keys = this.bookKeysSubject.value;
    return keys.has(String(bookId)) || (!!slug && keys.has(String(slug)));
  }

  setFavorite(bookId: string, favorite: boolean): Observable<boolean> {
    if (!this.auth.isLoggedIn()) {
      return throwError(() => new Error('Debes iniciar sesión para guardar favoritos.'));
    }

    const id = String(bookId);
    const previous = this.favoritesSubject.value;
    const existing = previous.find(item => String(item.book.id) === id);

    if (favorite) {
      if (existing) return of(true);

      this.setKeys(new Set([...this.bookKeysSubject.value, id]));
      return this.api.post<FavoriteRecord>('library/favorites/', { book_id: id }).pipe(
        tap(record => this.setState([record, ...this.favoritesSubject.value.filter(item => item.id !== record.id)])),
        map(() => true),
        catchError(error => {
          this.setState(previous);
          return throwError(() => error);
        }),
      );
    }

    if (!existing && !this.bookKeysSubject.value.has(id)) return of(false);

    this.setState(previous.filter(item => String(item.book.id) !== id));
    return this.api.delete<void>(`library/favorites/book/${id}/`).pipe(
      map(() => false),
      catchError(error => {
        this.setState(previous);
        return throwError(() => error);
      }),
    );
  }

  clear(): Observable<void> {
    const previous = this.favoritesSubject.value;
    this.setState([]);

    return this.api.delete<{ deleted: number }>('library/favorites/clear/').pipe(
      map(() => undefined),
      catchError(error => {
        this.setState(previous);
        return throwError(() => error);
      }),
    );
  }

  private setState(favorites: FavoriteRecord[]): void {
    this.favoritesSubject.next(favorites);
    const keys = new Set<string>();
    for (const favorite of favorites) {
      keys.add(String(favorite.book.id));
      if (favorite.book.slug) keys.add(String(favorite.book.slug));
    }
    this.setKeys(keys);
  }

  private setKeys(keys: ReadonlySet<string>): void {
    this.bookKeysSubject.next(keys);
    window.dispatchEvent(new Event('literatus-favorites-updated'));
  }
}
