import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { CommunityResult, CommunityService, TavernCard } from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { copyText } from '../clipboard.util';

export interface AddFriendDialogData {
  myCode: string | null;
}

const MIN_QUERY = 3;

/** Buscar lectores por nombre de usuario o por código (#K7Q2XM) e invitarlos a la mesa. */
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

  readonly query = new FormControl('', { nonNullable: true });
  results: TavernCard[] = [];
  searching = false;
  searched = false;
  failed = false;
  /** Código del lector con una acción en curso. */
  busy: string | null = null;

  get liveMessage(): string {
    if (this.searching) return 'Buscando…';
    if (this.failed) return 'No pudimos buscar ahora. Inténtalo de nuevo.';
    if (!this.searched) return '';
    return this.results.length
      ? `${this.results.length} ${this.results.length === 1 ? 'lector encontrado' : 'lectores encontrados'}.`
      : 'No encontramos a nadie con ese nombre o código.';
  }

  ngOnInit(): void {
    this.query.valueChanges.pipe(
      map(value => value.trim()),
      debounceTime(300),
      distinctUntilChanged(),
      tap(value => {
        if (value.replace(/^#/, '').length < MIN_QUERY) {
          this.results = [];
          this.searched = false;
        }
      }),
      filter(value => value.replace(/^#/, '').length >= MIN_QUERY),
      tap(() => { this.searching = true; this.failed = false; }),
      switchMap(value => this.community.search(value).pipe(
        catchError(() => { this.failed = true; return of({ results: [] as TavernCard[] }); }),
      )),
      takeUntil(this.destroy$),
    ).subscribe(({ results }) => {
      this.results = results;
      this.searching = false;
      this.searched = true;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackCard = (_: number, card: TavernCard) => card.friend_code;

  actionLabel(card: TavernCard): string {
    switch (card.relation) {
      case 'friend': return 'Ya son amigos';
      case 'outgoing': return 'Cancelar solicitud';
      case 'incoming': return 'Aceptar solicitud';
      default: return 'Enviar solicitud';
    }
  }

  act(card: TavernCard): void {
    if (this.busy || card.relation === 'friend' || card.relation === 'self') return;
    let request: Observable<CommunityResult>;
    if (card.relation === 'outgoing' && card.request_id) request = this.community.cancel(card.request_id);
    else if (card.relation === 'incoming' && card.request_id) request = this.community.accept(card.request_id);
    else request = this.community.sendRequest({ friend_code: card.friend_code });

    this.busy = card.friend_code;
    request.subscribe({
      next: result => {
        this.busy = null;
        if (card.relation === 'outgoing') {
          card.relation = 'none';
          card.request_id = null;
        } else if (card.relation === 'incoming' || result.state === 'accepted') {
          card.relation = 'friend';
        } else {
          card.relation = 'outgoing';
          card.request_id = result.id ?? null;
        }
        this.notification.success(result.message, 'Taberna');
        this.community.changed$.next();
      },
      error: err => {
        this.busy = null;
        this.notification.error(err.error?.message || 'No se pudo completar la acción. Inténtalo de nuevo.', 'Taberna');
      },
    });
  }

  async copyMyCode(): Promise<void> {
    if (!this.data.myCode) return;
    const copied = await copyText('#' + this.data.myCode);
    this.notification[copied ? 'success' : 'info'](
      copied ? 'Código copiado.' : `Tu código es #${this.data.myCode}.`, 'Taberna');
  }

  close(): void {
    this.dialogRef.close();
  }
}
