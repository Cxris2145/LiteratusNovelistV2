import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService, userStorageKey } from '../../core/services/auth.service';

export interface CharacterConversation {
  sessionId?: string;
  avatarId: string;
  name: string;
  bookTitle: string;
  bookSlug?: string;
  avatarUrl: string;
  lastMessage: string;
  lastMessageRole?: string;
  rawTimestamp?: string;
  timestamp: string;
  unread: boolean;
  tag: string;
}

export interface SystemNotice {
  id: string;
  title: string;
  content: string;
  category: 'ink' | 'book' | 'event';
  timestamp: string;
  unread: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

@Component({
  selector: 'app-messages',
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.css']
})
export class MessagesComponent implements OnInit {
  private api = inject(ApiService);
  public authService = inject(AuthService);
  private router = inject(Router);

  activeTab: 'characters' | 'notices' = 'characters';
  searchTerm = '';
  isLoading = true;

  conversations: CharacterConversation[] = [];
  notices: SystemNotice[] = [];

  get unreadCharactersCount(): number {
    return this.conversations.filter(c => c.unread).length;
  }

  get unreadNoticesCount(): number {
    return this.notices.filter(n => n.unread).length;
  }

  get filteredConversations(): CharacterConversation[] {
    if (!this.searchTerm.trim()) return this.conversations;
    const q = this.searchTerm.toLowerCase().trim();
    return this.conversations.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.bookTitle.toLowerCase().includes(q) ||
      c.lastMessage.toLowerCase().includes(q)
    );
  }

  ngOnInit(): void {
    this.loadConversations();
    this.loadNotices();
  }

  loadConversations(): void {
    this.isLoading = true;

    if (!this.authService.isLoggedIn()) {
      this.conversations = [];
      this.isLoading = false;
      this.syncUnreadCount();
      return;
    }

    this.api.get<any[]>('ai/conversations/').subscribe({
      next: (res) => {
        const rawList = Array.isArray(res) ? res : [];
        this.buildConversations(rawList);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error cargando conversaciones de usuario', err);
        this.conversations = [];
        this.isLoading = false;
        this.syncUnreadCount();
      }
    });
  }

  private buildConversations(rawList: any[]): void {
    const readConvMap = this.getReadConversationsMap();

    this.conversations = rawList.map(item => {
      const avatarId = item.avatar_id;
      const rawTime = item.timestamp;
      const lastRead = readConvMap[avatarId];

      let isUnread = false;
      if (!lastRead) {
        isUnread = item.last_message_role === 'assistant';
      } else if (lastRead === 'all') {
        isUnread = false;
      } else {
        const lastReadDate = new Date(lastRead);
        const msgDate = new Date(rawTime);
        isUnread = item.last_message_role === 'assistant' && msgDate > lastReadDate;
      }

      return {
        sessionId: item.session_id,
        avatarId: avatarId,
        name: item.name,
        bookTitle: item.book_title || 'Literatura Universal',
        bookSlug: item.book_slug,
        avatarUrl: item.avatar_url || 'assets/default_avatar.png',
        lastMessage: item.last_message || 'Diálogo iniciado.',
        lastMessageRole: item.last_message_role || 'assistant',
        rawTimestamp: rawTime,
        timestamp: this.formatRelativeTime(rawTime),
        unread: isUnread,
        tag: item.tag || 'Personaje IA'
      };
    });

    this.syncUnreadCount();
  }

  loadNotices(): void {
    // Avisos legítimos del sistema y catálogo (sin Tinta inventada)
    const baseSystemNotices: SystemNotice[] = [
      {
        id: 'sys-catalog-1',
        title: '¡Nueva edición agregada al catálogo!',
        content: 'Ya se encuentra disponible la edición anotada con acompañamiento IA de "La Divina Comedia" de Dante Alighieri.',
        category: 'book',
        timestamp: 'Reciente',
        unread: true,
        actionUrl: '/catalog',
        actionLabel: 'Explorar Catálogo'
      },
      {
        id: 'sys-reader-1',
        title: 'Actualización del Lector Inmersivo',
        content: 'Hemos añadido nuevos modos de visualización tipográfica sepia y sincronización de audiolibros.',
        category: 'event',
        timestamp: 'Reciente',
        unread: false
      }
    ];

    if (!this.authService.isLoggedIn()) {
      this.applyReadStateToNotices(baseSystemNotices);
      return;
    }

    // Consultamos el historial real de Tinta para avisar únicamente sobre recompensas reales recibidas
    this.api.get<any[]>('library/ink-history/').subscribe({
      next: (txs) => {
        const rewardNotices: SystemNotice[] = [];
        if (Array.isArray(txs)) {
          const rewards = txs.filter(t => t.amount > 0).slice(0, 10);
          for (const tx of rewards) {
            rewardNotices.push(this.mapTransactionToNotice(tx));
          }
        }
        const allNotices = [...rewardNotices, ...baseSystemNotices];
        this.applyReadStateToNotices(allNotices);
      },
      error: () => {
        this.applyReadStateToNotices(baseSystemNotices);
      }
    });
  }

  private mapTransactionToNotice(tx: any): SystemNotice {
    let title = 'Recompensa de Tinta';
    let content = `Has recibido +${tx.amount} gotas de Tinta en tu saldo.`;
    let actionUrl: string | undefined = undefined;
    let actionLabel: string | undefined = undefined;

    switch (tx.concept) {
      case 'daily_reward':
        title = '¡Bono Diario de Tinta Reclamado!';
        content = `Has recibido tu bonificación de +${tx.amount} gotas de Tinta diaria en La Taberna.`;
        actionUrl = '/tavern';
        actionLabel = 'Ir a La Taberna';
        break;
      case 'achievement_unlocked':
      case 'achievement':
        title = '¡Logro Desbloqueado!';
        content = `Has obtenido +${tx.amount} gotas de Tinta por tus hazañas de lectura.`;
        actionUrl = '/achievements';
        actionLabel = 'Ver Logros';
        break;
      case 'chapter_read':
        title = 'Recompensa por Lectura';
        content = `Has ganado +${tx.amount} de Tinta por avanzar en un capítulo.`;
        break;
      case 'book_completed':
        title = 'Recompensa por Completar Obra';
        content = `¡Gran lector! Has ganado +${tx.amount} de Tinta por terminar un libro completo.`;
        break;
      case 'daily_enigma':
        title = 'Recompensa de El Enigma';
        content = `Has obtenido +${tx.amount} de Tinta por resolver el enigma literario.`;
        actionUrl = '/games/enigma';
        actionLabel = 'El Enigma';
        break;
      case 'ink_purchase':
        title = 'Recarga de Tinta Confirmada';
        content = `Se han acreditado +${tx.amount} de Tinta a tu saldo.`;
        break;
      case 'ad_reward':
        title = 'Tinta por Anuncio';
        content = `Has recibido +${tx.amount} de Tinta por apoyar la plataforma.`;
        break;
      case 'subscription_bonus':
        title = 'Bonificación de Membresía';
        content = `Has recibido tu recarga mensual de +${tx.amount} de Tinta por tu suscripción activa.`;
        actionUrl = '/planes';
        actionLabel = 'Ver Membresía';
        break;
    }

    return {
      id: `ink-${tx.id}`,
      title,
      content,
      category: 'ink',
      timestamp: this.formatRelativeTime(tx.created_at),
      unread: true,
      actionUrl,
      actionLabel
    };
  }

  private applyReadStateToNotices(allNotices: SystemNotice[]): void {
    const readNoticeIds = this.getReadNoticeIds();
    this.notices = allNotices.map(n => ({
      ...n,
      unread: !readNoticeIds.includes(n.id)
    }));
    this.syncUnreadCount();
  }

  openChat(conv: CharacterConversation): void {
    if (conv.unread) {
      conv.unread = false;
      const readMap = this.getReadConversationsMap();
      readMap[conv.avatarId] = new Date().toISOString();
      localStorage.setItem(userStorageKey('literatus_read_conversations'), JSON.stringify(readMap));
      this.syncUnreadCount();
    }
    this.router.navigate(['/demo-chat', conv.avatarId]);
  }

  markNoticeAsRead(notice: SystemNotice): void {
    if (notice.unread) {
      notice.unread = false;
      const readNoticeIds = this.getReadNoticeIds();
      if (!readNoticeIds.includes(notice.id)) {
        readNoticeIds.push(notice.id);
        localStorage.setItem(userStorageKey('literatus_read_notices'), JSON.stringify(readNoticeIds));
      }
      this.syncUnreadCount();
    }
  }

  markAllAsRead(): void {
    this.conversations.forEach(c => c.unread = false);
    const readMap = this.getReadConversationsMap();
    this.conversations.forEach(c => {
      readMap[c.avatarId] = new Date().toISOString();
    });
    localStorage.setItem(userStorageKey('literatus_read_conversations'), JSON.stringify(readMap));

    this.notices.forEach(n => n.unread = false);
    const readNoticeIds = this.getReadNoticeIds();
    this.notices.forEach(n => {
      if (!readNoticeIds.includes(n.id)) {
        readNoticeIds.push(n.id);
      }
    });
    localStorage.setItem(userStorageKey('literatus_read_notices'), JSON.stringify(readNoticeIds));

    this.syncUnreadCount();
  }

  goToCharactersHub(): void {
    this.router.navigate(['/characters']);
  }

  private getReadConversationsMap(): Record<string, string> {
    try {
      const raw = localStorage.getItem(userStorageKey('literatus_read_conversations'));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private getReadNoticeIds(): string[] {
    try {
      const raw = localStorage.getItem(userStorageKey('literatus_read_notices'));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private syncUnreadCount(): void {
    const totalUnread = this.unreadCharactersCount + this.unreadNoticesCount;
    localStorage.setItem(userStorageKey('literatus_unread_messages_count'), String(totalUnread));
    window.dispatchEvent(new CustomEvent('literatus-messages-updated'));
  }

  private formatRelativeTime(dateString: string): string {
    if (!dateString) return 'Reciente';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Hace un momento';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;

    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
}
