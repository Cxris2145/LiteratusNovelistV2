import { Injectable, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter, finalize, map, shareReplay, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface AssistantMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  pending?: boolean; // efecto "escribiendo..." mientras se espera la respuesta real
}

export interface AssistantConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message: string | null;
}

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Mapea el prefijo de ruta actual a una sección legible, para dar contexto al Asistente. */
const SECTION_LABELS: { prefix: string; label: string }[] = [
  { prefix: '/reader', label: 'Lector de libros' },
  { prefix: '/book/', label: 'Ficha de un libro' },
  { prefix: '/catalog', label: 'Explorar catálogo' },
  { prefix: '/categories', label: 'Categorías' },
  { prefix: '/author', label: 'Autores' },
  { prefix: '/characters', label: 'Personajes IA' },
  { prefix: '/demo-chat', label: 'Chat con personajes IA' },
  { prefix: '/tavern', label: 'La Taberna (recarga de Tinta)' },
  { prefix: '/library', label: 'Mi Biblioteca' },
  { prefix: '/favorites', label: 'Favoritos' },
  { prefix: '/messages', label: 'Mensajes con personajes' },
  { prefix: '/cart', label: 'Carrito de compras' },
  { prefix: '/checkout', label: 'Pago / Checkout' },
  { prefix: '/profile', label: 'Configuración de cuenta' },
  { prefix: '/dashboard', label: 'Panel de administración' },
];

function resolveSectionLabel(url: string): string {
  const found = SECTION_LABELS.find(s => url.startsWith(s.prefix));
  if (found) return found.label;
  if (url === '/' || url.startsWith('/home')) return 'Inicio';
  return 'Literatus Novelist';
}

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  private readonly BASE = 'ai/assistant';

  private _isOpen$ = new BehaviorSubject<boolean>(false);
  readonly isOpen$ = this._isOpen$.asObservable();

  private _isHistoryOpen$ = new BehaviorSubject<boolean>(false);
  readonly isHistoryOpen$ = this._isHistoryOpen$.asObservable();

  private _conversations$ = new BehaviorSubject<AssistantConversation[]>([]);
  readonly conversations$ = this._conversations$.asObservable();

  private _activeConversationId$ = new BehaviorSubject<string | null>(null);
  readonly activeConversationId$ = this._activeConversationId$.asObservable();

  private _messages$ = new BehaviorSubject<AssistantMessage[]>([]);
  readonly messages$ = this._messages$.asObservable();

  private _isSending$ = new BehaviorSubject<boolean>(false);
  readonly isSending$ = this._isSending$.asObservable();

  private _unreadCount$ = new BehaviorSubject<number>(0);
  readonly unreadCount$ = this._unreadCount$.asObservable();

  private _currentSection = 'Literatus Novelist';
  get currentSection(): string {
    return this._currentSection;
  }

  private hasLoadedConversations = false;
  private conversationsInFlight$: Observable<AssistantConversation[]> | null = null;

  constructor() {
    this._currentSection = resolveSectionLabel(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        this._currentSection = resolveSectionLabel(e.urlAfterRedirects);
      });
  }

  /** Punto de entrada llamado por el widget al montarse (usuario autenticado). */
  bootstrap(): void {
    const justLoggedIn = this.auth.consumeFreshLogin();
    this.loadConversations().subscribe(conversations => {
      if (justLoggedIn) {
        this.openMostRecentOrNew(conversations);
      }
    });
  }

  private openMostRecentOrNew(conversations: AssistantConversation[]): void {
    if (conversations.length > 0) {
      this.selectConversation(conversations[0]);
    } else {
      this.startNewConversation();
    }
    this._isOpen$.next(true);
  }

  toggleOpen(): void {
    const next = !this._isOpen$.value;
    this._isOpen$.next(next);
    if (next) {
      this._unreadCount$.next(0);
      if (!this.hasLoadedConversations) {
        this.loadConversations().subscribe(conversations => {
          if (!this._activeConversationId$.value) {
            if (conversations.length > 0) this.selectConversation(conversations[0]);
            else this.startNewConversation();
          }
        });
      } else if (!this._activeConversationId$.value) {
        this.startNewConversation();
      }
    }
  }

  minimize(): void {
    this._isOpen$.next(false);
  }

  close(): void {
    this._isOpen$.next(false);
    this._isHistoryOpen$.next(false);
  }

  toggleHistory(): void {
    this._isHistoryOpen$.next(!this._isHistoryOpen$.value);
  }

  loadConversations(): Observable<AssistantConversation[]> {
    if (this.conversationsInFlight$) return this.conversationsInFlight$;

    const request$ = this.api.get<Paginated<AssistantConversation>>(`${this.BASE}/conversations/?page_size=50`).pipe(
      map(res => res.results),
      tap(results => {
        this._conversations$.next(results);
        this.hasLoadedConversations = true;
      }),
      finalize(() => { this.conversationsInFlight$ = null; }),
      shareReplay(1)
    );
    this.conversationsInFlight$ = request$;
    return request$;
  }

  startNewConversation(): void {
    this.api.post<AssistantConversation>(`${this.BASE}/conversations/`, {}).subscribe({
      next: (conversation) => {
        this._conversations$.next([conversation, ...this._conversations$.value]);
        this._activeConversationId$.next(conversation.id);
        this._messages$.next([{ role: 'assistant', content: conversation.last_message || '' }]);
        this.loadMessages(conversation.id);
        this._isHistoryOpen$.next(false);
      }
    });
  }

  selectConversation(conversation: AssistantConversation): void {
    this._activeConversationId$.next(conversation.id);
    this.loadMessages(conversation.id);
    this._isHistoryOpen$.next(false);
  }

  private loadMessages(conversationId: string): void {
    this.api.get<AssistantMessage[]>(`${this.BASE}/conversations/${conversationId}/messages/`).subscribe({
      next: (messages) => this._messages$.next(messages),
      error: () => this._messages$.next([]),
    });
  }

  sendMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    let conversationId = this._activeConversationId$.value;
    if (!conversationId) {
      // Sin conversación activa: crear una primero y luego enviar.
      this.api.post<AssistantConversation>(`${this.BASE}/conversations/`, {}).subscribe({
        next: (conversation) => {
          this._conversations$.next([conversation, ...this._conversations$.value]);
          this._activeConversationId$.next(conversation.id);
          this._messages$.next([{ role: 'assistant', content: conversation.last_message || '' }]);
          this.dispatchMessage(conversation.id, trimmed);
        }
      });
      return;
    }

    this.dispatchMessage(conversationId, trimmed);
  }

  private dispatchMessage(conversationId: string, text: string): void {
    const userMsg: AssistantMessage = { role: 'user', content: text };
    const typingMsg: AssistantMessage = { role: 'assistant', content: '', pending: true };
    this._messages$.next([...this._messages$.value, userMsg, typingMsg]);
    this._isSending$.next(true);

    this.api.post<any>(`${this.BASE}/chat/`, {
      conversation_id: conversationId,
      message: text,
      section: this._currentSection,
    }).subscribe({
      next: (res) => {
        const current = [...this._messages$.value];
        current.pop(); // quitar el indicador de "escribiendo"
        current.push({ role: 'assistant', content: res.reply, created_at: res.timestamp });
        this._messages$.next(current);
        this._isSending$.next(false);
        if (!this._isOpen$.value) this._unreadCount$.next(this._unreadCount$.value + 1);

        // Refleja el título auto-generado (primer mensaje) en la lista de conversaciones.
        const conversations = this._conversations$.value.map(c =>
          c.id === conversationId ? { ...c, title: res.conversation_title, last_message: res.reply } : c
        );
        this._conversations$.next(conversations);
      },
      error: () => {
        const current = [...this._messages$.value];
        current.pop();
        current.push({ role: 'assistant', content: 'No pude responder en este momento. Intenta de nuevo en unos segundos.' });
        this._messages$.next(current);
        this._isSending$.next(false);
      }
    });
  }
}
