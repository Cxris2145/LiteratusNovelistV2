import {
  Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription, catchError, forkJoin, of, switchMap } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AIUsage, SubscriptionService } from '../../core/services/subscription.service';
import { AIUsageMeterComponent } from '../../core/components/ai-usage-meter/ai-usage-meter.component';
import { InkDayPassComponent } from '../../core/components/ink-day-pass/ink-day-pass.component';

interface CastMember {
  id: string;
  name: string;
  avatar_image_url: string | null;
}

interface ChatAvatar {
  id: string;
  name: string;
  book_title?: string;
  book_slug?: string;
  description?: string;
  avatar_image_url?: string | null;
  greeting_message?: string;
  remaining_messages?: number;
  /** Solo con sesión (GET ai/avatars/<id>/). */
  can_chat?: boolean;
  owned?: boolean;
  book_is_free?: boolean;
  cast?: CastMember[];
}

interface ChatLine {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Conversación con un personaje, lista para usarse en cualquier lugar (hoy, la ventana rápida).
 * Con sesión: historial y envío con plan o Tinta (SubscriptionService.sendChat). Sin sesión: la
 * demo de pocos mensajes. Si el libro no está en la biblioteca, ofrece agregarlo en un toque.
 */
@Component({
  selector: 'app-character-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, AIUsageMeterComponent, InkDayPassComponent],
  templateUrl: './character-chat.component.html',
  styleUrl: './character-chat.component.css',
})
export class CharacterChatComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly subscriptions = inject(SubscriptionService);

  /** Mostrar el botón de ampliar a la página completa del chat. */
  @Input() canExpand = true;
  @Input() set avatarId(id: string | null) {
    if (id && id !== this.currentId) this.load(id);
  }
  /** Mensaje que queda escrito en el campo al abrir, sin enviarse (p. ej., una cita del lector). */
  @Input() set initialDraft(text: string | null | undefined) {
    this.startDraft = text || '';
    this.draft = this.startDraft;
    if (this.startDraft) this.afterRender();
  }
  private startDraft = '';

  @Output() closed = new EventEmitter<void>();
  @Output() expand = new EventEmitter<string>();
  @Output() pick = new EventEmitter<string>();

  @ViewChild('feed') private feed?: ElementRef<HTMLElement>;
  @ViewChild('input') private inputEl?: ElementRef<HTMLTextAreaElement>;

  currentId = '';
  avatar: ChatAvatar | null = null;
  messages: ChatLine[] = [];
  sessionId: string | null = null;
  state: 'loading' | 'ready' | 'needs-library' | 'error' = 'loading';
  error = '';
  draft = '';
  isSending = false;
  isAdding = false;
  /** Modo demo (sin sesión): mensajes que quedan. */
  remaining: number | null = null;
  /** Sin plan ni pase: se ofrece el pase del día aquí mismo y el mensaje espera en el campo. */
  offerPass: AIUsage | null = null;

  private loadSub?: Subscription;

  get isDemo(): boolean {
    return !this.auth.isLoggedIn();
  }

  get limitReached(): boolean {
    return this.isDemo && this.remaining !== null && this.remaining <= 0;
  }

  trackLine = (index: number) => index;
  trackCast = (_: number, member: CastMember) => member.id;

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
  }

  private load(id: string): void {
    this.loadSub?.unsubscribe();
    this.currentId = id;
    this.avatar = null;
    this.messages = [];
    this.sessionId = null;
    this.error = '';
    this.draft = this.startDraft;
    this.isSending = false;
    this.offerPass = null;
    this.state = 'loading';

    if (this.isDemo) {
      this.loadSub = this.api.get<ChatAvatar>(`ai/demo-chat/?avatar_id=${id}`).subscribe({
        next: avatar => {
          this.avatar = avatar;
          this.remaining = 0;
          this.messages = avatar.greeting_message ? [{ role: 'assistant', content: avatar.greeting_message }] : [];
          this.state = 'ready';
          this.afterRender();
        },
        error: () => this.fail('No pudimos encontrar a este personaje.'),
      });
      return;
    }

    // El personaje y la sesión se piden a la vez (antes iban uno tras otro): una espera menos.
    const session$ = this.api.get<{ id: string }>(`ai/sessions/?avatar_id=${id}`).pipe(catchError(() => of(null)));
    this.loadSub = forkJoin({ avatar: this.api.get<ChatAvatar>(`ai/avatars/${id}/`), session: session$ }).pipe(
      switchMap(({ avatar, session }) => {
        this.avatar = avatar;
        if (avatar.can_chat === false) return of('needs-library' as const);
        if (!session) return of('error' as const);
        this.sessionId = String(session.id);
        return this.api.get<ChatLine[]>(`ai/sessions/${session.id}/messages/`);
      }),
    ).subscribe({
      next: lines => {
        if (lines === 'needs-library') {
          this.state = 'needs-library';
          return;
        }
        if (lines === 'error') {
          this.fail('No pudimos abrir esta conversación. Intenta de nuevo.');
          return;
        }
        this.messages = (Array.isArray(lines) ? lines : []).map(line => ({ role: line.role, content: line.content }));
        this.state = 'ready';
        this.afterRender();
      },
      error: err => this.fail(err?.error?.detail || err?.error?.error || 'No pudimos abrir esta conversación.'),
    });
  }

  private openSession(id: string): void {
    this.loadSub = this.api.get<{ id: string }>(`ai/sessions/?avatar_id=${id}`).pipe(
      switchMap(session => {
        this.sessionId = String(session.id);
        return this.api.get<ChatLine[]>(`ai/sessions/${session.id}/messages/`);
      }),
    ).subscribe({
      next: lines => {
        this.messages = (Array.isArray(lines) ? lines : []).map(line => ({ role: line.role, content: line.content }));
        this.state = 'ready';
        this.afterRender();
      },
      error: err => {
        if (err?.status === 403) this.state = 'needs-library';
        else this.fail(err?.error?.error || 'No pudimos abrir esta conversación.');
      },
    });
  }

  /** Obra gratuita fuera de la biblioteca: se agrega y la conversación sigue ahí mismo. */
  addBookAndChat(): void {
    const slug = this.avatar?.book_slug;
    if (!slug || this.isAdding) return;
    this.isAdding = true;
    this.api.post<any>(`catalog/books/${slug}/purchase/`, {}).subscribe({
      next: () => {
        this.isAdding = false;
        this.openSession(this.currentId);
      },
      error: err => {
        this.isAdding = false;
        // "Ya posees este libro" también sirve: se abre la conversación igual.
        if (err?.status === 400 && /posees/i.test(err?.error?.error || '')) this.openSession(this.currentId);
        else this.error = err?.error?.message || err?.error?.error || 'No se pudo agregar el libro.';
      },
    });
  }

  send(): void {
    if (this.isDemo) return;
    const text = this.draft.trim();
    if (!text || this.isSending || this.state !== 'ready') return;
    if (!this.sessionId) return;
    this.error = '';
    this.messages.push({ role: 'user', content: text });
    this.draft = '';
    this.isSending = true;
    this.afterRender();

    const request = this.isDemo
      ? this.api.post<any>('ai/demo-chat/', { message: text, avatar_id: this.currentId })
      : this.subscriptions.sendChat(this.sessionId!, text);
    request.subscribe({
      next: res => {
        this.isSending = false;
        this.messages.push({ role: 'assistant', content: res.reply });
        if (this.isDemo) this.remaining = res.remaining_messages ?? 0;
        this.afterRender();
      },
      error: err => {
        this.isSending = false;
        if (this.isDemo && err?.error?.error === 'DEMO_LIMIT_REACHED') {
          this.remaining = 0;
          this.messages.push({ role: 'assistant', content: err.error.message });
          this.afterRender();
          return;
        }
        // Con cuenta, el mensaje vuelve al campo para reintentarlo (el cobro no se duplica).
        this.messages.pop();
        this.draft = text;
        if (err?.needsPass) {
          this.offerPass = err.usage;
          this.afterRender();
          return;
        }
        this.error = err?.error?.message || 'No llegó la respuesta. Intenta de nuevo; no se duplicará el cobro.';
      },
    });
  }

  /** Pase activado: el mensaje que esperaba en el campo se envía solo. */
  onPassActivated(): void {
    this.offerPass = null;
    this.send();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  /** El campo crece con el texto hasta unas 5 líneas. */
  autosize(): void {
    const el = this.inputEl?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    const full = el.scrollHeight + 2; // + bordes (box-sizing: border-box)
    el.style.height = `${Math.min(full, 132)}px`;
    el.style.overflowY = full > 132 ? 'auto' : 'hidden';
  }

  private fail(message: string): void {
    this.state = 'error';
    this.error = message;
  }

  private afterRender(): void {
    setTimeout(() => {
      const feed = this.feed?.nativeElement;
      if (feed) feed.scrollTop = feed.scrollHeight;
      this.autosize();
    });
  }
}
