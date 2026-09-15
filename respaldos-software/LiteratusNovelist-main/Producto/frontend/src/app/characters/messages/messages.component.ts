import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ChatService, HubAvatar } from '../../core/services/chat.service';

export interface CharacterConversation {
  avatarId: string;
  name: string;
  bookTitle: string;
  bookSlug?: string;
  avatarUrl: string;
  lastMessage: string;
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
  private chatService = inject(ChatService);
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

    // Consultamos los avatares disponibles en el hub de IA
    this.api.getCached<any>('ai/hub/avatars/?sort=popularity&page_size=20', undefined, 10 * 60 * 1000).subscribe({
      next: (res) => {
        const avatars: HubAvatar[] = Array.isArray(res) ? res : (res?.results || []);
        this.buildConversations(avatars);
        this.isLoading = false;
      },
      error: () => {
        this.buildConversations([]);
        this.isLoading = false;
      }
    });
  }

  private buildConversations(avatars: HubAvatar[]): void {
    const predefinedTemplates: Record<string, { lastMessage: string; time: string; unread: boolean; tag: string }> = {
      'sherlock': {
        lastMessage: 'El juego ha comenzado, querido amigo. He examinado el último capítulo y tengo una hipótesis fascinante que compartirte...',
        time: 'Hace 12 min',
        unread: true,
        tag: 'Misterio & Lógica'
      },
      'quijote': {
        lastMessage: '¡Apercíbete, noble lector! En estas páginas aguardan gigantes disfrazados de dudas que demandan nuestro coraje.',
        time: 'Hace 45 min',
        unread: true,
        tag: 'Aventura Caballeresca'
      },
      'poe': {
        lastMessage: 'En la penumbra de la medianoche, las palabras cobran un eco que jamás perecerá. ¿Qué secretos guardas bajo tu mirada?',
        time: 'Hace 2 horas',
        unread: false,
        tag: 'Gótico & Terror'
      },
      'alicia': {
        lastMessage: '¿Sabías que a veces pienso en seis cosas imposibles antes del desayuno? Dime, ¿qué acertijo estás descifrando hoy?',
        time: 'Ayer',
        unread: false,
        tag: 'Fantasía Curiosa'
      },
      'dracula': {
        lastMessage: 'Escuchadlos... los hijos de la noche. ¡Qué hermosa melodía entonan! Bienvenidos seáis a mi biblioteca de sombras eternas.',
        time: 'Hace 2 días',
        unread: false,
        tag: 'Gótico Clásico'
      }
    };

    const convList: CharacterConversation[] = [];

    // Si tenemos avatares de backend, los sincronizamos
    if (avatars.length > 0) {
      for (const av of avatars.slice(0, 8)) {
        const nameKey = av.name.toLowerCase();
        let matched = Object.entries(predefinedTemplates).find(([k]) => nameKey.includes(k));

        convList.push({
          avatarId: av.id,
          name: av.name,
          bookTitle: av.book_title || 'Literatura Universal',
          bookSlug: av.book_slug || undefined,
          avatarUrl: av.avatar_image_url || 'assets/default_avatar.png',
          lastMessage: matched ? matched[1].lastMessage : `Saludos, lector. Es un honor coincidir entre las páginas de ${av.book_title || 'este relato'}. ¿En qué punto de la trama te encuentras?`,
          timestamp: matched ? matched[1].time : 'Reciente',
          unread: matched ? matched[1].unread : false,
          tag: matched ? matched[1].tag : (av.tags?.[0] || 'Personaje IA')
        });
      }
    }

    // Si por alguna razón la API devolvió menos, completamos con los canónicos
    if (convList.length === 0) {
      convList.push(
        {
          avatarId: 'sherlock-holmes',
          name: 'Sherlock Holmes',
          bookTitle: 'Estudio en Escarlata',
          avatarUrl: 'assets/default_avatar.png',
          lastMessage: 'El juego ha comenzado, querido amigo. He examinado el último capítulo y tengo una hipótesis fascinante que compartirte...',
          timestamp: 'Hace 12 min',
          unread: true,
          tag: 'Misterio & Deducción'
        },
        {
          avatarId: 'don-quijote',
          name: 'Don Quijote de la Mancha',
          bookTitle: 'El Ingenioso Hidalgo',
          avatarUrl: 'assets/default_avatar.png',
          lastMessage: '¡Apercíbete, noble lector! En estas páginas aguardan gigantes disfrazados de dudas que demandan nuestro coraje.',
          timestamp: 'Hace 45 min',
          unread: true,
          tag: 'Aventura Épica'
        },
        {
          avatarId: 'edgar-allan-poe',
          name: 'Edgar Allan Poe',
          bookTitle: 'Cuentos de lo Grotesco',
          avatarUrl: 'assets/default_avatar.png',
          lastMessage: 'En la penumbra de la medianoche, las palabras cobran un eco que jamás perecerá. ¿Qué secretos guardas bajo tu mirada?',
          timestamp: 'Hace 2 horas',
          unread: false,
          tag: 'Terror Gótico'
        }
      );
    }

    this.conversations = convList;
  }

  loadNotices(): void {
    this.notices = [
      {
        id: '1',
        title: '¡Nueva edición agregada al catálogo!',
        content: 'Ya se encuentra disponible la edición anotada con acompañamiento IA de "La Divina Comedia" de Dante Alighieri.',
        category: 'book',
        timestamp: 'Hoy, 10:30',
        unread: true,
        actionUrl: '/catalog',
        actionLabel: 'Explorar Catálogo'
      },
      {
        id: '2',
        title: 'Bono diario de Tinta en La Taberna',
        content: 'Has recibido tu bonificación de tinta diaria para dialogar con los personajes clásicos en la taberna.',
        category: 'ink',
        timestamp: 'Ayer',
        unread: false,
        actionUrl: '/tavern',
        actionLabel: 'Ir a La Taberna'
      },
      {
        id: '3',
        title: 'Actualización del Lector Inmersivo',
        content: 'Hemos añadido nuevos modos de visualización tipográfica sepia y sincronización de audiolibros.',
        category: 'event',
        timestamp: 'Hace 3 días',
        unread: false
      }
    ];
  }

  openChat(conv: CharacterConversation): void {
    conv.unread = false;
    this.router.navigate(['/demo-chat', conv.avatarId]);
  }

  markAllAsRead(): void {
    this.conversations.forEach(c => c.unread = false);
    this.notices.forEach(n => n.unread = false);
  }

  goToCharactersHub(): void {
    this.router.navigate(['/characters']);
  }
}
