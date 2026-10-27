import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EMPTY, Observable, Subject, of, timer } from 'rxjs';
import { catchError, distinctUntilChanged, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { CommunityResult, CommunityService, FriendSuggestion, TavernCard } from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { copyText } from '../clipboard.util';
import { ReaderPhotos } from '../reader-photo.util';

export interface AddFriendDialogData {
  myCode: string | null;
}

const MIN_QUERY = 3;

/**
 * Buscar lectores por nombre de usuario o por código (#K7Q2XM) e invitarlos a la mesa.
 * Con la búsqueda vacía sugiere lectores que ya están en Literatus (perfiles públicos).
 */
@Component({
  selector: 'app-add-friend-dialog',
  templateUrl: './add-friend-dialog.component.html',
  styleUrls: ['../community-shared.css', './add-friend-dialog.component.css'],
})
export class AddFriendDialogComponent implements OnInit, OnDestroy {
  readonly data = inject<AddFriendDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<AddFriendDialogComponent>);
  private community = inject(CommunityService);
  private notification = inject(NotificationService);
  private destroy$ = new Subject<void>();
  private closed = false;

  readonly query = new FormControl('', { nonNullable: true });
  /** La foto de perfil de cada lector; sin foto (o si no carga) se ve su Maguito. */
  readonly photos = new ReaderPhotos();
  results: TavernCard[] = [];
  searching = false;
  searched = false;
  failed = false;
  /** Código del lector con una acción en curso. */
  busy: string | null = null;
  suggestions: FriendSuggestion[] = [];
  suggestionsLoading = true;
  suggestionsFailed = false;

  /** Mientras no se busca nada, se ven las sugerencias. */
  get showSuggestions(): boolean {
    return this.query.value.trim().replace(/^#/, '').length < MIN_QUERY;
  }

  get liveMessage(): string {
    if (this.searching) return 'Buscando…';
    if (this.failed) return 'No pudimos buscar ahora. Inténtalo de nuevo.';
    if (!this.searched) return '';
    return this.results.length
      ? `${this.results.length} ${this.results.length === 1 ? 'lector encontrado' : 'lectores encontrados'}.`
      : 'No encontramos a nadie con ese nombre o código.';
  }

  ngOnInit(): void {
    this.dialogRef.beforeClosed().pipe(takeUntil(this.destroy$)).subscribe(() => this.stopPending());
    this.loadSuggestions();
    this.query.valueChanges.pipe(
      map(value => value.trim()),
      distinctUntilChanged(),
      switchMap(value => {
        // El cambio cancela incluso una petición ya iniciada, antes de esperar el debounce.
        this.results = [];
        this.searching = false;
        this.searched = false;
        this.failed = false;
        if (value.replace(/^#/, '').length < MIN_QUERY) return EMPTY;
        return timer(300).pipe(
          tap(() => { this.searching = true; }),
          switchMap(() => this.community.search(value).pipe(
            catchError(() => { this.failed = true; return of({ results: [] as TavernCard[] }); }),
          )),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(({ results }) => {
      this.results = results;
      this.searching = false;
      this.searched = true;
    });
  }

  ngOnDestroy(): void {
    this.stopPending();
  }

  private stopPending(): void {
    if (this.closed) return;
    this.closed = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.searching = false;
    this.suggestionsLoading = false;
    this.busy = null;
  }

  clearQuery(): void {
    this.query.setValue('');
  }

  trackCard = (_: number, card: TavernCard) => card.friend_code;

  loadSuggestions(): void {
    if (this.closed) return;
    this.suggestionsLoading = true;
    this.suggestionsFailed = false;
    this.community.suggestions().pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ results }) => { this.suggestions = results; this.suggestionsLoading = false; },
      error: () => { this.suggestionsLoading = false; this.suggestionsFailed = true; },
    });
  }

  suggestionLabel(card: TavernCard): string {
    if (card.relation === 'outgoing') return 'Enviada';
    if (card.relation === 'friend') return 'Amigos';
    if (card.relation === 'incoming') return 'Aceptar';
    return 'Agregar';
  }

  actionLabel(card: TavernCard): string {
    switch (card.relation) {
      case 'friend': return 'Ya son amigos';
      case 'outgoing': return 'Cancelar solicitud';
      case 'incoming': return 'Aceptar solicitud';
      default: return 'Enviar solicitud';
    }
  }

  act(card: TavernCard): void {
    if (this.closed || this.busy || card.relation === 'friend' || card.relation === 'self') return;
    const previousRelation = card.relation;
    let request: Observable<CommunityResult>;
    if (card.relation === 'outgoing' && card.request_id) request = this.community.cancel(card.request_id);
    else if (card.relation === 'incoming' && card.request_id) request = this.community.accept(card.request_id);
    else request = this.community.sendRequest({ friend_code: card.friend_code });

    this.busy = card.friend_code;
    request.pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.busy = null; }),
    ).subscribe({
      next: result => {
        const relation = previousRelation === 'outgoing' ? 'none'
          : previousRelation === 'incoming' || result.state === 'accepted' ? 'friend' : 'outgoing';
        // La misma persona puede estar en sugerencias y resultados: ambas vistas conservan el estado.
        for (const shown of new Set([card, ...this.results, ...this.suggestions])) {
          if (shown.friend_code !== card.friend_code) continue;
          shown.relation = relation;
          shown.request_id = relation === 'outgoing' ? result.id ?? null : null;
        }
        this.notification.success(result.message, 'Taberna');
        this.community.changed$.next();
      },
      error: err => {
        this.notification.error(err.error?.message || 'No se pudo completar la acción. Inténtalo de nuevo.', 'Taberna');
      },
    });
  }

  async copyMyCode(): Promise<void> {
    if (this.closed || !this.data.myCode) return;
    const copied = await copyText('#' + this.data.myCode);
    if (this.closed) return;
    this.notification[copied ? 'success' : 'info'](
      copied ? 'Código copiado.' : `Tu código es #${this.data.myCode}.`, 'Taberna');
  }

  close(): void {
    this.stopPending();
    this.dialogRef.close();
  }
}
