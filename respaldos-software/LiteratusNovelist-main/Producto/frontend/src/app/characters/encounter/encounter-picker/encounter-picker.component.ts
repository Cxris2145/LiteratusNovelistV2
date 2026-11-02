import { Component, Input, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, Subscription, catchError, debounceTime, distinctUntilChanged, forkJoin, map, merge, of, switchMap, tap } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { ChatService, HubAvatar, Paginated } from '../../../core/services/chat.service';
import { EncounterService } from '../../../core/services/encounter.service';
import { FALLBACK_AVATAR, portraitThumbnail } from '../../character-hub/character-hub.util';
import { TOPIC_IDEAS } from '../encounter-turns.util';

/** Un personaje elegido para el encuentro (ya resuelto a un libro concreto). */
interface Pick {
  id: string;
  name: string;
  book_title: string | null;
  book_slug: string | null;
  avatar_image_url: string | null;
}

const PAGE_SIZE = 24;

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Arma el encuentro: dos casillas, un buscador de personajes (el mismo catálogo de /characters) y
 * un tema opcional. Si un personaje aparece en varios libros, se elige el libro ahí mismo.
 */
@Component({
  selector: 'app-encounter-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './encounter-picker.component.html',
  styleUrl: './encounter-picker.component.css',
})
export class EncounterPickerComponent implements OnDestroy {
  private readonly chat = inject(ChatService);
  private readonly encounters = inject(EncounterService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Ids que llegan por ?a=&b= (p. ej. «Invitar a otro personaje» desde un chat). */
  @Input() set preset(ids: string[]) {
    const key = ids.join(',');
    if (key === this.presetKey) return;
    this.presetKey = key;
    this.presetSub?.unsubscribe();
    if (!ids.length) return;
    this.presetSub = forkJoin(ids.slice(0, 2).map(id => this.chat.getAvatar(id).pipe(catchError(() => of(null)))))
      .subscribe(avatars => avatars.forEach((avatar, index) => {
        if (avatar) this.slots[index] = this.toPick(avatar);
      }));
  }
  private presetKey = '';

  readonly topicIdeas = TOPIC_IDEAS;
  readonly fallback = FALLBACK_AVATAR;

  slots: [Pick | null, Pick | null] = [null, null];
  topic = '';

  query = '';
  results: HubAvatar[] = [];
  page = 1;
  pages = 1;
  loading = true;
  searchError = false;
  /** Personaje con varios libros: se muestra la elección de libro sobre su tarjeta. */
  choosingWorks: HubAvatar | null = null;
  notice = '';

  starting = false;
  error = '';
  errorBook: string | null = null;
  showLogin = false;

  private readonly query$ = new Subject<string>();
  private readonly page$ = new Subject<number>();
  private searchSub: Subscription;
  private presetSub?: Subscription;
  private noticeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const typed$ = this.query$.pipe(debounceTime(350), map(q => q.trim()), distinctUntilChanged(), tap(() => this.page = 1),
      map(() => 1));
    this.searchSub = merge(typed$, this.page$).pipe(
      tap(() => { this.loading = true; this.searchError = false; }),
      switchMap(page => this.chat.getGlobalAvatars(this.query.trim(), 'featured', page, PAGE_SIZE).pipe(
        catchError(() => {
          this.searchError = true;
          return of({ count: 0, next: null, previous: null, results: [] } as Paginated<HubAvatar>);
        }))),
    ).subscribe(res => {
      this.loading = false;
      this.results = res.results;
      this.pages = Math.max(1, Math.ceil(res.count / PAGE_SIZE));
      this.choosingWorks = null;
    });
    this.page$.next(1);
  }

  get isDemo(): boolean {
    return !this.auth.isLoggedIn() || this.auth.isGuest();
  }

  get ready(): boolean {
    return !!this.slots[0] && !!this.slots[1];
  }

  /** La casilla que se llena con el próximo personaje elegido. */
  get nextSlot(): number {
    return this.slots[0] ? 1 : 0;
  }

  get returnUrl(): string {
    const ids = this.slots.filter((s): s is Pick => !!s).map(s => s.id);
    const params = ids.map((id, i) => `${i ? 'b' : 'a'}=${id}`).join('&');
    return '/encuentro' + (params ? '?' + params : '');
  }

  ngOnDestroy(): void {
    this.searchSub.unsubscribe();
    this.presetSub?.unsubscribe();
    clearTimeout(this.noticeTimer);
  }

  onQuery(): void {
    this.query$.next(this.query);
  }

  goTo(page: number): void {
    if (page < 1 || page > this.pages || page === this.page) return;
    this.page = page;
    this.page$.next(page);
  }

  isPicked(avatar: HubAvatar): boolean {
    const ids = [avatar.id, ...(avatar.works || []).map(w => w.avatar_id)];
    return this.slots.some(s => !!s && ids.includes(s.id));
  }

  choose(avatar: HubAvatar): void {
    this.error = '';
    if (this.isPicked(avatar)) {
      this.flash(`${avatar.name} ya está en el encuentro.`);
      return;
    }
    if (this.ready) {
      this.flash('Ya elegiste a los dos. Quita a uno para cambiarlo.');
      return;
    }
    if ((avatar.works?.length || 0) > 1) {
      this.choosingWorks = avatar;
      return;
    }
    this.place(this.toPick(avatar));
  }

  chooseWork(avatar: HubAvatar, work: { avatar_id: string; book_title: string; book_slug: string | null }): void {
    this.choosingWorks = null;
    this.place({ id: work.avatar_id, name: avatar.name, book_title: work.book_title, book_slug: work.book_slug,
      avatar_image_url: avatar.avatar_image_url });
  }

  remove(index: number): void {
    this.slots[index] = null;
    // La casilla 1 siempre se llena primero.
    if (!this.slots[0] && this.slots[1]) this.slots = [this.slots[1], null];
    this.error = '';
  }

  useTopic(idea: string): void {
    this.topic = this.topic === idea ? '' : idea;
  }

  start(): void {
    const [a, b] = this.slots;
    if (!a || !b || this.starting) return;
    if (this.isDemo) {
      this.showLogin = true;
      return;
    }
    this.starting = true;
    this.error = '';
    this.errorBook = null;
    this.encounters.create([a.id, b.id], this.topic.trim()).subscribe({
      next: encounter => this.router.navigate(['/encuentro', encounter.id]),
      error: err => {
        this.starting = false;
        this.error = err?.error?.message || err?.error?.detail || 'No pudimos armar el encuentro. Intenta de nuevo.';
        this.errorBook = err?.error?.book_slug || null;
      },
    });
  }

  thumb(url: string | null | undefined, width = 240): string {
    return portraitThumbnail(url, width);
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith(FALLBACK_AVATAR)) img.src = FALLBACK_AVATAR;
  }

  trackAvatar = (_: number, avatar: HubAvatar) => avatar.id;

  private place(pick: Pick): void {
    const other = this.slots[this.nextSlot === 0 ? 1 : 0];
    if (other && fold(other.name) === fold(pick.name)) {
      this.flash('Elige a dos personajes distintos.');
      return;
    }
    this.slots[this.nextSlot] = pick;
  }

  private toPick(avatar: HubAvatar | any): Pick {
    return { id: String(avatar.id), name: avatar.name, book_title: avatar.book_title ?? null,
      book_slug: avatar.book_slug ?? null, avatar_image_url: avatar.avatar_image_url ?? null };
  }

  private flash(text: string): void {
    this.notice = text;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice = '', 2600);
  }
}
