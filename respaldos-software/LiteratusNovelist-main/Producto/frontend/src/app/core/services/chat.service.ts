import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, Subject } from 'rxjs';
import { catchError, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/** Tamaño de página del hub de personajes (el backend admite hasta 50). */
export const HUB_PAGE_SIZE = 48;

/** Un personaje tal y como lo devuelve GlobalHubAvatarSerializer. */
export interface HubAvatar {
  id: string;                        // UUID
  name: string;
  book_title: string | null;
  book_slug: string | null;
  description: string;
  avatar_image_url: string | null;   // null mientras no tenga retrato generado
  tags: string[];
  trend_level: string;
  chat_count: number;
}

/** Envoltorio de DRF PageNumberPagination. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  isTyping?: boolean; // Para el efecto typing en la UI
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly API_URL = `${environment.apiUrl}ai`;

  // Estado global reactivo
  private inkBalanceSubject = new BehaviorSubject<number>(0);
  public inkBalance$ = this.inkBalanceSubject.asObservable();

  private profileUpdatedSubject = new Subject<void>();
  public profileUpdated$ = this.profileUpdatedSubject.asObservable();

  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  constructor(private http: HttpClient) {}

  notifyProfileUpdate() {
    this.profileUpdatedSubject.next();
  }

  // Obtener perfil completo
  getUserProfile(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}users/profile/`);
  }

  private isFetchingInk = false;

  // Carga inicial del balance desde el perfil
  loadInitialInk() {
    if (this.isFetchingInk) return;
    
    this.isFetchingInk = true;
    this.http.get<any>(`${environment.apiUrl}users/profile/`).subscribe({
      next: (profile) => {
        if (profile && profile.ink_balance !== undefined) {
          this.inkBalanceSubject.next(profile.ink_balance);
        }
        this.isFetchingInk = false;
      },
      error: (err) => {
        console.error("Error cargando balance inicial", err);
        this.isFetchingInk = false;
      }
    });
  }

  updateInkBalance(balance: number) {
    this.inkBalanceSubject.next(balance);
  }

  // Desencadena una animación en el navbar
  triggerInkAnimation() {
    // Aquí podríamos inyectar un estado temporal para la animación,
    // o simplemente el componente escucha los cambios del BehaviorSubject.
  }

  // Carga el historial de una sesión
  loadSessionMessages(sessionId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.API_URL}/sessions/${sessionId}/messages/`).pipe(
      tap(messages => this.messagesSubject.next(messages))
    );
  }

  // Iniciar o recuperar sesión con un personaje
  getSession(avatarId: number): Observable<any> {
    return this.http.get(`${this.API_URL}/sessions/?avatar_id=${avatarId}`);
  }

  // Primera página cacheada por orden, para que volver al hub no re-descargue.
  private firstPageCache = new Map<string, Observable<Paginated<HubAvatar>>>();

  /**
   * Una página del catálogo global de personajes.
   *
   * El backend pagina; el hub encadena páginas con scroll infinito en lugar de
   * traerse los ~4.500 registros de una sola vez, que era lo que bloqueaba la
   * página. Se usa HttpClient directo (no ApiService) a propósito: así la URL no
   * lleva el cache-buster `_t=` y la respuesta sí es cacheable.
   */
  getGlobalAvatars(
    query: string = '',
    sort: string = '',
    page: number = 1,
    pageSize: number = HUB_PAGE_SIZE
  ): Observable<Paginated<HubAvatar>> {
    const cacheKey = `${sort}|${pageSize}`;
    const cacheable = !query && page === 1;
    if (cacheable) {
      const hit = this.firstPageCache.get(cacheKey);
      if (hit) return hit;
    }

    let params = new HttpParams()
      .set('q', query)
      .set('page', page)
      .set('page_size', pageSize);
    if (sort) params = params.set('sort', sort);

    let request$ = this.http.get<Paginated<HubAvatar>>(`${this.API_URL}/hub/avatars/`, { params });

    if (cacheable) {
      request$ = request$.pipe(
        // Un fallo no debe quedarse pegado en la caché: se descarta la entrada
        // para que el siguiente intento vuelva a pedirlo.
        catchError(err => {
          this.firstPageCache.delete(cacheKey);
          return throwError(() => err);
        }),
        shareReplay(1)
      );
      this.firstPageCache.set(cacheKey, request$);
    }

    return request$;
  }

  // Obtener un avatar por ID (la PK de AIAvatar es un UUID, no un entero)
  getAvatar(id: string): Observable<any> {
    return this.http.get<any>(`${this.API_URL}/avatars/${id}/`);
  }

  // Obtener personajes recientes
  getRecentAvatars(): Observable<HubAvatar[]> {
    return this.http.get<HubAvatar[]>(`${this.API_URL}/hub/recent/`);
  }

  // Enviar mensaje y manejar respuesta reactiva
  sendMessage(sessionId: string, text: string): Observable<any> {
    const userMsg: ChatMessage = { role: 'user', content: text };
    // Actualizar UI optimísticamente
    this.messagesSubject.next([...this.messagesSubject.value, userMsg]);

    // Añadir mensaje "vaciado" para el typing effect
    const tempAssistantMsg: ChatMessage = { role: 'assistant', content: '', isTyping: true };
    this.messagesSubject.next([...this.messagesSubject.value, tempAssistantMsg]);

    return this.http.post(`${this.API_URL}/chat/`, { session_id: sessionId, message: text }).pipe(
      tap((res: any) => {
        // Actualizar tinta
        if (res.ink_balance !== undefined) {
          this.inkBalanceSubject.next(res.ink_balance);
        }
        
        // Reemplazar mensaje temporal con la respuesta real
        const currentMessages = this.messagesSubject.value;
        currentMessages.pop(); // quitar tempAssistantMsg
        currentMessages.push({
          role: 'assistant',
          content: res.reply,
          created_at: res.timestamp
        });
        this.messagesSubject.next([...currentMessages]);
      }),
      catchError(err => {
        // Eliminar mensaje temporal en caso de error
        const currentMessages = this.messagesSubject.value;
        currentMessages.pop();
        this.messagesSubject.next([...currentMessages]);

        if (err.status === 402) {
          // Manejo específico de falta de tinta
          console.error("Sin tinta disponible", err.error);
        }
        return throwError(() => err);
      })
    );
  }
}
