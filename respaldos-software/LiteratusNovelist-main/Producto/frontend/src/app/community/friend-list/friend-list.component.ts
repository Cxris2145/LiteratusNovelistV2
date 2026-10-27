import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output,
  QueryList, SimpleChanges, ViewChildren, inject,
} from '@angular/core';

import { MaguitoComponent } from '../../core/components/maguito/maguito.component';
import { FriendCard, FriendRequestItem } from '../../core/services/community.service';
import { prefersReducedMotion } from '../../core/utils/motion.util';
import { ReaderPhotos } from '../reader-photo.util';
import { listContainerMotion, listItemMotion, listItemParams } from '../tavern-motion';

/** Tiempo que un busto "despierta" para hacer su gesto (después vuelve a quedar en pausa). */
const POKE_MS = 650;
const CELEBRATE_MS = 1100;

/**
 * "Mis amigos": solicitudes pendientes arriba y la lista con su estado. Solo emite;
 * la página de La Taberna llama a la API y avisa con un toast.
 */
@Component({
  selector: 'app-friend-list',
  templateUrl: './friend-list.component.html',
  styleUrls: ['../community-shared.css', './friend-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [listItemMotion, listContainerMotion],
})
export class FriendListComponent implements OnChanges, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  @ViewChildren('rowMaguito') private rowMaguitos?: QueryList<MaguitoComponent>;
  /** La foto de perfil de cada lector; sin foto (o si no carga) se ve su Maguito. */
  readonly photos = new ReaderPhotos();

  @Input() friends: FriendCard[] = [];
  @Input() incoming: FriendRequestItem[] = [];
  @Input() outgoing: FriendRequestItem[] = [];
  @Input() loading = false;
  /** Código o id de solicitud con una acción en curso: sus botones se bloquean. */
  @Input() busy: string | null = null;
  /** Mensajes sin leer de las charlas privadas, por código de amigo. */
  @Input() unread: Record<string, number> = {};
  /** Amigo recién aceptado: su fila brilla y su Maguito salta. */
  @Input() celebrate: string | null = null;

  @Output() accept = new EventEmitter<FriendRequestItem>();
  @Output() decline = new EventEmitter<FriendRequestItem>();
  @Output() cancel = new EventEmitter<FriendRequestItem>();
  @Output() toggleBrindis = new EventEmitter<FriendCard>();
  @Output() remove = new EventEmitter<FriendCard>();
  @Output() addFriend = new EventEmitter<void>();
  /** Abrir la charla privada con un amigo. */
  @Output() chat = new EventEmitter<FriendCard>();

  /** Amigo cuyo botón "Eliminar" pide confirmación. */
  confirming: string | null = null;
  /** Se recalcula solo al recibir la lista, no durante cada comprobación de la vista. */
  presentCount = 0;

  readonly itemMotion = listItemParams();
  private readonly reduced = prefersReducedMotion();
  private readonly canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  /** Amigos cuyo contador de no leídos acaba de subir (salta una vez). */
  bumped = new Set<string>();
  /** Busto despierto (sin pausa) mientras hace su gesto. */
  awake: string | null = null;
  celebrating: string | null = null;
  private celebrated: string | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['friends']) {
      this.presentCount = this.friends.reduce((count, friend) => count + Number(friend.status.kind === 'tavern'), 0);
    }
    if (changes['unread']) {
      const before: Record<string, number> = changes['unread'].previousValue ?? {};
      this.bumped = new Set(Object.entries(this.unread ?? {})
        .filter(([code, count]) => count > (before[code] ?? 0))
        .map(([code]) => code));
    }
    // La fila del amigo nuevo llega con la recarga: se celebra apenas aparece, una sola vez.
    const code = this.celebrate;
    if (code && code !== this.celebrated && this.friends.some(friend => friend.friend_code === code)) {
      this.celebrated = code;
      this.celebrating = code;
      this.later(() => {
        if (this.celebrating === code) this.celebrating = null;
        this.cdr.markForCheck();
      }, CELEBRATE_MS);
      if (!this.reduced) this.wake(code, 'success', CELEBRATE_MS);
    }
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  /** Con mouse, el busto del amigo hace un gesto al pasar sobre su fila. */
  poke(friend: FriendCard): void {
    if (!this.canHover || this.reduced || this.awake) return;
    this.wake(friend.friend_code, 'poke', POKE_MS);
  }

  /** Los bustos están en pausa (son muchos): uno despierta, hace su gesto y vuelve a dormir. */
  private wake(code: string, gesture: 'poke' | 'success', ms: number): void {
    const friend = this.friends.find(item => item.friend_code === code);
    if (!friend || this.photos.of(friend)) return;
    this.awake = code;
    this.cdr.markForCheck();
    this.later(() => {
      if (this.awake !== code) return;
      // Solo las filas sin foto tienen Maguito: el índice se cuenta entre ellas.
      const index = this.friends.filter(friend => !this.photos.of(friend)).findIndex(friend => friend.friend_code === code);
      this.rowMaguitos?.get(index)?.play(gesture);
    }, 0);
    this.later(() => {
      if (this.awake === code) this.awake = null;
      this.cdr.markForCheck();
    }, ms);
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }

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
