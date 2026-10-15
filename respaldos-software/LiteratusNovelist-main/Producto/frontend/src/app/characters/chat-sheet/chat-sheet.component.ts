import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationStart, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { CharacterChatComponent } from '../character-chat/character-chat.component';

/**
 * Ventana rápida de chat: aparece encima de la página donde estás (panel a la derecha en el
 * computador, pantalla completa en el celular). La abre CharacterChatService desde Personajes,
 * la portada, la ficha del libro, Mi Biblioteca, Mensajes o el lector.
 */
@Component({
  selector: 'app-chat-sheet',
  standalone: true,
  imports: [CommonModule, CharacterChatComponent],
  template: `
    <div class="cs-backdrop" *ngIf="isOpen" (click)="close()" aria-hidden="true"></div>
    <section class="cs-panel" *ngIf="isOpen" role="dialog" aria-modal="true" aria-labelledby="cc-title">
      <div class="cs-state" *ngIf="!avatarId">
        <span class="material-symbols-rounded cs-spin" aria-hidden="true">{{ message ? 'person_off' : 'progress_activity' }}</span>
        <span>{{ message || 'Buscando a los personajes…' }}</span>
        <button *ngIf="message" type="button" class="cs-close" (click)="close()">Cerrar</button>
      </div>
      <app-character-chat *ngIf="avatarId" [initialDraft]="draft" [avatarId]="avatarId"
                          (closed)="close()" (expand)="expand($event)" (pick)="chat.open($event)"></app-character-chat>
    </section>
  `,
  styleUrl: './chat-sheet.component.css',
})
export class ChatSheetComponent implements OnInit, OnDestroy {
  readonly chat = inject(CharacterChatService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  isOpen = false;
  avatarId: string | null = null;
  /** Texto que el chat deja escrito en su campo al abrir (una cita del lector). */
  draft = '';
  message = '';
  /** Se agregó una entrada al historial: el botón Atrás del celular cierra la ventana. */
  private pushedHistory = false;
  private subs = new Subscription();

  ngOnInit(): void {
    this.subs.add(this.chat.request$.subscribe(request => {
      if (!request) {
        this.hide();
        return;
      }
      this.show();
      this.message = '';
      this.draft = request.draft || '';
      if (request.avatarId) {
        this.avatarId = request.avatarId;
      } else if (request.inventoryId) {
        this.avatarId = null;
        this.pickFromBook(request.inventoryId);
      }
    }));
    // Ir a otra página (un enlace dentro del chat, "ampliar") cierra la ventana.
    // No se retrocede en el historial: eso desharía la navegación que acaba de empezar.
    this.subs.add(this.router.events.pipe(filter(e => e instanceof NavigationStart)).subscribe(() => {
      this.pushedHistory = false;
      this.chat.close();
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  close(): void {
    this.chat.close();
  }

  /** Página completa del chat (llamada y voz). Reemplaza la entrada que agregó la ventana. */
  expand(avatarId: string): void {
    this.pushedHistory = false;
    this.router.navigate(['/chat', avatarId], { replaceUrl: true });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.close();
  }

  @HostListener('window:popstate')
  onPopState(): void {
    if (!this.pushedHistory) return;
    this.pushedHistory = false;
    this.close();
  }

  /** Personajes de un libro de la biblioteca: el autor o un protagonista primero. */
  private pickFromBook(inventoryId: string): void {
    this.api.get<any[]>(`ai/avatars/?inventory_id=${inventoryId}`).subscribe({
      next: list => {
        const avatars = Array.isArray(list) ? list : [];
        const first = avatars.find(a => a.is_major_character) || avatars.find(a => a.is_author) || avatars[0];
        if (first) this.avatarId = String(first.id);
        else this.message = 'Este libro todavía no tiene personajes para conversar.';
      },
      error: () => this.message = 'No pudimos cargar los personajes de este libro.',
    });
  }

  private show(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    document.body.classList.add('chat-sheet-open');
    try {
      history.pushState({ ...(history.state || {}), litChatSheet: true }, '');
      this.pushedHistory = true;
    } catch { /* sin historial: el Atrás del celular saldrá de la página */ }
  }

  private hide(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.avatarId = null;
    document.body.classList.remove('chat-sheet-open');
    if (this.pushedHistory) {
      // Se cerró con la X o Escape: se descarta la entrada que agregamos al abrir.
      this.pushedHistory = false;
      if (history.state?.litChatSheet) history.back();
    }
  }
}
