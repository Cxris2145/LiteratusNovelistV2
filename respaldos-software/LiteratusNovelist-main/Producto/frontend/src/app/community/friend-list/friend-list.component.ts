import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { FriendCard, FriendRequestItem } from '../../core/services/community.service';

/**
 * "Mis amigos": solicitudes pendientes arriba y la lista con su estado. Solo emite;
 * la página de La Taberna llama a la API y avisa con un toast.
 */
@Component({
  selector: 'app-friend-list',
  templateUrl: './friend-list.component.html',
  styleUrls: ['../community-shared.css', './friend-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FriendListComponent {
  @Input() friends: FriendCard[] = [];
  @Input() incoming: FriendRequestItem[] = [];
  @Input() outgoing: FriendRequestItem[] = [];
  @Input() loading = false;
  /** Código o id de solicitud con una acción en curso: sus botones se bloquean. */
  @Input() busy: string | null = null;

  @Output() accept = new EventEmitter<FriendRequestItem>();
  @Output() decline = new EventEmitter<FriendRequestItem>();
  @Output() cancel = new EventEmitter<FriendRequestItem>();
  @Output() toggleBrindis = new EventEmitter<FriendCard>();
  @Output() remove = new EventEmitter<FriendCard>();
  @Output() addFriend = new EventEmitter<void>();

  /** Amigo cuyo botón "Eliminar" pide confirmación. */
  confirming: string | null = null;

  trackFriend = (_: number, friend: FriendCard) => friend.friend_code;
  trackRequest = (_: number, request: FriendRequestItem) => request.id;

  askRemove(friend: FriendCard): void {
    this.confirming = friend.friend_code;
  }

  confirmRemove(friend: FriendCard): void {
    this.confirming = null;
    this.remove.emit(friend);
  }
}
