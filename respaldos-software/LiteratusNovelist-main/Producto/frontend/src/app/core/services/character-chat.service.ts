import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/** Qué abrir: un personaje, o el elenco de un libro de la biblioteca (se elige el principal). */
export interface CharacterChatRequest {
  avatarId?: string;
  inventoryId?: string;
}

/**
 * Ventana rápida de chat con personajes. Cualquier página la abre con `open(id)` y el chat
 * aparece encima, sin pasar por el lector (que descargaba el libro entero solo para chatear).
 * La ventana se monta en AppComponent y su código se descarga la primera vez que se abre.
 */
@Injectable({ providedIn: 'root' })
export class CharacterChatService {
  readonly request$ = new BehaviorSubject<CharacterChatRequest | null>(null);

  get isOpen(): boolean {
    return !!this.request$.value;
  }

  open(avatarId: string | number | null | undefined): void {
    if (avatarId === null || avatarId === undefined || avatarId === '') return;
    this.request$.next({ avatarId: String(avatarId) });
  }

  /** Personajes de un libro de la biblioteca: abre al principal y deja elegir a los demás. */
  openForBook(inventoryId: string | number | null | undefined): void {
    if (!inventoryId) return;
    this.request$.next({ inventoryId: String(inventoryId) });
  }

  close(): void {
    if (this.request$.value) this.request$.next(null);
  }
}
